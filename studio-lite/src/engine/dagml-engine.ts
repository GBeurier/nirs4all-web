// DagMlEngine — the real WASM coordinator path. dag-ml's SequentialScheduler
// (compiled to WASM) executes the cross-validation: it owns the fold loop, the
// leakage-safe OOF assembly (by sampleId) and lineage, and invokes a JS
// controller per fold that runs the actual preprocessing + PLS via libn4m WASM.
// The refit (full-train) model is fit directly with libn4m. Falls back to the
// JS-orchestrated path on any error.
import { loadLibn4mBackend } from './backends'
import { dagMlAvailable, loadDagMl, toCompatDsl } from './dagml'
import { materializeViaProvider } from './dagml-data'
import { buildFolds, testRowsOf, trainRowsOf } from './kfold'
import type { Mat } from './algo/linalg'
import {
  classInfo,
  decodeRows,
  type FittedState,
  type ModelBackend,
  predictPipeline,
  runPipeline,
  scoreNode,
  trainAndPredict,
} from './orchestrate'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredRow, PredictResult, RunOptions, RunResult } from './types'

const MODEL_CONTROLLER = 'controller:model'

function modelManifest() {
  return [{
    controller_id: MODEL_CONTROLLER,
    controller_version: '0.1.0',
    operator_kind: 'model',
    priority: 0,
    supported_phases: ['FIT_CV'],
    input_ports: [{ name: 'x', kind: 'data', representation: 'tabular_numeric', cardinality: 'one', description: '' }],
    output_ports: [{ name: 'oof', kind: 'prediction', representation: null, cardinality: 'one', description: '' }],
    data_requirements: null,
    capabilities: ['deterministic', 'thread_safe', 'process_safe', 'uses_core_rng', 'emits_predictions', 'consumes_oof_predictions', 'emits_artifacts', 'stateful'],
    fit_scope: 'fold_train',
    rng_policy: 'uses_core_seed',
    artifact_policy: 'serializable',
  }]
}

const matToRows = (m: Mat): number[][] => {
  const out: number[][] = []
  for (let i = 0; i < m.rows; i++) out.push(Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols)))
  return out
}

