import type { Mat } from './algo/linalg'
import { type PlsModel, plsFit, plsPredict } from './algo/pls'
import { LEGACY_PLS_MODELS, modelParamVector } from './methods/models'
import { jsPreprocessor, libn4mPreprocessor } from './methods/preproc'
import type { ModelBackend } from './orchestrate'

/** Pure-JS NIPALS PLS + JS preprocessing — OFFLINE fallback only (file:// can't
 *  load the emscripten module). The served/public build uses libn4m for both.
 *  Only PLS / PLS-DA are supported here; any other catalog model falls back to
 *  NIPALS PLS (the offline build is a degraded demonstrator). */
export const jsBackend: ModelBackend = {
  id: 'js-pls',
  // Offline NIPALS only models PLS / PLS-DA. Fail loudly on anything else rather
  // than silently fitting PLS for it (the served build uses libn4m for all models).
  fit: (spec, X, Y, nComp) => {
    if (!LEGACY_PLS_MODELS.has(spec.type)) {
      throw new Error(`Offline mode runs PLS-family models only; "${spec.type}" needs the served build (libn4m).`)
    }
    return plsFit(X, Y, nComp)
  },
  predict: (model, X) => plsPredict(model as PlsModel, X),
  preproc: jsPreprocessor,
}

/**
 * The real nirs4all-methods engine (libn4m, C++ → WASM). Lazily imported so the
 * ~1.4 MB n4m.wasm only loads when actually used (served build); the model blob
 * it returns is plain serializable data.
 *
 * PLS / PLS-DA use the legacy SIMPLS fast-path (`fitPls`); every other catalog
 * model token routes through the generic coeff dispatcher (`fitModel`). Both
 * produce a coefficient triple predicted via the centred form, so a single
 * `predictModel` path covers all of them.
 */
export async function loadLibn4mBackend(): Promise<ModelBackend> {
  const n4m = await import('./wasm/methods/index.js')
  await n4m.loadModule()
  return {
    id: 'libn4m-wasm',
    fit: (spec, X, Y, nComp) => {
      const Xm = { data: X.data, rows: X.rows, cols: X.cols }
      const Ym = { data: Y.data, rows: Y.rows, cols: Y.cols }
      if (LEGACY_PLS_MODELS.has(spec.type)) {
        const m = n4m.fitPls(Xm, Ym, nComp)
        return { coefficients: m.coefficients, xMean: m.xMean, yMean: m.yMean, intercept: null, n_features: m.n_features, n_targets: m.n_targets }
      }
      // AOM-PLS screens preprocessing internally and returns input-space coeffs +
      // a genuine intercept (zero means), so it predicts on RAW X via predictModel's
      // explicit-intercept path. selectedOperator/score ride along on the model blob
      // (serialized in lineage) for display only.
      if (spec.type === 'AOMPLS') {
        const folds = Math.max(2, Math.round(Number(spec.params.screen_folds ?? 5)))
        return n4m.fitAom(Xm, Ym, nComp, folds)
      }
      return n4m.fitModel(spec.type, Xm, Ym, nComp, modelParamVector(spec.type, spec.params))
    },
    predict: (model, X) => {
      const r = n4m.predictModel(model as ReturnType<typeof n4m.fitModel>, { data: X.data, rows: X.rows, cols: X.cols })
      return { data: r.data, rows: r.rows, cols: r.cols } as Mat
    },
    preproc: libn4mPreprocessor, // preprocessing numerics in libn4m too
  }
}
