// The generic n4m role path. Every manifest-generated node is built by method id
// (@nirs4all/methods `methodClass`) with its manifest-typed parameters, run
// through its role methods (fit / transform / predict / predictLabels / getMask /
// split / augment) and persisted as portable N4ME bytes (`toN4me`), which
// `NativeEstimator.fromN4me` reloads in any n4m binding. This module only
// marshals matrices and parameters: defaults, validation and every numeric live
// in libn4m.
//
// Training rows (audit F10): some fitted states embed the training spectra
// (kernel PLS, GPR-PLS, LW-PLS; libn4m's `containsTrainingRows()`), and libn4m
// exports such a state only with an explicit `allowTrainingRows`. The session
// keeps every fitted state as an in-memory checkpoint (`checkpoint`, opt-in set:
// it never leaves this browser session as is) and records the flag; a shareable
// export re-serializes each state through `exportN4me` with the user's choice,
// so libn4m refuses to write training rows the user did not agree to share.
import { nodeByType } from '@/catalog/nodes'
import type { NativeMethodRef, NodeDef } from '@/catalog/types'
import type { Mat } from '../algo/linalg'
import { methodsWasm } from '../nirs4all-core'
import type {
  Augmenter,
  Classifier,
  FitInputs,
  NativeEstimator,
  NativeMethod,
  ParamValue,
  Regressor,
  SampleFilter,
  Splitter,
  TargetMixingAugmenter,
  Transformer,
} from '../wasm/methods/index.js'

/** A fitted native state as the session keeps it. */
export interface N4meCheckpoint {
  /** portable fitted estimator (N4ME) */
  n4me: Uint8Array
  /** the state embeds training rows (libn4m `containsTrainingRows()`) */
  containsTrainingRows: boolean
}

/** A fitted native model as the pipeline state stores it. */
export interface NativeModelState extends N4meCheckpoint {
  /** classifiers: the class-score width (one column per encoded class) */
  nClasses?: number
}

/** Fit-time context: the (train) targets and the dataset's spectral axis. */
export interface FitContext {
  Y?: Mat
  axis?: number[]
}

/** The manifest-generated node of a DSL token, or a clear error. */
export function nativeNode(type: string): NodeDef & { native: NativeMethodRef } {
  const def = nodeByType(type)
  if (!def?.native) throw new Error(`"${type}" is not an n4m method node.`)
  return def as NodeDef & { native: NativeMethodRef }
}

/** The node's DSL params as native values; unset params keep the native default. */
function nativeParams(def: NodeDef, params: Record<string, unknown>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const p of def.params) {
    const value = params[p.name]
    if (value === undefined || value === null || value === '') continue
    if (p.type === 'int') out[p.name] = Math.round(Number(value))
    else if (p.type === 'array' && p.itemType === 'int') out[p.name] = (value as number[]).map((v) => Math.round(Number(v)))
    else out[p.name] = value as ParamValue
  }
  return out
}

function create<T>(def: NodeDef & { native: NativeMethodRef }, params: Record<string, unknown>): NativeMethod & T {
  const method = new (methodsWasm().methodClass(def.native.methodId))()
  method.params = nativeParams(def, params)
  return method as NativeMethod & T
}

/** One class id per row of a one-hot (classification) target matrix. */
function labelsOf(Y: Mat): number[] {
  return Array.from({ length: Y.rows }, (_, r) => {
    let best = 0
    for (let k = 1; k < Y.cols; k++) if (Y.data[r * Y.cols + k] > Y.data[r * Y.cols + best]) best = k
    return best
  })
}

/** The target a method's fit reads: class labels, the Y matrix, or nothing. */
function fitTarget(ref: NativeMethodRef, Y: Mat | undefined): Mat | number[] | undefined {
  if (!Y) return undefined
  if (ref.inputs.labels !== 'none') return labelsOf(Y)
  return ref.inputs.y !== 'none' ? Y : undefined
}

/** The spectral axis, when the method reads one and it still matches the columns. */
function fitInputs(ref: NativeMethodRef, X: Mat, axis: number[] | undefined): FitInputs {
  return ref.inputs.axis !== 'none' && axis && axis.length === X.cols ? { axis } : {}
}

const matrix = (m: Mat): Mat => ({ data: m.data, rows: m.rows, cols: m.cols })

