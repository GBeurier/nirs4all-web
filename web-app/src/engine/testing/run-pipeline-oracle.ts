// TEST-ONLY oracle. Not imported by any product module and never bundled.
//
// Provenance: this is `runPipeline` moved VERBATIM from `orchestrate.ts` (preimage hash in
// /tmp/n4web-direct-cleanup-20261108/PREIMAGES.sha256) when the direct compatibility runner
// was removed from the product. It is kept only so the tests of the retained imported-model
// predict/export paths (`feature-identity`, `n4m-roles`, `training-rows-export`) can still
// produce non-`nativeRefit` libn4m models. The product runs CV, refit and scoring in dag-ml
// (`dagml-engine.ts`); nothing here is a production numeric or fallback route.
import { classInfo, decodeRows, scoreNode, trainAndPredict, type FittedState, type ModelBackend } from '../orchestrate'
import { datasetFeatureIdentity } from '../feature-identity'
import { buildFolds, type Fold } from '../kfold'
import { missingTargetCount, missingTargetMessage, testRowsOf, trainRowsOf } from '../partition'
import { applySplit, isSplitType } from '../split'
import type { Mat } from '../algo/linalg'
import type { Metrics, MaterializedDataset, PipelineDSL, PredRow, RunOptions, RunResult, ScoreNode, FittedPipeline } from '../types'

const yieldToLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function runPipelineOracle(
  ds: MaterializedDataset,
  dsl: PipelineDSL,
  opts: RunOptions,
  backend: ModelBackend,
  /** when provided (served path), use these dag-ml-built folds instead of
   *  building them in TS — keeps fold construction in dag-ml even on the
   *  multi-node-pipeline path that dag-ml's scheduler can't yet execute. */
  prebuiltFolds?: Fold[],
): Promise<RunResult> {
  const { onProgress: onP, signal } = opts
  const task = ds.taskType
  if (!dsl.model) throw new Error('This pipeline has no model — add a model to run / score.')
  // SPLIT (optional, the FIRST split): override partitions before CV. Best-effort
  // offline — if libn4m can't compute the split (file://), keep the existing
  // partition rather than failing the whole run.
  if (dsl.split && isSplitType(dsl.split.type)) {
    try {
      onP?.({ phase: 'preprocess', pct: 1, message: `splitting via ${dsl.split.type}` })
      ds = await applySplit(ds, dsl.split)
    } catch (e) {
      console.warn('[split] could not compute split, keeping dataset partition:', e)
    }
  }
  const { classNames, classIdx } = classInfo(ds)

  // refuse to train on missing targets rather than producing a meaningless model;
  // rows whose target is missing are left out of FIT and scoring (trainRowsOf)
  const trainRowsIdx = trainRowsOf(ds)
  const missingTargets = missingTargetCount(ds)
  if (missingTargets) onP?.({ phase: 'preprocess', pct: 2, message: missingTargetMessage(missingTargets) })
  if (task === 'regression' && !trainRowsIdx.some((i) => Number.isFinite(ds.y[i]))) {
    throw new Error('No numeric targets in the training data — add a y / reference file before running.')
  }
  if (task !== 'regression' && classNames.length < 2) {
    throw new Error('Classification needs at least two classes in the training data.')
  }

  const decode = (pred: Mat, idx: number[]): PredRow[] => decodeRows(ds, classNames, classIdx, pred, idx)
  const checkCancel = () => {
    if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')
  }

  // CV is OPTIONAL: with `dsl.cv` present, run the leakage-honest fold loop and
  // assemble OOF; with it absent, skip CV entirely (refit-only run).
  let cvNode: ScoreNode | undefined
  const foldNodes: ScoreNode[] = []
  if (dsl.cv) {
    onP?.({ phase: 'fit_cv', pct: 4 })
    const folds = prebuiltFolds ?? buildFolds(ds, dsl.cv.folds, dsl.cv.seed)
    const oof: PredRow[] = []
    for (let fi = 0; fi < folds.length; fi++) {
      checkCancel()
      const f = folds[fi]
      // trainAndPredict fits the main chain + optional branch union on the fold's
      // train rows and predicts its validation rows — branch- and leakage-safe.
      const { pred } = trainAndPredict(ds, dsl, backend, f.trainIdx, f.valIdx)
      const rows = decode(pred, f.valIdx)
      oof.push(...rows)
      foldNodes.push(scoreNode(`fold-${f.foldId}`, `Fold ${f.foldId}`, 'fold', rows, task, classNames))
      onP?.({ phase: 'fit_cv', pct: 4 + Math.round((72 * (fi + 1)) / folds.length) })
      await yieldToLoop()
    }
    cvNode = scoreNode('cv', 'CV Scores', 'cv', oof, task, classNames)
  }

  checkCancel()
  onP?.({ phase: 'refit', pct: 82 })
  const trainIdx = trainRowsIdx
  const testIdx = testRowsOf(ds)
  const scoreIdx = testIdx.length > 0 ? testIdx : trainIdx
  const { pred: refitPred, descriptors, branch, model } = trainAndPredict(ds, dsl, backend, trainIdx, scoreIdx)
  const refitRows = decode(refitPred, scoreIdx)
  const refitNode = scoreNode('refit', testIdx.length > 0 ? 'Refit · test' : 'Refit · train', 'refit', refitRows, task, classNames)

  onP?.({ phase: 'done', pct: 100 })
  const fitted: FittedPipeline = {
    dsl,
    taskType: task,
    nFeatures: ds.nFeatures,
    features: datasetFeatureIdentity(ds),
    classes: classNames.length ? classNames : undefined,
    state: { chain: descriptors, branch, model, classNames: classNames.length ? classNames : undefined, backendId: backend.id } as FittedState,
  }
  const scoreMetric: keyof Metrics = task === 'regression' ? 'rmse' : 'accuracy'
  return {
    id: `run-${Date.now().toString(36)}`,
    pipelineName: dsl.name,
    taskType: task,
    targetName: ds.targetName,
    refit: refitNode,
    cv: cvNode,
    folds: foldNodes,
    seed: dsl.cv?.seed ?? 0,
    engine: backend.id,
    scoreMetric,
    model: fitted,
    createdAt: new Date().toISOString(),
    ...(missingTargets ? { missingTargets } : {}),
  }
}
