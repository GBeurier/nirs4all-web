// The engine the app uses. Served and offline (file:// single-file, in an inline Web Worker)
// builds run the same full WASM coordinator path — dag-ml's SequentialScheduler (WASM)
// drives CV and the restricted single-holdout bank; Methods owns numerics:
// when dag-ml is unavailable the run is refused. Imported non-nativeRefit libn4m / ml.js
// models keep their predict and export paths; JavaScript-backend models are refused.
import { loadLibn4mBackend } from './backends'
import { loadMlJsBackend } from './mljs-backend'
import { isArchiveV2Model, predictArchiveV2 } from './archive-v2'
import { DagMlEngine } from './dagml-engine'
import { dagMlAvailable } from './dagml'
import { assertAomBudget } from './guard'
import { missingTargetCount } from './partition'
import { physicalIdentity } from './relations'
import { backendIdOf, exportPipeline, predictPipeline, predictPipelineMatrix, type ModelBackend } from './orchestrate'
import { explainRefusal, type ExplainBinding, type PredictionMatrix, runExplain, validateExplainRequest } from './explain'
import { loadMethodsWasm } from './nirs4all-core'
import { isPortableCoreModel, portableCoreRefusal } from './portable-core'
import { exportSingleHoldoutModel, isSingleHoldoutModel, predictSingleHoldout, tryRunSingleHoldout } from './single-holdout'
import { withWasmRobustnessEvidencePublicationTrace } from './robustness-evidence'
import { createRobustnessEvidencePublisherFromSidecar } from './robustness-evidence-sidecar'
import { makeRtError, RtErrorException } from './rt'
import type { Engine, ExplainOptions, ExplainRequest, ExplainResponse, ExportOptions, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'
import { buildWebRuntimeProfile, type WebRuntimePolicy, type WebRuntimeProfile, webRuntimePolicy } from './web-profile'

export interface MainEngineOptions {
  /** true when MainEngine runs on the browser UI thread instead of a Worker. */
  mainThread?: boolean
  /** Product execution profile. Builds inject this explicitly; tests/hosts may override it. */
  profile?: WebRuntimeProfile
}

/** Models fitted by the retired pure-JavaScript backend are no longer replayed or re-exported. */
function javascriptBackendRefusal(verb: 'predict' | 'export'): RtErrorException {
  return new RtErrorException(makeRtError({
    verb,
    cause: 'unsupported_capability',
    message: `The browser engine refuses to ${verb} a JavaScript-backend model: that backend was retired.`,
    mitigation: 'Refit the pipeline, or import a current model produced by dag-ml or libn4m WASM.',
    unsupported_capability: 'javascript_model_backend',
  }))
}

export class MainEngine implements Engine {
  readonly name = 'nirs4all-wasm'
  private readonly dagml: DagMlEngine
  private readonly mainThread: boolean
  private readonly policy: WebRuntimePolicy

  constructor(opts: MainEngineOptions = {}) {
    this.mainThread = opts.mainThread ?? (typeof location !== 'undefined' && location.protocol === 'file:')
    this.policy = webRuntimePolicy(opts.profile ?? buildWebRuntimeProfile())
    this.dagml = new DagMlEngine({ profile: this.policy.profile })
  }

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    if (this.policy.schedulerFallback === 'forbid' && opts.allowFallback === true) {
      throw new RtErrorException(makeRtError({
        verb: 'run',
        cause: 'invalid_request',
        message: 'The strict Web profile forbids runtime fallback requests.',
        mitigation: 'Remove allowFallback, or use the explicitly transitional development profile.',
      }))
    }
    const dagMlReady = dagMlAvailable()
    const robustnessEvidencePublisher = opts.robustnessEvidencePublisher
      ?? createRobustnessEvidencePublisherFromSidecar(opts.robustnessEvidenceSidecar)
    // Warn (or refuse) an oversized operator-adaptive screen before any compute,
    // so a heavy AOM/POP run is never silent (it runs in a worker, cancellable).
    assertAomBudget(ds, dsl, opts.onProgress, { mainThread: this.mainThread })
    // Preserve the old restricted eligibility boundary; relations/repeated scans
    // stay on their existing DAG path. Matched holdout failures never reroute.
    const portable = ds.groupIds || ds.originIds || ds.repetitionIds || ds.augmented || missingTargetCount(ds) || physicalIdentity(ds).repeated ? null : await tryRunSingleHoldout(ds, dsl, opts)
    if (portable) {
      return withWasmRobustnessEvidencePublicationTrace(
        portable,
        ds,
        opts.robustnessEvidencePublicationHandoff,
        robustnessEvidencePublisher,
      )
    }
    if (dagMlReady) {
      const result = await this.dagml.run(ds, dsl, opts) // dag-ml executes; libn4m numerics
      return withWasmRobustnessEvidencePublicationTrace(
        result,
        ds,
        opts.robustnessEvidencePublicationHandoff,
        robustnessEvidencePublisher,
      )
    }
    throw new RtErrorException(makeRtError({
      verb: 'run',
      cause: 'unavailable_backend',
      message: 'dag-ml WASM is unavailable; refusing to run the browser/WASM path without it.',
      mitigation: 'Serve the app over HTTP(S) or use the single-file build, both of which run the staged dag-ml WASM in a Web Worker.',
    }))
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number, featureNames?: string[]): Promise<PredictResult> {
    if (isArchiveV2Model(model)) {
      // Archive replay is always native and fail-closed in both product
      // profiles. Transitional mode never substitutes a JS model or two
      // independent mono-target fits for the canonical multi-target N4MM.
      return predictArchiveV2(model, Xnew, nSamples, nFeatures)
    }
    if (isPortableCoreModel(model)) {
      throw portableCoreRefusal('predict')
    }
    if (isSingleHoldoutModel(model)) return predictSingleHoldout(model, Xnew, nSamples, nFeatures, featureNames)
    if ((model.state as { nativeRefit?: unknown } | null)?.nativeRefit) {
      return this.dagml.predict(model, Xnew, nSamples, nFeatures, featureNames)
    }
    // A libn4m-fitted model MUST predict with libn4m — the model blob shape and the
    // preprocessing math differ from the JS backend, so never coerce it through JS.
    if (backendIdOf(model) === 'libn4m-wasm') {
      const backend = await loadLibn4mBackend()
      return predictPipeline(model, Xnew, nSamples, nFeatures, backend, featureNames)
    }
    if (backendIdOf(model) === 'mljs-classic') {
      return predictPipeline(model, Xnew, nSamples, nFeatures, await loadMlJsBackend(), featureNames)
    }
    throw javascriptBackendRefusal('predict')
  }

  /**
   * The prediction matrix (rows x outputs) of the complete fitted pipeline for an
   * arbitrary input matrix, through the SAME dispatch as `predict` for every model
   * kind. Kinds that cannot score an arbitrary matrix are refused with a typed
   * `explain` RtError. Classification relabelling never happens here; callers refuse
   * classifiers before calling (scores are not calibrated probabilities).
   */
  async predictMatrix(model: FittedPipeline, X: Float64Array, nRows: number, nFeatures: number, featureNames?: string[]): Promise<PredictionMatrix> {
    if (isArchiveV2Model(model)) {
      const r = await predictArchiveV2(model, X, nRows, nFeatures)
      const cols = r.cols ?? 1
      return { data: r.values, rows: r.rows ?? nRows, cols }
    }
    if (isPortableCoreModel(model)) {
      throw explainRefusal(
        'Historical portable Core coefficient states have no replay route, so they cannot be explained.',
        'Keep the original download; refit the pipeline to explain it.',
        'legacy_portable_core_coefficients',
      )
    }
    if (isSingleHoldoutModel(model)) {
      const r = await predictSingleHoldout(model, X, nRows, nFeatures, featureNames)
      return { data: r.values, rows: nRows, cols: 1 }
    }
    if ((model.state as { nativeRefit?: unknown } | null)?.nativeRefit) {
      return this.dagml.predictMatrix(model, X, nRows, nFeatures, featureNames)
    }
    if (backendIdOf(model) === 'libn4m-wasm') {
      return predictPipelineMatrix(model, X, nRows, nFeatures, await loadLibn4mBackend(), featureNames)
    }
    if (backendIdOf(model) === 'mljs-classic') {
      return predictPipelineMatrix(model, X, nRows, nFeatures, await loadMlJsBackend(), featureNames)
    }
    throw explainRefusal(
      'The browser engine cannot replay a JavaScript-backend model, so it cannot be explained.',
      'Refit the pipeline, or import a current model produced by dag-ml or libn4m WASM.',
      'javascript_model_backend',
    )
  }

  async explain(request: ExplainRequest, opts: ExplainOptions = {}): Promise<ExplainResponse> {
    // Validation (task type, shapes, settings) precedes any WASM load or model evaluation.
    validateExplainRequest(request)
    const methods: ExplainBinding = await loadMethodsWasm()
    if (typeof methods.explainModel !== 'function') {
      throw explainRefusal(
        'The staged Methods WASM does not expose the explain API.',
        'Restage a Methods build that includes explainModel.',
        'methods_explain_api',
      )
    }
    const { model, featureNames } = request
    return runExplain(request, methods, this.explainPredictor(model, featureNames), opts)
  }

  /**
   * Batch predictor for one explanation. A native browser REFIT model is validated once:
   * the first batch goes through the complete dag-ml replay (package + learned-state binding
   * checks, identity-aligned PREDICT), and the replay's own host-sidecar function
   * (`predictPipelineMatrix` on the same fitted state) must reproduce it bit for bit. The
   * remaining perturbed batches — synthetic rows with no sample identity — then call that
   * validated function directly instead of re-hashing the model and every batch per call.
   * Every other model kind keeps its own predict dispatch.
   */
  private explainPredictor(model: FittedPipeline, featureNames?: string[]): (X: Float64Array, nRows: number, nFeatures: number) => Promise<PredictionMatrix> {
    if (!(model.state as { nativeRefit?: unknown } | null)?.nativeRefit) {
      return (X, n, p) => this.predictMatrix(model, X, n, p, featureNames)
    }
    let validated: ModelBackend | null = null
    return async (X, n, p) => {
      if (validated) return predictPipelineMatrix(model, X, n, p, validated, featureNames)
      const replayed = await this.dagml.predictMatrix(model, X, n, p, featureNames)
      const backend = backendIdOf(model) === 'mljs-classic' ? await loadMlJsBackend() : await loadLibn4mBackend()
      const direct = predictPipelineMatrix(model, X, n, p, backend, featureNames)
      if (direct.rows !== replayed.rows || direct.cols !== replayed.cols || direct.data.some((v, i) => !Object.is(v, replayed.data[i]))) {
        throw new Error('The validated dag-ml replay and the fitted browser pipeline disagree; the model cannot be explained.')
      }
      validated = backend
      return replayed
    }
  }

  async exportModel(model: FittedPipeline, { allowTrainingRows }: ExportOptions): Promise<FittedPipeline> {
    // Imported native archives keep their existing no-re-export policy.
    if (isArchiveV2Model(model)) throw new Error('An imported Archive V2 model is not re-exported by the web client.')
    if (isPortableCoreModel(model)) throw portableCoreRefusal('export')
    if (isSingleHoldoutModel(model)) return exportSingleHoldoutModel(model)
    if ((model.state as { nativeRefit?: unknown } | null)?.nativeRefit) {
      return this.dagml.exportModel(model, { allowTrainingRows })
    }
    const id = backendIdOf(model)
    if (id !== 'libn4m-wasm' && id !== 'mljs-classic') throw javascriptBackendRefusal('export')
    return exportPipeline(model, allowTrainingRows, id === 'libn4m-wasm' ? await loadLibn4mBackend() : await loadMlJsBackend())
  }
}
