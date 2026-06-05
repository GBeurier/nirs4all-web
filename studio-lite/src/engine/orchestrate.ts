// Pipeline orchestration shared by every engine, parameterized by a ModelBackend
// (the actual PLS fit/predict). The JS backend uses NIPALS; the libn4m backend
// uses the real nirs4all-methods C++ engine compiled to WASM. Orchestration
// (preprocessing fit-on-train, K-fold, OOF-by-sampleId, refit, metrics) is
// identical and leakage-honest regardless of backend.
import { nodeByType } from '@/catalog/nodes'
import { type Mat, mat, selectRows } from './algo/linalg'
import { type FittedTransformer, type Preprocessor } from './methods/preproc'
import { buildFolds, type Fold } from './kfold'
import { testRowsOf, trainRowsOf } from './partition'
import { applySplit, SPLIT_KINDS } from './split'
import { classificationMetrics, regressionMetrics } from './metrics'
import type {
  FittedPipeline,
  MaterializedDataset,
  Metrics,
  PipelineBranch,
  PipelineDSL,
  PipelineStep,
  PredRow,
  PredictResult,
  RunOptions,
  RunResult,
  ScoreKind,
  ScoreNode,
  TaskType,
} from './types'

/** The terminal estimator to fit: its catalog `type` token + params. */
export interface ModelSpec {
  type: string
  params: Record<string, unknown>
}

/** A pluggable numeric backend: the model fit/predict + the preprocessing
 *  operators. Both come from libn4m (C++ → WASM) in production; a JS backend is
 *  the offline fallback. Model blobs + preprocessing state are plain serializable data.
 *
 *  `fit` dispatches on `spec.type` — the libn4m backend routes PLS/PLS-DA through
 *  the legacy fast-path and every other catalog model through the generic
 *  coeff dispatcher (`fitModel`); the JS fallback only does NIPALS PLS. */
export interface ModelBackend {
  id: string
  fit(spec: ModelSpec, X: Mat, Y: Mat, nComp: number): unknown
  predict(model: unknown, X: Mat): Mat
  /** preprocessing operators (libn4m or JS) — the numerics never live here */
  preproc: Preprocessor
}

interface FittedStep {
  type: string
  params: Record<string, unknown>
  /** serialized fitted preprocessing state (empty for stateless ops) */
  state: number[]
}
export interface FittedState {
  chain: FittedStep[]
  /** optional feature-union: per-branch fitted sub-chains, applied to the main
   *  chain's output then concatenated column-wise before the model (FEATURE 2). */
  branch?: FittedStep[][]
  model: unknown
  classNames?: string[]
  backendId: string
}

/** Column-wise concatenation of matrices that share the same row count. */
function concatCols(mats: Mat[]): Mat {
  if (mats.length === 1) return mats[0]
  const rows = mats[0].rows
  const cols = mats.reduce((a, m) => a + m.cols, 0)
  const out = mat(rows, cols)
  for (let r = 0; r < rows; r++) {
    let off = r * cols
    for (const m of mats) {
      out.data.set(m.data.subarray(r * m.cols, (r + 1) * m.cols), off)
      off += m.cols
    }
  }
  return out
}

export function classInfo(ds: MaterializedDataset): { classNames: string[]; classIdx: Int32Array } {
  if (ds.taskType === 'regression') return { classNames: [], classIdx: new Int32Array(0) }
  if (ds.classes && ds.classes.length === ds.nSamples) {
    const names: string[] = []
    const seen = new Set<string>()
    for (const c of ds.classes) if (!seen.has(c)) seen.add(c), names.push(c)
    names.sort()
    const idxMap = new Map(names.map((n, i) => [n, i]))
    const classIdx = new Int32Array(ds.nSamples)
    for (let i = 0; i < ds.nSamples; i++) classIdx[i] = idxMap.get(ds.classes[i]) ?? 0
    return { classNames: names, classIdx }
  }
  let maxc = 0
  for (let i = 0; i < ds.nSamples; i++) maxc = Math.max(maxc, Math.round(ds.y[i]))
  const names = Array.from({ length: maxc + 1 }, (_, i) => `Class ${i}`)
  const classIdx = new Int32Array(ds.nSamples)
  for (let i = 0; i < ds.nSamples; i++) classIdx[i] = Math.round(ds.y[i])
  return { classNames: names, classIdx }
}

