// Preprocessing is a BACKEND capability — the numerics live in libn4m (C++ → WASM),
// not in TypeScript. `libn4mPreprocessor` drives the generic operator dispatcher
// (@nirs4all/methods-wasm ppCreate/ppFit/ppTransform/ppGetState/ppSetState); the
// fitted state (e.g. the MSC reference spectrum) round-trips as plain doubles so a
// saved model (.n4a) can re-apply it for predict-later without retraining.
//
// `jsPreprocessor` is the OFFLINE-ONLY degraded fallback (the single-file file://
// build can't load the emscripten module): it wraps the small JS transforms in
// algo/preprocessing.ts. The served/public build always uses libn4m.
import type { Mat } from '../algo/linalg'
import { colMeans } from '../algo/linalg'
import { type Transformer, makeTransformer, mscFromRef } from '../algo/preprocessing'
import { ppCreate, ppDestroy, ppFit, ppGetState, ppSetState, ppTransform, type PpOperator } from '../wasm/methods/index.js'

/** A transformer fitted on train, carrying its serializable state. */
export interface FittedTransformer {
  apply(X: Mat): Mat
  /** fitted state as plain doubles (empty for stateless ops) — for .n4a */
  state: number[]
  free(): void
}

export interface Preprocessor {
  id: string
  /** create + fit-on-train an operator, ready to transform any matrix */
  fit(type: string, params: Record<string, unknown>, train: Mat): FittedTransformer
  /** recreate a fitted operator from a saved descriptor (predict-later) */
  restore(type: string, params: Record<string, unknown>, state: number[]): { apply(X: Mat): Mat; free(): void }
}

const num = (v: unknown, d: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

const bool01 = (v: unknown, d: number): number => (typeof v === 'boolean' ? (v ? 1 : 0) : num(v, d))

/** Map a catalog node's params to the dispatcher's positional param vector.
 *  Order MUST match the C `n4m_wasm_pp_create` switch in wasm_entry.c. */
function paramVector(type: string, p: Record<string, unknown>): number[] {
  switch (type) {
    case 'SavitzkyGolay':
      return [num(p.window, 11), num(p.polyorder, 2), num(p.deriv, 0)]
    case 'Derivative':
      return [num(p.order, 1)]
    case 'Detrend':
      return [num(p.degree, num(p.polyorder, 1))]
    case 'GaussianFilter':
      return [num(p.sigma, 2)]
    // ---- A2a baseline correctors ----
    case 'AsLS':
      return [num(p.lam, 1e6), num(p.p, 1e-2), num(p.max_iter, 50)]
    case 'AirPLS':
      return [num(p.lam, 1e6), num(p.max_iter, 50)]
    case 'ArPLS':
      return [num(p.lam, 1e5), num(p.max_iter, 50)]
    case 'ModPoly':
      return [num(p.polyorder, 2), num(p.max_iter, 250)]
    case 'IModPoly':
      return [num(p.polyorder, 2), num(p.max_iter, 250)]
    case 'SNIP':
      return [num(p.max_half_window, 20)]
    case 'RollingBall':
      return [num(p.half_window, 20), num(p.smooth_half_window, 0)]
    case 'IAsLS':
      return [num(p.lam, 1e6), num(p.p, 1e-2), num(p.polyorder, 2)]
    case 'BEADS':
      return [num(p.lam_0, 1e2), num(p.lam_1, 0.5), num(p.lam_2, 0.5)]
    // ---- A2b signal conversions ----
    case 'ToAbsorbance':
      return [bool01(p.is_percent, 0), num(p.epsilon, 1e-8), bool01(p.clip_negative, 1)]
    case 'FromAbsorbance':
      return [bool01(p.is_percent, 0)]
    case 'KubelkaMunk':
      return [bool01(p.is_percent, 0), num(p.epsilon, 1e-8)]
    // ---- A2c scatter / scaling / derivative ----
    case 'RobustNormalVariate':
      return [bool01(p.with_center, 1), bool01(p.with_scale, 1), num(p.k, 1.4826)]
    case 'LocalSNV':
      return [num(p.window, 11)]
    case 'AreaNormalization':
      return [num(p.method, 1)]
    case 'NorrisWilliams':
      return [num(p.segment, 5), num(p.gap, 3), num(p.derivative_order, 1)]
    case 'LogTransform':
      return [] // base 0 (natural log), default offset / min_value
    case 'WaveletDenoise':
      return [num(p.family, 0), 0, num(p.level, 3)]
    default:
      return [] // SNV, MSC, PercentToFraction, FractionToPercent — no positional params
  }
}

const EMPTY: Mat = { data: new Float64Array(0), rows: 0, cols: 0 }

/** libn4m-backed preprocessing — all numerics in C++ (the production path). */
export const libn4mPreprocessor: Preprocessor = {
  id: 'libn4m',
  fit(type, params, train) {
    const op = ppCreate(type, paramVector(type, params))
    try {
      ppFit(op, train.data, train.rows, train.cols) // no-op for stateless ops
      return wrap(op, Array.from(ppGetState(op)))
    } catch (e) {
      ppDestroy(op)
      throw e
    }
  },
  restore(type, params, state) {
    const op = ppCreate(type, paramVector(type, params))
    try {
      if (state.length) ppSetState(op, Float64Array.from(state))
      return wrap(op, state)
    } catch (e) {
      ppDestroy(op)
      throw e
    }
  },
}

function wrap(op: PpOperator, state: number[]): FittedTransformer {
  return {
    state,
    apply: (X: Mat): Mat => ({ data: ppTransform(op, X.data, X.rows, X.cols), rows: X.rows, cols: X.cols }),
    free: () => ppDestroy(op),
  }
}

/** Pure-JS preprocessing — OFFLINE fallback only (file:// can't load the wasm). */
export const jsPreprocessor: Preprocessor = {
  id: 'js',
  fit(type, params, train) {
    if (type === 'MSC') {
      const ref = colMeans(train)
      const t = mscFromRef(ref)
      return jsWrap(t, Array.from(ref))
    }
    return jsWrap(makeTransformer(type, params, train), [])
  },
  restore(type, params, state) {
    const t = type === 'MSC' && state.length ? mscFromRef(Float64Array.from(state)) : makeTransformer(type, params, EMPTY)
    return { apply: (X) => t.apply(X), free: () => {} }
  },
}

function jsWrap(t: Transformer, state: number[]): FittedTransformer {
  return { state, apply: (X) => t.apply(X), free: () => {} }
}
