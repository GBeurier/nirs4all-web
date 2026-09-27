import type { Mat } from './algo/linalg'
import { type PlsModel, plsFit, plsPredict } from './algo/pls'
import {
  exportN4me,
  isNativeModelState,
  fitModel as fitNativeModel,
  predictModel as predictNativeModel,
  predictNamedPipeline,
} from './methods/n4m'
import { jsPreprocessor, libn4mPreprocessor } from './methods/preproc'
import { loadMethodsWasm } from './nirs4all-core'
import type { ModelBackend } from './orchestrate'
import { n4mToken } from '@/catalog/native'
import { nodeByType } from '@/catalog/nodes'
import { makeRtError, RtErrorException } from './rt'

/** The one model the offline JS fallback implements (NIPALS PLS regression). */
const PLS_REGRESSION_TOKEN = n4mToken('models.pls.pls_regression')

/** Pure-JS NIPALS PLS + JS preprocessing — OFFLINE fallback only (file:// can't
 *  load the emscripten module). The served/public build uses libn4m for both.
 *  Only PLS regression is supported here (classification uses it through one-hot
 *  targets); the offline build is a degraded demonstrator. */
export const jsBackend: ModelBackend = {
  id: 'js-pls',
  // Offline NIPALS only models PLS. Fail loudly on anything else rather than
  // silently fitting PLS for it (the served build uses libn4m for all models).
  fit: (spec, X, Y, nComp) => {
    if (spec.type !== PLS_REGRESSION_TOKEN) {
      throw new Error(`Offline mode runs PLS regression only; "${nodeByType(spec.type)?.name ?? spec.type}" needs the served build (libn4m).`)
    }
    return plsFit(X, Y, nComp)
  },
  predict: (model, X) => plsPredict(model as PlsModel, X),
  // NIPALS keeps weights and loadings, no training rows
  share: (model) => model,
  preproc: jsPreprocessor,
}

/**
 * The real nirs4all-methods engine (libn4m, C++ → WASM). Lazily imported so the
 * n4m.wasm only loads when actually used (served build).
 *
 * Every manifest-generated model node is fitted through the generic n4m role API
 * by method id and stored as portable N4ME bytes (methods/n4m.ts). The two
 * hand-written models the manifest does not list, PLS Canonical / PLS SVD, keep
 * the legacy coefficient dispatcher (`fitModel` / `predictModel`).
 */
export async function loadLibn4mBackend(): Promise<ModelBackend> {
  const n4m = await loadMethodsWasm()
  const backend: ModelBackend = {
    id: 'libn4m-wasm',
    fit: (spec, X, Y, nComp) => {
      const def = nodeByType(spec.type)
      if (def?.native) {
        const params = def.params.some((p) => p.name === 'n_components') ? { ...spec.params, n_components: nComp } : spec.params
        return fitNativeModel(spec.type, params, X, Y)
      }
      // Canonical/SVD PLS extract joint X/Y directions, so their component
      // count is bounded by Y as well as X.
      return n4m.fitModel(spec.type, X, Y, Math.min(nComp, Y.cols), [])
    },
    predict: (model, X) => {
      if (isNativeModelState(model)) return predictNativeModel(model, X)
      const r = n4m.predictModel(model as ReturnType<typeof n4m.fitModel>, { data: X.data, rows: X.rows, cols: X.cols })
      return { data: r.data, rows: r.rows, cols: r.cols } as Mat
    },
    // N4ME states are re-exported by libn4m with the user's choice; the legacy
    // Canonical/SVD coefficient models keep no training rows.
    share: (model, allowTrainingRows) =>
      isNativeModelState(model) ? { ...model, n4me: exportN4me(model.n4me, allowTrainingRows) } : model,
    // A chain of N4ME transformers / selectors ending in an N4ME model is one
    // native RolePipeline: libn4m then checks the input column names (F03).
    // Train-only row operators (state null) are not replayed; a feature union or
    // a legacy coefficient model is not one pipeline.
    predictNamed: (st, modelType, X, featureNames, inputNames) => {
      const model = st.model
      if ((st.branch && st.branch.length >= 2) || !isNativeModelState(model) || !model.fitParams) return undefined
      const replayed = st.chain.filter((s) => s.state !== null)
      if (!replayed.every((s) => s.state instanceof Uint8Array)) return undefined
      const steps = replayed.map((s) => ({ type: s.type, params: s.params, n4me: s.state as Uint8Array }))
      return predictNamedPipeline(steps, { type: modelType, state: { ...model, fitParams: model.fitParams } }, X, featureNames, inputNames)
    },
    preproc: libn4mPreprocessor, // preprocessing numerics in libn4m too
  }
  return {
    ...backend,
    fit: (spec, X, Y, nComp) => {
      try {
        return backend.fit(spec, X, Y, nComp)
      } catch (error) {
        if (!(error instanceof n4m.N4mError)) throw error
        const numerical = error.status === n4m.Status.ERR_NUMERICAL_FAILURE || /convergence failed/i.test(error.message)
        throw new RtErrorException(makeRtError({
          verb: 'run',
          cause: error.status === n4m.Status.ERR_INVALID_ARGUMENT ? 'invalid_request' : 'runtime_error',
          message: `${nodeByType(spec.type)?.name ?? spec.type} could not fit ${X.rows} samples × ${X.cols} features${'n_components' in spec.params ? ` with ${nComp} components` : ''}: ${error.message}.`,
          mitigation: numerical
            ? 'Try fewer components and check for constant or redundant features and targets.'
            : 'Check this model’s parameters and the dataset dimensions.',
          detail: error.stack,
        }))
      }
    },
  }
}
