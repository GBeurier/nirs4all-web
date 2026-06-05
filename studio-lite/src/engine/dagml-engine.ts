// DagMlEngine — the real WASM coordinator path. dag-ml's SequentialScheduler
// (compiled to WASM) executes the cross-validation: it owns the fold loop, the
// leakage-safe OOF assembly (by sampleId) and lineage, and invokes a JS
// controller per fold that runs the actual preprocessing + PLS via libn4m WASM.
// The refit (full-train) model is fit directly with libn4m. Falls back to the
// JS-orchestrated path on any error.
import { loadLibn4mBackend } from './backends'
import { countVariants, dagMlAvailable, loadDagMl, toCompatDsl } from './dagml'
import { materializeViaProvider } from './dagml-data'
import type { Fold } from './kfold'
import { testRowsOf, trainRowsOf } from './partition'
import type { Mat } from './algo/linalg'
import {
  classInfo,
  decodeRows,
  type FittedState,
  type ModelBackend,
  predictPipeline,
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

// --- variant plumbing (dag-ml is authoritative for enumeration + selection) ---
type ParamOverride = { node_id: string; params: Record<string, unknown> }
type VariantChoice = { label: string; value?: unknown; param_overrides: ParamOverride[] }
type VariantPlan = { variant_id: string; choices: Record<string, VariantChoice>; fingerprint: string; seed?: number }

/**
 * Map a studio-lite element (a preprocessing step, by index, or the model) to the
 * compat node_id dag-ml mints for it. dag-ml's compat importer mints one id per
 * operator step from a SINGLE `node_counter` (dsl.rs `next_node_id` / 2486–2490),
 * advancing it for EVERY operator step — including bare string sugar like `"SNV"`
 * / `"MSC"`, which still lowers to a `transform:compat.N` Transform step
 * (dsl.rs:1120–1141 String branch → `compat_operator_step` → `next_node_id`). The
 * prefix is keyword-derived (`transform` for preprocessing, `model` for the
 * model — dsl.rs `compat_node_prefix`/2806) but the counter is shared, so the
 * model's id is `model:compat.<#preprocessing-steps>`. We must mirror that count
 * EXACTLY (every step, bare or not) or a sweep on a step after a bare SNV/MSC
 * would target the wrong node when overrides are applied back.
 */
export function compatNodeIds(dsl: PipelineDSL): { stepIds: string[]; modelId: string } {
  let k = 0
  const stepIds = dsl.steps.map(() => `transform:compat.${k++}`)
  return { stepIds, modelId: `model:compat.${k}` }
}

/** Apply a variant's param_overrides → a new effective PipelineDSL (deep-ish copy of the touched params). */
function effectiveDsl(dsl: PipelineDSL, variant: VariantPlan): PipelineDSL {
  const overrides = new Map<string, Record<string, unknown>>()
  for (const choice of Object.values(variant.choices)) {
    for (const ov of choice.param_overrides) {
      overrides.set(ov.node_id, { ...(overrides.get(ov.node_id) ?? {}), ...ov.params })
    }
  }
  if (overrides.size === 0) return dsl
  const { stepIds, modelId } = compatNodeIds(dsl)
  const steps = dsl.steps.map((s, i) => {
    const ov = stepIds[i] ? overrides.get(stepIds[i]) : undefined
    return ov ? { ...s, params: { ...s.params, ...ov } } : s
  })
  const mOv = dsl.model && overrides.get(modelId)
  const model = dsl.model && mOv ? { ...dsl.model, params: { ...dsl.model.params, ...mOv } } : dsl.model
  return { ...dsl, steps, model }
}

/** Human-readable label for a variant from its param overrides (e.g. "n_components=5"). */
function variantLabel(variant: VariantPlan): string {
  const parts: string[] = []
  for (const choice of Object.values(variant.choices)) {
    for (const ov of choice.param_overrides) {
      for (const [param, val] of Object.entries(ov.params)) parts.push(`${param}=${Array.isArray(val) ? `[${val.length}]` : String(val)}`)
    }
  }
  return parts.length ? parts.join(' · ') : variant.variant_id.replace(/^variant:/, '')
}

export class DagMlEngine implements Engine {
  readonly name = 'dag-ml-wasm'

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    // A model is mandatory to score/refit — refuse early with a clear message
    // (the editor guards too, but the engine is the authoritative gate).
    if (!dsl.model) throw new Error('This pipeline has no model — add a model to run / score.')
    // Served path REQUIRES libn4m + dag-ml — no silent shadow engine. Both the
    // numerics (libn4m) and the orchestration/folds (dag-ml) are authoritative;
    // any failure surfaces to the UI rather than quietly rebuilding folds in TS
    // (kfold.ts is strictly the offline file:// fallback, via MainEngine).
    const backend = await loadLibn4mBackend()
    return this.runViaDagMl(ds, dsl, opts, backend)
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

    // --- dag-ml builds the CV fold_set (the SECOND split, over the train rows).
    // KFold for regression, stratified K-fold for classification — both OOF-safe
    // (each sample validated exactly once). The host no longer builds folds itself. ---
    const trainUniverse = trainRowsOf(ds)
    if (trainUniverse.length < 2) throw new Error('Cross-validation needs at least 2 training samples.')
    // dag-ml SampleId only allows [A-Za-z0-9_-.:]; studio sample ids can contain
    // '#' or other characters, so address dag-ml with stable row-index ids
    // (`s{row}`) and map back by index. Original ds.sampleIds stay for the UI.
    const dagId = (row: number) => `s${row}`
    const rowOfDagId = (id: string) => Number(id.slice(1))
    const nSplits = Math.max(2, Math.min(dsl.cv.folds, trainUniverse.length))
    const trainDagIds = trainUniverse.map(dagId)
    const splitSpec = JSON.stringify({ n_splits: nSplits, shuffle: true, seed: dsl.cv.seed })
    const foldSet = JSON.parse(
      task !== 'regression'
        ? dagml.stratified_kfold_split_json(
            splitSpec,
            JSON.stringify(trainDagIds),
            JSON.stringify(Object.fromEntries(trainUniverse.map((i) => [dagId(i), ds.classes?.[i] ?? String(Math.round(ds.y[i]))]))),
            'outer',
          )
        : dagml.kfold_split_json(splitSpec, JSON.stringify(trainDagIds), 'outer'),
    ) as { id: string; sample_ids: string[]; folds: { fold_id: string; train_sample_ids: string[]; validation_sample_ids: string[]; metadata?: unknown }[]; sample_groups: Record<string, string> }
    const folds = foldSet.folds
    const toIdx = (ids: string[]) => ids.map(rowOfDagId).filter((v) => Number.isInteger(v) && v >= 0)
    const foldByDagId = new Map(folds.map((f) => [f.fold_id, { trainIdx: toIdx(f.train_sample_ids), valIdx: toIdx(f.validation_sample_ids) }]))

    // --- dag-ml compiles the pipeline DSL → graph + campaign + generation ---
    const compatDsl = toCompatDsl(dsl)
    const artifact = JSON.parse(dagml.compile_pipeline_dsl_artifact_json(JSON.stringify(compatDsl)))
    const graph = artifact.graph
    const campaign = artifact.campaign_template
    campaign.split_invocation.fold_set = foldSet
    campaign.root_seed = dsl.cv.seed

    // --- dag-ml enumerates the variant set (cartesian/zip, max_variants-capped,
    // deterministic + fingerprinted). The host never expands variants itself; we
    // only read the materialized ExecutionPlan.variants[]. ---
    // `hasGenerators` mirrors what the editor displays: any sweep/variant/finetune
    // dimension that toCompatDsl lowered to a real param_generator/variants choice.
    // It gates the planning_failed fallback below — silently collapsing a generated
    // sweep to a single base variant would skip the search the user configured.
    const hasGenerators = countVariants(dsl) > 1
    const baseVariant: VariantPlan = { variant_id: 'variant:base', choices: {}, fingerprint: 'base' }
    let variants: VariantPlan[]
    try {
      const plan = JSON.parse(
        dagml.build_execution_plan_json('plan:n4a', JSON.stringify(graph), JSON.stringify(campaign), JSON.stringify(modelManifest())),
      ) as { variants: VariantPlan[] }
      variants = plan.variants.length ? plan.variants : [baseVariant]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // max_variants cap → friendly guard, not a thrown stack.
      if (/max_variants|exceed/i.test(msg)) {
        throw new Error('Too many variants for the configured cap — lower a sweep range or raise the variant cap.')
      }
      // planning_failed (multi-node graph: dag-ml can't yet schedule per-node
      // preprocessing without a per-node provider). The single-base fallback is
      // only honest when there is NOTHING to expand: collapsing a real sweep to one
      // variant would silently drop the search. With generators present, surface a
      // clear guard instead.
      if (/no controller registered|planning failed|planning_failed/i.test(msg)) {
        if (hasGenerators) {
          throw new Error('Variant sweeps need a model-only pipeline for now — multi-node preprocessing sweeps are not schedulable yet. Move the sweep onto the model, or remove preprocessing steps.')
        }
        variants = [baseVariant]
      } else {
        throw err
      }
    }
    const multiVariant = variants.length > 1

    // --- ONE FIT_CV campaign over ALL variants × the SAME fold_set. dag-ml's
    // scheduler (runtime.rs execute_campaign_phase / 3388) loops every plan.variant
    // and every fold itself, overlaying each variant's param_overrides onto
    // task.node_plan.params and stamping task.variant_id. The JS controller is
    // invoked once per (variant, node, fold); it reads that task's variant_id +
    // fold_id, fits the variant's effective DSL on the fold's TRAIN rows, and
    // returns OOF for the fold's VALIDATION rows. We must NOT re-loop variants in
    // the host (that ran the full plan once per outer variant → OOF duplicated
    // ×variantCount). Results are bucketed back BY variant_id, so each variant's
    // OOF has exactly the validation rows of the fold_set (≈ nSamples), once. ---
    const baseDslByVariant = new Map(variants.map((v) => [v.variant_id, effectiveDsl(dsl, v)]))
    const dslForVariantId = (vid: string | null): PipelineDSL =>
      (vid ? baseDslByVariant.get(vid) : undefined) ?? baseDslByVariant.get(variants[0].variant_id) ?? dsl
    const foldIndexById = new Map(folds.map((f, i) => [f.fold_id, i]))
    // per variant_id → per-fold accumulated OOF rows
    const foldRowsByVariant = new Map<string, PredRow[][]>(variants.map((v) => [v.variant_id, folds.map(() => [] as PredRow[])]))

    onP?.({ phase: 'fit_cv', pct: 2 })
    const scoreMetric: RunResult['scoreMetric'] = task === 'regression' ? 'rmse' : 'accuracy'

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
      // Fit THIS task's variant (by id): use the variant's effective DSL so the
      // overlaid model/preprocessing params drive libn4m. (dag-ml also overlays the
      // params onto np.params; we re-derive from the variant id for parity with the
      // refit + the preprocessing nodes, which the model-only task does not carry.)
      const vDsl = dslForVariantId(t.variant_id ?? null)
      const { pred } = trainAndPredict(ds, vDsl, backend, trainIdx, valIdx)
      const valSampleIds = valIdx.map(dagId)
      const result = {
        node_id: np.node_id,
        outputs: {},
        predictions: [{
          prediction_id: `pred:${np.node_id}:${t.variant_id ?? 'base'}:${t.fold_id ?? 'nofold'}`,
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
      return JSON.stringify(result).replace('"__SEED__"', seedRaw)
    }

    type ResultBlock = { partition: string; fold_id: string | null; sample_ids: string[]; values: number[][] }
    type NodeRes = { predictions?: ResultBlock[]; lineage?: { variant_id?: string | null } }
    let nodeResults: NodeRes[]
    try {
      nodeResults = JSON.parse(
        dagml.execute_campaign_phase_json('plan:n4a', JSON.stringify(graph), JSON.stringify(campaign), JSON.stringify(modelManifest()), 'run:n4a', dsl.cv.seed >>> 0, 'FIT_CV', invoke),
      )
    } catch (err) {
      if (signal?.aborted) throw err
      // The scheduler can't run this graph. The libn4m-chain fallback only knows
      // how to run ONE variant over the folds; for a real multi-variant sweep that
      // would silently drop every non-base variant, so re-throw instead of mis-
      // bucketing. (In practice the planning guard above already fired for
      // generators + multi-node graphs, so this path is the single-base case.)
      if (multiVariant) throw err
      // single-base case: run the leakage-honest libn4m chain over dag-ml's folds
      // (folds stay dag-ml's, numerics stay libn4m) and bucket into the base variant.
      const base = variants[0]
      const baseFoldRows = foldRowsByVariant.get(base.variant_id)!
      const prebuilt: Fold[] = [...foldByDagId.entries()].map(([, v], i) => ({ foldId: i + 1, trainIdx: v.trainIdx, valIdx: v.valIdx }))
      for (let i = 0; i < folds.length; i++) {
        if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')
        const f = prebuilt[i]
        const { pred } = trainAndPredict(ds, baseDslByVariant.get(base.variant_id) ?? dsl, backend, f.trainIdx, f.valIdx)
        baseFoldRows[i].push(...decodeRows(ds, classNames, classIdx, pred, f.valIdx))
      }
      nodeResults = []
    }
    // Bucket every validation block back to its variant + fold (BY variant_id, never
    // by call order) so each variant's OOF is assembled exactly once.
    for (const nr of nodeResults) {
      const vid = nr.lineage?.variant_id ?? variants[0].variant_id
      const bucket = foldRowsByVariant.get(vid) ?? foldRowsByVariant.get(variants[0].variant_id)!
      for (const blk of nr.predictions ?? []) {
        if (blk.partition !== 'validation') continue
        const idx = blk.sample_ids.map(rowOfDagId).filter((v) => Number.isInteger(v) && v >= 0)
        const predMat: Mat = { data: Float64Array.from(blk.values.flat()), rows: blk.sample_ids.length, cols: blk.values[0]?.length ?? 1 }
        const rows = decodeRows(ds, classNames, classIdx, predMat, idx)
        const fi = blk.fold_id ? foldIndexById.get(blk.fold_id) : undefined
        if (fi !== undefined) bucket[fi].push(...rows)
      }
    }
    if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')

    // --- score each variant's OOF → one CandidateScore per variant_id ---
    const evaluated: { variant: VariantPlan; vDsl: PipelineDSL; oof: PredRow[]; foldRows: PredRow[][]; cvNode: ReturnType<typeof scoreNode>; metric: number }[] = []
    for (const variant of variants) {
      const foldRows = foldRowsByVariant.get(variant.variant_id)!
      const oof = foldRows.flat()
      if (oof.length === 0) throw new Error('dag-ml produced no OOF predictions')
      const cvNode = scoreNode('cv', 'CV Scores', 'cv', oof, task, classNames)
      const metric = Number(cvNode.metrics[scoreMetric] ?? (task === 'regression' ? Infinity : -Infinity))
      evaluated.push({ variant, vDsl: baseDslByVariant.get(variant.variant_id) ?? dsl, oof, foldRows, cvNode, metric })
    }
    onP?.({ phase: 'fit_cv', pct: 80 })

    // --- SELECT: dag-ml ranks the candidates (deterministic argmin/argmax + id
    // tie-break); the host does not pick. Objective: rmse→minimize, accuracy→
    // maximize. Skip the SELECT call for a single variant (nothing to rank). ---
    let winnerIdx = 0
    if (multiVariant) {
      onP?.({ phase: 'select', pct: 82, message: `selecting from ${variants.length} variants` })
      const objective = task === 'regression' ? 'minimize' : 'maximize'
      const policy = { id: 'sel:n4a', metric: { name: scoreMetric, objective } }
      const candidates = evaluated
        .filter((e) => Number.isFinite(e.metric))
        .map((e) => ({ candidate_id: e.variant.variant_id, metrics: { [scoreMetric]: e.metric } }))
      if (candidates.length > 0) {
        const decision = JSON.parse(dagml.select_candidates_json(JSON.stringify(policy), JSON.stringify(candidates), undefined)) as { selected_candidate_id: string }
        const idx = evaluated.findIndex((e) => e.variant.variant_id === decision.selected_candidate_id)
        if (idx >= 0) winnerIdx = idx
      }
    }
    const winner = evaluated[winnerIdx]
    const cvNode = winner.cvNode
    const foldScoreNodes = winner.foldRows.map((rows, i) => scoreNode(`fold-${i + 1}`, `Fold ${i + 1}`, 'fold', rows, task, classNames))

    // --- REFIT the SELECTED variant on full-train, score on test (or train), via
    // libn4m. dag-ml's variant scheduler has no per-variant REFIT pin, so the host
    // pins the winner by refitting its effective DSL directly (folds + selection
    // stay dag-ml's; this is host-side pinning, no dag-ml change). ---
    onP?.({ phase: 'refit', pct: 86 })
    const trainIdx = trainUniverse
    const testIdx = testRowsOf(ds)
    const scoreIdx = testIdx.length > 0 ? testIdx : trainIdx
    const { pred: refitPred, descriptors, model } = trainAndPredict(ds, winner.vDsl, backend, trainIdx, scoreIdx)
    const refitRows = decodeRows(ds, classNames, classIdx, refitPred, scoreIdx)
    const refitNode = scoreNode('refit', testIdx.length > 0 ? 'Refit · test' : 'Refit · train', 'refit', refitRows, task, classNames)

    onP?.({ phase: 'done', pct: 100 })
    const fitted: FittedPipeline = {
      dsl: winner.vDsl,
      taskType: task,
      nFeatures: ds.nFeatures,
      classes: classNames.length ? classNames : undefined,
      state: { chain: descriptors, model, classNames: classNames.length ? classNames : undefined, backendId: backend.id } as FittedState,
    }
    const variantSummaries = multiVariant
      ? evaluated.map((e, i) => ({ variantId: e.variant.variant_id, label: variantLabel(e.variant), metrics: e.cvNode.metrics, selected: i === winnerIdx }))
      : undefined
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
      scoreMetric,
      lineage: { engine: 'dag-ml-wasm', compiled: true, executed: true, phase: multiVariant ? 'FIT_CV+SELECT' : 'FIT_CV', variantCount: variants.length, selectedVariant: winner.variant.variant_id, folds: folds.length, version: dagml.dag_ml_version(), dataProvider },
      model: fitted,
      createdAt: new Date().toISOString(),
      variantCount: variants.length,
      variants: variantSummaries,
    }
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    const backend = await loadLibn4mBackend()
    return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
  }
}

export const dagMlExecAvailable = dagMlAvailable