/** Fit an estimator node (transformer, selector, regressor, classifier, filter). */
export function fitEstimator(type: string, params: Record<string, unknown>, X: Mat, ctx: FitContext): NativeEstimator {
  const def = nativeNode(type)
  const est = create<NativeEstimator>(def, params) as NativeEstimator
  est.fit(matrix(X), fitTarget(def.native, ctx.Y), fitInputs(def.native, X, ctx.axis))
  return est
}

/** Reload a fitted estimator from its N4ME bytes. */
export function loadEstimator(n4me: Uint8Array): NativeEstimator {
  return methodsWasm().NativeEstimator.fromN4me(n4me)
}

/** The in-session checkpoint of a fitted estimator. Not an export: the bytes
 *  stay in this browser session; `exportN4me` makes the shareable copy. */
export function checkpoint(est: NativeEstimator): N4meCheckpoint {
  return { n4me: est.toN4me({ allowTrainingRows: true }), containsTrainingRows: est.containsTrainingRows() }
}

/** The shareable N4ME of a checkpoint. libn4m refuses a state that embeds
 *  training rows unless the user allowed sharing them. */
export function exportN4me(n4me: Uint8Array, allowTrainingRows: boolean): Uint8Array {
  const est = loadEstimator(n4me)
  try {
    return est.toN4me({ allowTrainingRows })
  } finally {
    est.dispose()
  }
}

export function transform(est: NativeEstimator, X: Mat): Mat {
  return (est as NativeEstimator & Transformer).transform(matrix(X))
}

/** Fit a model node and export it as N4ME. */
export function fitModel(type: string, params: Record<string, unknown>, X: Mat, Y: Mat): NativeModelState {
  const est = fitEstimator(type, params, X, { Y })
  try {
    return nativeNode(type).native.role === 'classifier' ? { ...checkpoint(est), nClasses: Y.cols } : checkpoint(est)
  } finally {
    est.dispose()
  }
}

/** Predict with a saved native model: regressor outputs, or one-hot class ids
 *  (the classifier's own predictLabels) over `nClasses` columns. */
export function predictModel(model: NativeModelState, X: Mat): Mat {
  const est = loadEstimator(model.n4me)
  try {
    if (model.nClasses === undefined) return (est as NativeEstimator & Regressor).predict(matrix(X))
    const labels = (est as NativeEstimator & Classifier).predictLabels(matrix(X))
    const out: Mat = { data: new Float64Array(X.rows * model.nClasses), rows: X.rows, cols: model.nClasses }
    labels.forEach((label, r) => (out.data[r * model.nClasses! + label] = 1))
    return out
  } finally {
    est.dispose()
  }
}

export function isNativeModelState(model: unknown): model is NativeModelState {
  return typeof model === 'object' && model !== null && (model as NativeModelState).n4me instanceof Uint8Array
}

/** Train-only row operator: keep the rows a sample filter accepts. */
export function filterRows(type: string, params: Record<string, unknown>, X: Mat, Y: Mat): boolean[] {
  const def = nativeNode(type)
  const est = fitEstimator(type, params, X, { Y })
  try {
    const y = def.native.inputs.y !== 'none' && Y.cols === 1 ? Y.data : undefined
    return (est as NativeEstimator & SampleFilter).getMask(matrix(X), y)
  } finally {
    est.dispose()
  }
}

/** Train-only row operator: the augmented copy of X (and of Y for target-mixing augmenters). */
export function augmentRows(type: string, params: Record<string, unknown>, X: Mat, Y: Mat, axis: number[] | undefined): { X: Mat; Y: Mat } {
  const def = nativeNode(type)
  const proc = create<Augmenter & TargetMixingAugmenter>(def, params)
  const inputs = fitInputs(def.native, X, axis)
  if (def.native.inputs.y !== 'none') return (proc as TargetMixingAugmenter).augment(matrix(X), matrix(Y), inputs.axis)
  return { X: (proc as Augmenter).augment(matrix(X), inputs.axis), Y }
}

/** Run a splitter node: folds of 0-based row indices. */
export function splitRows(type: string, params: Record<string, unknown>, X: Mat, y: Float64Array): { train: number[]; test: number[] }[] {
  const def = nativeNode(type)
  const proc = create<Splitter>(def, params) as NativeMethod & Splitter
  return proc.split(matrix(X), def.native.inputs.y !== 'none' ? y : undefined)
}