/** One-hot (classification) or column (regression) target matrix for the given rows. */
export function buildYMatrix(ds: MaterializedDataset, classNames: string[], classIdx: Int32Array, idx: number[]): Mat {
  if (ds.taskType === 'regression') {
    const Y = mat(idx.length, 1)
    for (let i = 0; i < idx.length; i++) Y.data[i] = ds.y[idx[i]]
    return Y
  }
  const K = classNames.length
  const Y = mat(idx.length, K)
  for (let i = 0; i < idx.length; i++) Y.data[i * K + classIdx[idx[i]]] = 1
  return Y
}

/** Decode a prediction matrix (rows aligned to `idx`) into PredRows joined to ds by sample. */
export function decodeRows(ds: MaterializedDataset, classNames: string[], classIdx: Int32Array, pred: Mat, idx: number[]): PredRow[] {
  const rows: PredRow[] = []
  for (let i = 0; i < idx.length; i++) {
    const sid = ds.sampleIds[idx[i]]
    if (ds.taskType === 'regression') {
      const a = ds.y[idx[i]]
      const pv = pred.data[i * pred.cols]
      rows.push({ sampleId: sid, actual: a, predicted: pv, residual: pv - a })
    } else {
      const K = classNames.length
      let best = 0
      let bv = -Infinity
      for (let k = 0; k < K; k++) {
        const v = pred.data[i * K + k]
        if (v > bv) (bv = v), (best = k)
      }
      const a = classIdx[idx[i]]
      rows.push({ sampleId: sid, actual: a, predicted: best, residual: best - a, actualLabel: classNames[a], predictedLabel: classNames[best] })
    }
  }
  return rows
}

/** Components clamped to the matrix dims (libn4m does not clamp internally). */
export function clampNcomp(ncomp: number, X: Mat): number {
  return Math.max(1, Math.min(ncomp, X.cols, X.rows - 1))
}

