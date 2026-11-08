import { identifyNativeFitRefusal, isFitRefusal } from './fit-refusal'
// Fit/predict/export helpers shared by the dag-ml engine and the imported-model paths,
// parameterized by a ModelBackend (the actual model fit/predict). The libn4m backend
// uses the real nirs4all-methods C++ engine compiled to WASM; ml.js models use their
// own backend. CV, refit and scoring run in dag-ml (dagml-engine.ts), not here.
import { nodeByType } from '@/catalog/nodes'
import { type Mat, mat, selectRows } from './algo/linalg'
import { type FittedTransformer, isRowOperator, type Preprocessor, type StepState } from './methods/preproc'
import { classificationMetrics, regressionMetrics } from './metrics'
import { checkInputColumns } from './feature-identity'
import type {
  FittedPipeline,
  MaterializedDataset,
  Metrics,
  PipelineBranch,
  PipelineDSL,
  PipelineStep,
  PredRow,
  PredictResult,
  RunProgress,
  RunResult,
  ScoreContext,
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
 *  operators. Both come from libn4m (C++ → WASM) in production. Model blobs +
 *  preprocessing state are serializable data (N4ME bytes for every n4m method).
 *
 *  `fit` dispatches on `spec.type` — the libn4m backend fits every n4m model node
 *  through the generic role API. */
export interface ModelBackend {
  id: string
  fit(spec: ModelSpec, X: Mat, Y: Mat, nComp: number): unknown
  predict(model: unknown, X: Mat): Mat
  /** the shareable copy of a fitted model; refuses one embedding training rows unless allowed */
  share(model: unknown, allowTrainingRows: boolean): unknown
  /** libn4m: predict the whole fitted chain as one native pipeline that holds the
   *  fitted column names and checks `inputNames` against them (F03); undefined
   *  when the chain is not one native pipeline (feature union, non-N4ME model). */
  predictNamed?(st: FittedState, modelType: string, X: Mat, featureNames: string[], inputNames: string[] | undefined): Mat | undefined
  /** preprocessing operators (libn4m or JS) — the numerics never live here */
  preproc: Preprocessor
}

interface FittedStep {
  type: string
  params: Record<string, unknown>
  /** serialized fitted preprocessing state; null for the train-only row
   *  operators (sample filters, augmentation), which predict never replays */
  state: StepState | null
  /** the state embeds training rows (reported by libn4m at fit) */
  containsTrainingRows: boolean
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
  // A missing label ('' / NaN y) is not a class; its index is -1 and its row
  // never reaches FIT or scoring (partition.ts hasTarget).
  if (ds.classes && ds.classes.length === ds.nSamples) {
    const names: string[] = []
    const seen = new Set<string>()
    for (const c of ds.classes) if (c !== '' && !seen.has(c)) seen.add(c), names.push(c)
    names.sort()
    const idxMap = new Map(names.map((n, i) => [n, i]))
    const classIdx = new Int32Array(ds.nSamples)
    for (let i = 0; i < ds.nSamples; i++) classIdx[i] = idxMap.get(ds.classes[i]) ?? -1
    return { classNames: names, classIdx }
  }
  let maxc = 0
  for (let i = 0; i < ds.nSamples; i++) if (Number.isFinite(ds.y[i])) maxc = Math.max(maxc, Math.round(ds.y[i]))
  const names = Array.from({ length: maxc + 1 }, (_, i) => `Class ${i}`)
  const classIdx = new Int32Array(ds.nSamples)
  for (let i = 0; i < ds.nSamples; i++) classIdx[i] = Number.isFinite(ds.y[i]) ? Math.round(ds.y[i]) : -1
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
    const observation = ds.observationIds?.[idx[i]]
    const observationId = observation == null ? {} : { observationId: observation }
    if (ds.taskType === 'regression') {
      const a = ds.y[idx[i]]
      const pv = pred.data[i * pred.cols]
      rows.push({ sampleId: sid, ...observationId, actual: a, predicted: pv, residual: pv - a })
    } else {
      const K = classNames.length
      let best = 0
      let bv = -Infinity
      for (let k = 0; k < K; k++) {
        const v = pred.data[i * K + k]
        if (v > bv) (bv = v), (best = k)
      }
      const a = classIdx[idx[i]]
      rows.push({ sampleId: sid, ...observationId, actual: a, predicted: best, residual: best - a, actualLabel: classNames[a], predictedLabel: classNames[best] })
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
  const modelSpec: ModelSpec = { type: model0.type, params: model0.params }
  // AUTONOMOUS models (AOM-PLS / POP-PLS) screen their own strict-linear operator
  // bank by internal CV — they MUST receive raw X. Applying the editor's
  // preprocessing chain (and branch fusion) first double-transforms the spectra,
  // which degrades or breaks the internal screen (NaN/Inf, doubled derivatives) and
  // makes libn4m reject the fold. Bypass the chain entirely (no descriptors → the
  // saved model replays nothing on predict), feeding raw train/predict rows straight
  // to the backend. The UI flags `autonomous` so users don't stack preprocessing.
  if (nodeByType(model0.type)?.autonomous) {
    const Xtr = selectRows(Xfull, trainIdx)
    const model = backend.fit(modelSpec, Xtr, buildYMatrix(ds, classNames, classIdx, trainIdx), clampNcomp(ncomp, Xtr))
    const pred = backend.predict(model, selectRows(Xfull, predictIdx))
    return { pred, descriptors: [], branch: undefined, model, classNames }
  }
  // Main preprocessing chain, fit on the train rows only. Sample filters and
  // augmentation reshape these training rows (and their targets) on the way.
  const Ytrain = buildYMatrix(ds, classNames, classIdx, trainIdx)
  const { transformers, descriptors, Xout, Yout } = fitChain(dsl.steps, selectRows(Xfull, trainIdx), Ytrain, backend.preproc, ds.axis)
  // Optional feature-union: fit each branch sub-chain on the (train) main-chain
  // output, then concat columns. Leakage-safe — every fit sees only train rows.
  const branches = activeBranches(dsl)
  const branchTransformers: FittedTransformer[][] = []
  const branchDescriptors: FittedStep[][] = []
  try {
    let Xtr = Xout
    if (branches) {
      const parts: Mat[] = []
      for (const b of branches) {
        const fb = fitChain(b.steps, Xout, Yout, backend.preproc, ds.axis)
        branchTransformers.push(fb.transformers)
        branchDescriptors.push(fb.descriptors)
        parts.push(fb.Xout)
      }
      Xtr = concatCols(parts)
    }
    const model = backend.fit(modelSpec, Xtr, Yout, clampNcomp(ncomp, Xtr))
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

/** All feature-fusion sub-chains the pipeline concatenates before the model: the
 *  branches of every branch/concat_transform/merge container (≥2 branches), plus
 *  a migrated legacy `branch` block. Generator containers are NOT fused here —
 *  the engine expands them into per-variant DSLs upstream (expandGeneratorVariants).
 *  Returns undefined when nothing fuses (the model sees the main chain directly). */
function activeBranches(dsl: PipelineDSL): PipelineBranch[] | undefined {
  const lanes: PipelineBranch[] = []
  if (dsl.branch && dsl.branch.branches.length >= 2) lanes.push(...dsl.branch.branches)
  for (const c of dsl.containers ?? []) {
    if (c.container === 'generator') continue // expanded into variants, not fused
    if (c.branches.length >= 2) lanes.push(...c.branches)
  }
  return lanes.length >= 2 ? lanes : undefined
}

function fitChain(
  steps: PipelineStep[],
  Xin: Mat,
  Yin: Mat,
  preproc: Preprocessor,
  axis: number[],
): { transformers: FittedTransformer[]; descriptors: FittedStep[]; Xout: Mat; Yout: Mat } {
  let cur = Xin
  let Y = Yin
  const transformers: FittedTransformer[] = []
  const descriptors: FittedStep[] = []
  try {
    for (const s of steps) {
      if (isRowOperator(s.type)) {
        // train-only: reshapes the training rows, never replayed on predict rows
        ;({ X: cur, Y } = preproc.resample(s.type, s.params, cur, Y, axis))
        descriptors.push({ type: s.type, params: s.params, state: null, containsTrainingRows: false })
        continue
      }
      const t = preproc.fit(s.type, s.params, cur, { Y, axis }) // fit-on-train, in libn4m
      transformers.push(t)
      try {
        cur = t.apply(cur)
      } catch (error) {
        // Applying a newly fitted transformer to TRAIN rows is part of fitting
        // this candidate. Replay/prediction transforms are never marked here.
        identifyNativeFitRefusal(error)
        throw error
      }
      descriptors.push({ type: s.type, params: s.params, state: t.state, containsTrainingRows: t.containsTrainingRows })
    }
  } catch (e) {
    transformers.forEach((t) => t.free())
    throw e
  }
  return { transformers, descriptors, Xout: cur, Yout: Y }
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
      if (d.state === null) continue // train-only row operator
      const t = preproc.restore(d.type, d.params, d.state)
      live.push(t)
      cur = t.apply(cur)
    }
    return cur
  } finally {
    live.forEach((t) => t.free())
  }
}

export function scoreNode(id: string, name: string, kind: ScoreKind, rows: PredRow[], task: TaskType, classNames: string[], scoreContext?: ScoreContext): ScoreNode {
  const context = scoreContext ? { scoreContext } : {}
  if (task === 'regression') {
    return { id, name, kind, metrics: regressionMetrics(rows), predictions: rows, status: 'completed', ...context }
  }
  const { metrics, confusion } = classificationMetrics(rows, classNames)
  return { id, name, kind, metrics, predictions: rows, confusion, status: 'completed', ...context }
}

/**
 * Run a generator-OR pipeline by expanding it into candidate DSLs (one per
 * alternative), running each through the engine's existing single-DSL CV/refit
 * path (`runOne`), then selecting the best by the canonical metric. Selection is
 * delegated (`select`) — the engine routes it through dag-ml's
 * `select_candidates_json` — so this
 * reuses the EXISTING per-variant FIT_CV + selection machinery rather than
 * reinventing it. The winner's RunResult is returned, annotated with the full
 * variant list (the selected one flagged). `dsl` must already contain exactly one
 * runnable OR generator (the caller checks via activeOrGenerator).
 */
export async function runGeneratorOr(
  dsl: PipelineDSL,
  candidates: { label: string; dsl: PipelineDSL }[],
  scoreMetric: keyof Metrics,
  minimize: boolean,
  runOne: (candidate: PipelineDSL, onProgress: (p: RunProgress) => void) => Promise<RunResult>,
  select: (ranked: { id: string; metric: number }[]) => Promise<string>,
  onProgress?: (p: RunProgress) => void,
): Promise<RunResult> {
  const results: { variantId: string; label: string; pipeline: PipelineDSL; run: RunResult; metric: number }[] = []
  let firstError: unknown
  for (let i = 0; i < candidates.length; i++) {
    const { label, dsl: cdsl } = candidates[i]
    // each candidate reports 0→100 of its own run; rescale it into this
    // candidate's share of the whole search so the overall progress never rewinds
    const variant = { index: i + 1, total: candidates.length }
    const candidateProgress = (p: RunProgress) =>
      onProgress?.({
        phase: p.phase === 'done' ? 'fit_cv' : p.phase,
        pct: 95 * (i + Math.min(100, Math.max(0, p.pct)) / 100) / candidates.length,
        message: `variant ${variant.index}/${variant.total} · ${p.message ?? label}`,
        variant,
      })
    let run: RunResult
    try {
      run = await runOne(cdsl, candidateProgress)
    } catch (error) {
      // A candidate that cannot be fitted is dropped from the search, as in
      // nirs4all; the run fails only when no candidate fits.
      if (!isFitRefusal(error)) throw error
      firstError ??= error
      continue
    }
    const m = run.cv?.metrics[scoreMetric] ?? run.refit.metrics[scoreMetric]
    // an alternative that itself swept parameters reports its selected inner variant
    const pipeline = run.variants?.find((v) => v.selected)?.pipeline ?? run.model.dsl
    results.push({ variantId: `variant:${i}`, label, pipeline, run, metric: Number(m ?? (minimize ? Infinity : -Infinity)) })
  }
  if (results.length === 0) throw firstError
  onProgress?.({ phase: 'select', pct: 99, message: `selecting from ${results.length} variants` })
  const ranked = results.filter((r) => Number.isFinite(r.metric)).map((r) => ({ id: r.variantId, metric: r.metric }))
  let winnerId = results[0]?.variantId
  if (ranked.length > 0) winnerId = await select(ranked)
  const winnerIdx = Math.max(0, results.findIndex((r) => r.variantId === winnerId))
  const winner = results[winnerIdx]
  onProgress?.({ phase: 'done', pct: 100 })
  return {
    ...winner.run,
    pipelineName: dsl.name,
    variantCount: candidates.length,
    variants: results.map((r, i) => ({ variantId: r.variantId, label: r.label, metrics: r.run.cv?.metrics ?? r.run.refit.metrics, selected: i === winnerIdx, pipeline: r.pipeline })),
  }
}

/** Predict new rows. `featureNames` are the input's column names (its header),
 *  checked against the model's fitted columns; without them the input is
 *  positional. */
export function predictPipeline(
  model: FittedPipeline,
  Xnew: Float64Array,
  nSamples: number,
  nFeatures: number,
  backend: ModelBackend,
  featureNames?: string[],
): PredictResult {
  const pred = predictPipelineMatrix(model, Xnew, nSamples, nFeatures, backend, featureNames)
  const st = model.state as FittedState
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

/** Actual backend prediction matrix; classification scores are not relabelled probabilities. */
export function predictPipelineMatrix(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number, backend: ModelBackend, featureNames?: string[]): Mat {
  checkInputColumns(model, nFeatures, featureNames)
  if (!Number.isSafeInteger(nSamples) || nSamples < 1 || Xnew.length !== nSamples * nFeatures) throw new Error('Prediction matrix shape does not match its buffer')
  const st = model.state as FittedState
  const X: Mat = { data: Xnew, rows: nSamples, cols: nFeatures }
  return (model.features && model.dsl.model ? backend.predictNamed?.(st, model.dsl.model.type, X, model.features.names, featureNames) : undefined) ?? replayPipeline(st, X, backend)
}

/** Main chain → optional branch sub-chains → concat columns (mirrors training) → model. */
function replayPipeline(st: FittedState, X: Mat, backend: ModelBackend): Mat {
  const Xpre = applyChain(st.chain, X, backend.preproc)
  const Xp = st.branch && st.branch.length >= 2 ? concatCols(st.branch.map((c) => applyChain(c, Xpre, backend.preproc))) : Xpre
  return backend.predict(st.model, Xp)
}

export function backendIdOf(model: FittedPipeline): string {
  return (model.state as FittedState).backendId
}

/** Names of the fitted steps (and model) whose state embeds training rows, as
 *  libn4m reported them at fit: exporting the model shares those rows. */
export function trainingRowSteps(model: FittedPipeline): string[] {
  const st = model.state as Partial<FittedState> | null
  if (!st || !Array.isArray(st.chain)) return []
  const steps = [...st.chain, ...(st.branch ?? []).flat()].filter((s) => s.containsTrainingRows)
  const names = steps.map((s) => nodeByType(s.type)?.name ?? s.type)
  const fitted = st.model as { containsTrainingRows?: boolean } | null
  if (fitted?.containsTrainingRows && model.dsl.model) names.push(nodeByType(model.dsl.model.type)?.name ?? model.dsl.model.type)
  return names
}

/**
 * The shareable copy of a fitted pipeline (the .n4a export). Every fitted state
 * is re-serialized by its backend with the user's training-row choice, so a
 * state that embeds training rows is refused (libn4m for N4ME states) unless
 * `allowTrainingRows`. The in-session model is left untouched.
 */
export function exportPipeline(model: FittedPipeline, allowTrainingRows: boolean, backend: ModelBackend): FittedPipeline {
  const st = model.state as FittedState
  const share = (s: FittedStep): FittedStep => (s.state === null ? s : { ...s, state: backend.preproc.share(s.state, allowTrainingRows) })
  return {
    ...model,
    state: {
      ...st,
      chain: st.chain.map(share),
      branch: st.branch?.map((chain) => chain.map(share)),
      model: backend.share(st.model, allowTrainingRows),
    } satisfies FittedState,
  }
}
