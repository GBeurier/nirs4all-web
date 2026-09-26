// Preprocessing is a BACKEND capability — the numerics live in libn4m (C++ → WASM),
// not in TypeScript. `libn4mPreprocessor` drives the generic operator dispatcher
// (@nirs4all/methods ppCreate/ppFit/ppTransform/ppGetState/ppSetState); the
// fitted state (e.g. the MSC reference spectrum) round-trips as plain doubles so a
// saved model (.n4a) can re-apply it for predict-later without retraining.
//
// `jsPreprocessor` is the OFFLINE-ONLY degraded fallback (the single-file file://
// build can't load the emscripten module): it wraps the small JS transforms in
// algo/preprocessing.ts. The served/public build always uses libn4m.
import type { Mat } from '../algo/linalg'
import { colMeans } from '../algo/linalg'
import { type Transformer, makeTransformer, mscFromRef } from '../algo/preprocessing'
import { nodeByType } from '@/catalog/nodes'
import { methodsWasm } from '../nirs4all-core'
import type { PpOperator } from '../wasm/methods/index.js'
import { legacyParamVector } from './params'

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

const EMPTY: Mat = { data: new Float64Array(0), rows: 0, cols: 0 }

/** libn4m-backed preprocessing — all numerics in C++ (the production path). */
export const libn4mPreprocessor: Preprocessor = {
  id: 'libn4m',
  fit(type, params, train) {
    const { ppCreate, ppDestroy, ppFit, ppGetState } = methodsWasm()
    const op = ppCreate(type, legacyParamVector(nodeByType(type), params))
    try {
      ppFit(op, train.data, train.rows, train.cols) // no-op for stateless ops
      return wrap(op, Array.from(ppGetState(op)))
    } catch (e) {
      ppDestroy(op)
      throw e
    }
  },
  restore(type, params, state) {
    const { ppCreate, ppDestroy, ppSetState } = methodsWasm()
    const op = ppCreate(type, legacyParamVector(nodeByType(type), params))
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
    apply: (X: Mat): Mat => ({ data: methodsWasm().ppTransform(op, X.data, X.rows, X.cols), rows: X.rows, cols: X.cols }),
    free: () => methodsWasm().ppDestroy(op),
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
