import type { Mat } from './algo/linalg'
import { type PlsModel, plsFit, plsPredict } from './algo/pls'
import { jsPreprocessor, libn4mPreprocessor } from './methods/preproc'
import type { ModelBackend } from './orchestrate'

/** Pure-JS NIPALS PLS + JS preprocessing — OFFLINE fallback only (file:// can't
 *  load the emscripten module). The served/public build uses libn4m for both. */
export const jsBackend: ModelBackend = {
  id: 'js-pls',
  fit: (X, Y, nComp) => plsFit(X, Y, nComp),
  predict: (model, X) => plsPredict(model as PlsModel, X),
  preproc: jsPreprocessor,
}

/**
 * The real nirs4all-methods engine (libn4m, C++ → WASM). Lazily imported so the
 * ~1.4 MB n4m.wasm only loads when actually used (served build); the model blob
 * it returns is plain serializable data.
 */
export async function loadLibn4mBackend(): Promise<ModelBackend> {
  const n4m = await import('./wasm/methods/index.js')
  await n4m.loadModule()
  return {
    id: 'libn4m-wasm',
    fit: (X, Y, nComp) =>
      n4m.fitPls({ data: X.data, rows: X.rows, cols: X.cols }, { data: Y.data, rows: Y.rows, cols: Y.cols }, nComp),
    predict: (model, X) => {
      const r = n4m.predictPls(model as ReturnType<typeof n4m.fitPls>, { data: X.data, rows: X.rows, cols: X.cols })
      return { data: r.data, rows: r.rows, cols: r.cols } as Mat
    },
    preproc: libn4mPreprocessor, // preprocessing numerics in libn4m too
  }
}
