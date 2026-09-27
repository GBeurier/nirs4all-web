// Preprocessing is a BACKEND capability — the numerics live in libn4m (C++ → WASM),
// not in TypeScript. `libn4mPreprocessor` fits every manifest-generated
// transformer / selector through the generic n4m role API (./n4m) and keeps its
// fitted state as portable N4ME bytes, so a saved model (.n4a) re-applies it for
// predict-later without retraining (`share` re-serializes those bytes for the
// export with the user's training-row choice). Sample filters and augmenters are
// train-only row operators (`resample`): they reshape the training rows and are
// never replayed at predict time.
//
// `jsPreprocessor` is the OFFLINE-ONLY degraded fallback (the single-file file://
// build can't load the emscripten module): it wraps the small JS transforms in
// algo/preprocessing.ts and has no row operators.
import { colMeans, type Mat, selectRows } from '../algo/linalg'
import { type Transformer, makeTransformer, mscFromRef, MSC_TOKEN } from '../algo/preprocessing'
import { nodeByType } from '@/catalog/nodes'
import { augmentRows, checkpoint, exportN4me, type FitContext, filterRows, fitEstimator, loadEstimator, transform } from './n4m'
import type { NativeEstimator } from '../wasm/methods/index.js'

/** Serialized fitted state of one step: N4ME bytes (libn4m) or the JS
 *  fallback's plain doubles. */
export type StepState = Uint8Array | number[]

/** A transformer fitted on train, carrying its serializable state. */
export interface FittedTransformer {
  apply(X: Mat): Mat
  state: StepState
  /** the state embeds training rows (sharing it shares them) */
  containsTrainingRows: boolean
  free(): void
}

export interface Preprocessor {
  id: string
  /** create + fit-on-train an operator, ready to transform any matrix */
  fit(type: string, params: Record<string, unknown>, train: Mat, ctx: FitContext): FittedTransformer
  /** recreate a fitted operator from a saved descriptor (predict-later) */
  restore(type: string, params: Record<string, unknown>, state: StepState): { apply(X: Mat): Mat; free(): void }
  /** apply a train-only row operator (sample filter / augmentation) to the training rows */
  resample(type: string, params: Record<string, unknown>, X: Mat, Y: Mat, axis: number[] | undefined): { X: Mat; Y: Mat }
  /** the shareable copy of a fitted state; refuses one embedding training rows unless allowed */
  share(state: StepState, allowTrainingRows: boolean): StepState
}

/** Sample filters and augmenters reshape the training rows only. */
export function isRowOperator(type: string): boolean {
  const category = nodeByType(type)?.category
  return category === 'filter' || category === 'augmentation'
}

const EMPTY: Mat = { data: new Float64Array(0), rows: 0, cols: 0 }

function stack(a: Mat, b: Mat): Mat {
  const out: Mat = { data: new Float64Array(a.data.length + b.data.length), rows: a.rows + b.rows, cols: a.cols }
  out.data.set(a.data)
  out.data.set(b.data, a.data.length)
  return out
}

function wrap(est: NativeEstimator, state: StepState, containsTrainingRows: boolean): FittedTransformer {
  return { state, containsTrainingRows, apply: (X: Mat): Mat => transform(est, X), free: () => est.dispose() }
}

/** libn4m-backed preprocessing — all numerics in C++ (the production path). */
export const libn4mPreprocessor: Preprocessor = {
  id: 'libn4m',
  fit(type, params, train, ctx) {
    const est = fitEstimator(type, params, train, ctx)
    try {
      const saved = checkpoint(est)
      return wrap(est, saved.n4me, saved.containsTrainingRows)
    } catch (e) {
      est.dispose()
      throw e
    }
  },
  restore(_type, _params, state) {
    const est = loadEstimator(state as Uint8Array)
    return { apply: (X: Mat): Mat => transform(est, X), free: () => est.dispose() }
  },
  resample(type, params, X, Y, axis) {
    if (nodeByType(type)?.category === 'filter') {
      const mask = filterRows(type, params, X, Y)
      const keep = mask.flatMap((k, r) => (k ? [r] : []))
      if (keep.length === 0) throw new Error(`${nodeByType(type)?.name ?? type} removed every training sample.`)
      return { X: selectRows(X, keep), Y: selectRows(Y, keep) }
    }
    // Augmentation adds the augmented copy of the training rows to the originals.
    const augmented = augmentRows(type, params, X, Y, axis)
    return { X: stack(X, augmented.X), Y: stack(Y, augmented.Y) }
  },
  share(state, allowTrainingRows) {
    return exportN4me(state as Uint8Array, allowTrainingRows)
  },
}

/** Pure-JS preprocessing — OFFLINE fallback only (file:// can't load the wasm). */
export const jsPreprocessor: Preprocessor = {
  id: 'js',
  fit(type, params, train) {
    if (type === MSC_TOKEN) {
      const ref = colMeans(train)
      const t = mscFromRef(ref)
      return jsWrap(t, Array.from(ref))
    }
    return jsWrap(makeTransformer(type, params, train), [])
  },
  restore(type, params, state) {
    const t = type === MSC_TOKEN && state.length ? mscFromRef(Float64Array.from(state as number[])) : makeTransformer(type, params, EMPTY)
    return { apply: (X) => t.apply(X), free: () => {} }
  },
  resample(type) {
    throw new Error(`Offline mode has no "${nodeByType(type)?.name ?? type}" row operator; it needs the served build (libn4m).`)
  },
  // the JS transforms keep no training rows (MSC stores the mean spectrum)
  share: (state) => state,
}

function jsWrap(t: Transformer, state: number[]): FittedTransformer {
  return { state, containsTrainingRows: false, apply: (X) => t.apply(X), free: () => {} }
}