/** Fit the pipeline (preprocessing fit-on-train + model) on `trainIdx`, predict `predictIdx`. */
export function trainAndPredict(
  ds: MaterializedDataset,
  dsl: PipelineDSL,
  backend: ModelBackend,
  trainIdx: number[],
  predictIdx: number[],
): { pred: Mat; descriptors: FittedStep[]; branch?: FittedStep[][]; model: unknown; classNames: string[] } {
  if (!dsl.model) throw new Error('This pipeline has no model — add a model to fit and score.')
  const model0 = dsl.model
  const ncomp = Number(model0.params.n_components ?? nodeByType(model0.type)?.params.find((p) => p.name === 'n_components')?.default ?? 10)
  const { classNames, classIdx } = classInfo(ds)
  const Xfull: Mat = { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
  // Main preprocessing chain, fit on the train rows only.
  const { transformers, descriptors, Xout } = fitChain(dsl.steps, selectRows(Xfull, trainIdx), backend.preproc)
  // Optional feature-union: fit each branch sub-chain on the (train) main-chain
  // output, then concat columns. Leakage-safe — every fit sees only train rows.
  const branches = activeBranches(dsl)
  const branchTransformers: FittedTransformer[][] = []
  const branchDescriptors: FittedStep[][] = []
  const modelSpec: ModelSpec = { type: model0.type, params: model0.params }
  try {
    let Xtr = Xout
    if (branches) {
      const parts: Mat[] = []
      for (const b of branches) {
        const fb = fitChain(b.steps, Xout, backend.preproc)
        branchTransformers.push(fb.transformers)
        branchDescriptors.push(fb.descriptors)
        parts.push(fb.Xout)
      }
      Xtr = concatCols(parts)
    }
    const model = backend.fit(modelSpec, Xtr, buildYMatrix(ds, classNames, classIdx, trainIdx), clampNcomp(ncomp, Xtr))
    // Replay on predict rows: main chain → branch sub-chains → concat columns.
    const Xpre = applyTransformers(transformers, selectRows(Xfull, predictIdx))
    const Xpred = branches ? concatCols(branchTransformers.map((ts) => applyTransformers(ts, Xpre))) : Xpre
    const pred = backend.predict(model, Xpred)
    return { pred, descriptors, branch: branches ? branchDescriptors : undefined, model, classNames }
  } finally {
    transformers.forEach((t) => t.free())
    branchTransformers.forEach((ts) => ts.forEach((t) => t.free()))
  }
}

/** The branch block's branches if it's an active feature-union (≥2 branches), else undefined. */
function activeBranches(dsl: PipelineDSL): PipelineBranch[] | undefined {
  return dsl.branch && dsl.branch.branches.length >= 2 ? dsl.branch.branches : undefined
}

function fitChain(steps: PipelineStep[], Xin: Mat, preproc: Preprocessor): { transformers: FittedTransformer[]; descriptors: FittedStep[]; Xout: Mat } {
  let cur = Xin
  const transformers: FittedTransformer[] = []
  const descriptors: FittedStep[] = []
  for (const s of steps) {
    const t = preproc.fit(s.type, s.params, cur) // fit-on-train, in libn4m
    cur = t.apply(cur)
    transformers.push(t)
    descriptors.push({ type: s.type, params: s.params, state: t.state })
  }
  return { transformers, descriptors, Xout: cur }
}

function applyTransformers(transformers: FittedTransformer[], X: Mat): Mat {
  let cur = X
  for (const t of transformers) cur = t.apply(cur)
  return cur
}

function applyChain(chain: FittedStep[], X: Mat, preproc: Preprocessor): Mat {
  const live: { apply(X: Mat): Mat; free(): void }[] = []
  try {
    let cur = X
    for (const d of chain) {
      const t = preproc.restore(d.type, d.params, d.state)
      live.push(t)
      cur = t.apply(cur)
    }
    return cur
  } finally {
    live.forEach((t) => t.free())
  }
}

export function scoreNode(id: string, name: string, kind: ScoreKind, rows: PredRow[], task: TaskType, classNames: string[]): ScoreNode {
  if (task === 'regression') {
    return { id, name, kind, metrics: regressionMetrics(rows), predictions: rows, status: 'completed' }
  }
  const { metrics, confusion } = classificationMetrics(rows, classNames)
  return { id, name, kind, metrics, predictions: rows, confusion, status: 'completed' }
}

const yieldToLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function runPipeline(
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
  if (dsl.split && SPLIT_KINDS.has(dsl.split.type)) {
    try {
      onP?.({ phase: 'preprocess', pct: 1, message: `splitting via ${dsl.split.type}` })
      ds = await applySplit(ds, dsl.split)
    } catch (e) {
      console.warn('[split] could not compute split, keeping dataset partition:', e)
    }
  }
  const { classNames, classIdx } = classInfo(ds)

  // refuse to train on missing targets rather than producing a meaningless model
  const trainRowsIdx = trainRowsOf(ds)
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
  }
}

export function predictPipeline(
  model: FittedPipeline,
  Xnew: Float64Array,
  nSamples: number,
  nFeatures: number,
  backend: ModelBackend,
): PredictResult {
  const st = model.state as FittedState
  // main chain → optional branch sub-chains → concat columns (mirrors training).
  const Xpre = applyChain(st.chain, { data: Xnew, rows: nSamples, cols: nFeatures }, backend.preproc)
  const Xp = st.branch && st.branch.length >= 2 ? concatCols(st.branch.map((c) => applyChain(c, Xpre, backend.preproc))) : Xpre
  const pred = backend.predict(st.model, Xp)
  if (model.taskType === 'regression') {
    return { values: Float64Array.from({ length: nSamples }, (_, i) => pred.data[i]) }
  }
  const names = st.classNames ?? []
  const K = names.length
  const values = new Float64Array(nSamples)
  const labels: string[] = []
  for (let i = 0; i < nSamples; i++) {
    let best = 0
    let bv = -Infinity
    for (let k = 0; k < K; k++) {
      const v = pred.data[i * K + k]
      if (v > bv) (bv = v), (best = k)
    }
    values[i] = best
    labels.push(names[best])
  }
  return { values, labels }
}

export function backendIdOf(model: FittedPipeline): string {
  return (model.state as FittedState).backendId
}
