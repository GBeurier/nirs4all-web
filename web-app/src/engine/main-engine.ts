// The engine the app uses. Served and offline (file:// single-file, in an inline Web Worker)
// builds run the same full WASM coordinator path — dag-ml's SequentialScheduler (WASM)
// drives the CV, libn4m (WASM) does the numerics. There is no direct compatibility runner:
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
import { backendIdOf, exportPipeline, predictPipeline } from './orchestrate'
import { isPortableCoreModel, predictPortableCore, tryRunPortableCore } from './portable-core'
import { withWasmRobustnessEvidencePublicationTrace } from './robustness-evidence'
import { createRobustnessEvidencePublisherFromSidecar } from './robustness-evidence-sidecar'
import { makeRtError, RtErrorException } from './rt'
import type { Engine, ExportOptions, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'
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
    mitigation: 'Refit the pipeline, or import a model produced by the portable Core, dag-ml or libn4m WASM backend.',
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
    // The portable Core subset carries no relations: repeated scans of one physical sample
    // (and any declared relation) always take the relation-aware DAG-ML path.
    const portable = ds.groupIds || ds.originIds || ds.repetitionIds || ds.augmented || missingTargetCount(ds) || physicalIdentity(ds).repeated ? null : await tryRunPortableCore(ds, dsl, opts)
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
      return predictPortableCore(model, Xnew, nSamples, nFeatures, featureNames)
    }
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

  async exportModel(model: FittedPipeline, { allowTrainingRows }: ExportOptions): Promise<FittedPipeline> {
    // An imported archive is replayed, never re-exported; the portable Core
    // subset stores PLS coefficients only.
    if (isArchiveV2Model(model)) throw new Error('An imported Archive V2 model is not re-exported by the web client.')
    if (isPortableCoreModel(model)) return model
    if ((model.state as { nativeRefit?: unknown } | null)?.nativeRefit) {
      return this.dagml.exportModel(model, { allowTrainingRows })
    }
    const id = backendIdOf(model)
    if (id !== 'libn4m-wasm' && id !== 'mljs-classic') throw javascriptBackendRefusal('export')
    return exportPipeline(model, allowTrainingRows, id === 'libn4m-wasm' ? await loadLibn4mBackend() : await loadMlJsBackend())
  }
}