export class DagMlEngine implements Engine {
  readonly name = 'dag-ml-wasm'

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    // Served path REQUIRES libn4m — no silent JS shadow engine. A load failure
    // surfaces to the UI rather than producing numerics from a different engine.
    const backend = await loadLibn4mBackend()
    try {
      return await this.runViaDagMl(ds, dsl, opts, backend)
    } catch (err) {
      // dag-ml scheduling failed — fall back to direct orchestration, still on libn4m.
      console.warn('[dag-ml] in-browser scheduling failed, falling back to direct orchestration (libn4m):', err)
      const res = await runPipeline(ds, dsl, opts, backend)
      res.engine = `${backend.id} (dag-ml fallback)`
      return res
    }
  }

  private async runViaDagMl(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions, backend: ModelBackend): Promise<RunResult> {
    const { onProgress: onP, signal } = opts
    const task = ds.taskType

    // --- dag-ml-data: materialize X/y through the provider (the data-contract layer)
    // FIRST, so the run — and the class vocabulary below — is derived from the exact
    // feature/target blocks the provider serves (by sampleId). Degrade visibly
    // (recorded in lineage) if the provider is unavailable.
    let dataProvider: { layer: string; status: string; fingerprints?: { schema: string; plan: string; relation: string | null }; representation?: string; version?: string; error?: string } = {
      layer: 'dag-ml-data',
      status: 'unavailable',
    }
    try {
      onP?.({ phase: 'preprocess', pct: 1, message: 'materializing via dag-ml-data' })
      const served = await materializeViaProvider(ds)
      ds = { ...ds, X: served.X, y: served.y }
      dataProvider = { layer: 'dag-ml-data', status: 'materialized', fingerprints: served.fingerprints, representation: served.outputRepresentation, version: served.version }
    } catch (e) {
      dataProvider = { layer: 'dag-ml-data', status: 'unavailable', error: e instanceof Error ? e.message : String(e) }
      console.warn('[dag-ml-data] provider unavailable, using in-memory matrices:', e)
    }

    const { classNames, classIdx } = classInfo(ds)
    if (task === 'regression' && !trainRowsOf(ds).some((i) => Number.isFinite(ds.y[i]))) {
      throw new Error('No numeric targets in the training data.')
    }
    if (task !== 'regression' && classNames.length < 2) throw new Error('Classification needs ≥2 classes.')

    const dagml = await loadDagMl()
    const sidToIdx = new Map(ds.sampleIds.map((s, i) => [s, i]))

    // --- build the dag-ml fold_set from our CV folds (universe = train rows) ---
    const folds = buildFolds(ds, dsl.cv.folds, dsl.cv.seed)
    const foldIdFor = (i: number) => `fold${i}`
    const trainUniverse = trainRowsOf(ds)
    const foldSet = {
      id: 'outer',
      sample_ids: trainUniverse.map((i) => ds.sampleIds[i]),
      folds: folds.map((f, i) => ({
        fold_id: foldIdFor(i),
        train_sample_ids: f.trainIdx.map((r) => ds.sampleIds[r]),
        validation_sample_ids: f.valIdx.map((r) => ds.sampleIds[r]),
        metadata: {},
      })),
      sample_groups: {},
    }
    const foldByDagId = new Map(folds.map((f, i) => [foldIdFor(i), f]))

    // --- dag-ml compiles the pipeline DSL → graph + campaign; inject our fold_set ---
    const artifact = JSON.parse(dagml.compile_pipeline_dsl_artifact_json(JSON.stringify(toCompatDsl(dsl))))
    const graph = artifact.graph
    const campaign = artifact.campaign_template
    campaign.split_invocation.fold_set = foldSet
    campaign.root_seed = dsl.cv.seed

    // --- the JS controller: dag-ml calls this per (node, fold); we run libn4m ---
    let done = 0
    const invoke = (_controllerId: string, taskJson: string): string => {
      if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')
      const t = JSON.parse(taskJson)
      const np = t.node_plan
      // NodeTask.seed is a u64 JSON.parse would round — echo the exact digits.
      const seedMatches = [...taskJson.matchAll(/"seed":\s*(\d+|null)/g)]
      const seedRaw = seedMatches.length ? seedMatches[seedMatches.length - 1][1] : 'null'
      const fold = t.fold_id ? foldByDagId.get(t.fold_id) : null
      const valIdx = fold ? fold.valIdx : []
      const trainIdx = fold ? fold.trainIdx : trainUniverse
      const { pred } = trainAndPredict(ds, dsl, backend, trainIdx, valIdx)
      const valSampleIds = valIdx.map((r) => ds.sampleIds[r])
      const result = {
        node_id: np.node_id,
        outputs: {},
        predictions: [{
          prediction_id: `pred:${np.node_id}:${t.fold_id ?? 'nofold'}`,
          producer_node: np.node_id,
          partition: 'validation',
          fold_id: t.fold_id ?? null,
          sample_ids: valSampleIds,
          values: matToRows(pred),
          target_names: [ds.targetName],
        }],
        observation_predictions: [],
        aggregated_predictions: [],
        explanations: [],
        shape_deltas: [],
        artifacts: [],
        artifact_handles: {},
        lineage: {
          record_id: `lineage:${np.node_id}:${t.phase}:${t.variant_id ?? 'base'}:${t.fold_id ?? 'nofold'}`,
          run_id: t.run_id,
          node_id: np.node_id,
          phase: t.phase,
          controller_id: np.controller_id,
          controller_version: np.controller_version,
          variant_id: t.variant_id ?? null,
          fold_id: t.fold_id ?? null,
          branch_path: t.branch_path ?? [],
          input_lineage: [],
          artifact_refs: [],
          params_fingerprint: np.params_fingerprint,
          data_model_shape_fingerprint: null,
          aggregation_policy_fingerprint: null,
          seed: '__SEED__',
          unsafe_flags: [],
          metrics: {},
        },
      }
      done++
      onP?.({ phase: 'fit_cv', pct: 4 + Math.round((72 * done) / Math.max(1, folds.length)) })
      return JSON.stringify(result).replace('"__SEED__"', seedRaw)
    }

    // --- run FIT_CV through dag-ml's scheduler (WASM) ---
    onP?.({ phase: 'fit_cv', pct: 2 })
    const nodeResults = JSON.parse(
      dagml.execute_campaign_phase_json('plan:n4a', JSON.stringify(graph), JSON.stringify(campaign), JSON.stringify(modelManifest()), 'run:n4a', dsl.cv.seed >>> 0, 'FIT_CV', invoke),
    ) as { predictions?: { partition: string; fold_id: string | null; sample_ids: string[]; values: number[][] }[]; lineage?: unknown }[]

    // --- assemble OOF PredRows from dag-ml's returned validation predictions ---
    const oof: PredRow[] = []
    const foldNodes = folds.map((_, i) => ({ id: foldIdFor(i), rows: [] as PredRow[] }))
    const foldNodeById = new Map(foldNodes.map((n) => [n.id, n]))
    for (const nr of nodeResults) {
      for (const blk of nr.predictions ?? []) {
        if (blk.partition !== 'validation') continue
        const idx = blk.sample_ids.map((s) => sidToIdx.get(s)!).filter((v) => v !== undefined)
        const predMat: Mat = { data: Float64Array.from(blk.values.flat()), rows: blk.sample_ids.length, cols: blk.values[0]?.length ?? 1 }
        const rows = decodeRows(ds, classNames, classIdx, predMat, idx)
        oof.push(...rows)
        if (blk.fold_id && foldNodeById.has(blk.fold_id)) foldNodeById.get(blk.fold_id)!.rows.push(...rows)
      }
    }
    if (oof.length === 0) throw new Error('dag-ml produced no OOF predictions')

    const cvNode = scoreNode('cv', 'CV Scores', 'cv', oof, task, classNames)
    const foldScoreNodes = foldNodes.map((n, i) => scoreNode(`fold-${i + 1}`, `Fold ${i + 1}`, 'fold', n.rows, task, classNames))

    // --- refit on the full training set, score on test (or train), via libn4m ---
    onP?.({ phase: 'refit', pct: 84 })
    const trainIdx = trainUniverse
    const testIdx = testRowsOf(ds)
    const scoreIdx = testIdx.length > 0 ? testIdx : trainIdx
    const { pred: refitPred, descriptors, model } = trainAndPredict(ds, dsl, backend, trainIdx, scoreIdx)
    const refitRows = decodeRows(ds, classNames, classIdx, refitPred, scoreIdx)
    const refitNode = scoreNode('refit', testIdx.length > 0 ? 'Refit · test' : 'Refit · train', 'refit', refitRows, task, classNames)

    onP?.({ phase: 'done', pct: 100 })
    const fitted: FittedPipeline = {
      dsl,
      taskType: task,
      nFeatures: ds.nFeatures,
      classes: classNames.length ? classNames : undefined,
      state: { chain: descriptors, model, classNames: classNames.length ? classNames : undefined, backendId: backend.id } as FittedState,
    }
    return {
      id: `run-${Date.now().toString(36)}`,
      pipelineName: dsl.name,
      taskType: task,
      targetName: ds.targetName,
      refit: refitNode,
      cv: cvNode,
      folds: foldScoreNodes,
      seed: dsl.cv.seed,
      engine: 'dag-ml-wasm + libn4m',
      scoreMetric: task === 'regression' ? 'rmse' : 'accuracy',
      lineage: { engine: 'dag-ml-wasm', compiled: true, executed: true, phase: 'FIT_CV', nodeResults: nodeResults.map((n) => n.lineage), folds: folds.length, version: dagml.dag_ml_version(), dataProvider },
      model: fitted,
      createdAt: new Date().toISOString(),
    }
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    const backend = await loadLibn4mBackend()
    return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
  }
}

export const dagMlExecAvailable = dagMlAvailable
