// The engine the app uses. On the served build it runs the full WASM coordinator
// path — dag-ml's SequentialScheduler (WASM) drives the CV, libn4m (WASM) does the
// numerics. Offline (file:// single-file) it skips dag-ml/worker scheduling but
// still prefers the inlined libn4m WASM backend; pure-JS NIPALS is only a final
// fallback for legacy PLS-family runs in the explicit transitional profile.
import { jsBackend, loadLibn4mBackend } from './backends'
import { DagMlEngine } from './dagml-engine'
import { activeOrGenerator, dagMlAvailable, expandGeneratorVariants, hasUnsupportedGenerator } from './dagml'
import { assertAomBudget } from './guard'
import { backendIdOf, predictPipeline, runGeneratorOr, runPipeline } from './orchestrate'
import { isPortableCoreModel, predictPortableCore, tryRunPortableCore } from './portable-core'
import { withWasmRobustnessEvidencePublicationTrace } from './robustness-evidence'
import { createRobustnessEvidencePublisherFromSidecar } from './robustness-evidence-sidecar'
import { makeRtError, RtErrorException } from './rt'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'
import { buildWebRuntimeProfile, type WebRuntimePolicy, type WebRuntimeProfile, webRuntimePolicy } from './web-profile'

export interface MainEngineOptions {
  /** true when MainEngine runs on the browser UI thread instead of a Worker. */
  mainThread?: boolean
  /** served build uses dag-ml; offline/inline-worker builds can force direct libn4m. */
  useDagMl?: boolean
  /** Product execution profile. Builds inject this explicitly; tests/hosts may override it. */
  profile?: WebRuntimeProfile
}

export class MainEngine implements Engine {
  readonly name = 'nirs4all-wasm'
  private readonly dagml: DagMlEngine
  private readonly mainThread: boolean
  private readonly useDagMlEngine: boolean
  private readonly policy: WebRuntimePolicy

  constructor(opts: MainEngineOptions = {}) {
    this.mainThread = opts.mainThread ?? (typeof location !== 'undefined' && location.protocol === 'file:')
    this.useDagMlEngine = opts.useDagMl ?? true
    this.policy = webRuntimePolicy(opts.profile ?? buildWebRuntimeProfile())
    this.dagml = new DagMlEngine({ profile: this.policy.profile })
  }

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    if (this.policy.schedulerFallback === 'forbid' && opts.allowFallback === true) {
      throw new RtErrorException(makeRtError({
        verb: 'run',
        cause: 'invalid_request',
        message: 'The strict Web profile forbids runtime fallback requests.',
        mitigation: 'Remove allowFallback, or use the explicitly transitional development/single-file profile.',
      }))
    }
    const useDagMl = this.useDagMlEngine && dagMlAvailable()
    const robustnessEvidencePublisher = opts.robustnessEvidencePublisher
      ?? createRobustnessEvidencePublisherFromSidecar(opts.robustnessEvidenceSidecar)
    // Warn (or refuse) an oversized operator-adaptive screen before any compute,
    // so a heavy AOM/POP run is never silent (it runs in a worker, cancellable).
    assertAomBudget(ds, dsl, opts.onProgress, { mainThread: this.mainThread })
    const portable = await tryRunPortableCore(ds, dsl, opts)
    if (portable) {
      return withWasmRobustnessEvidencePublicationTrace(
        portable,
        ds,
        opts.robustnessEvidencePublicationHandoff,
        robustnessEvidencePublisher,
      )
    }
    if (useDagMl) {
      const result = await this.dagml.run(ds, dsl, opts) // dag-ml executes; libn4m numerics
      return withWasmRobustnessEvidencePublicationTrace(
        result,
        ds,
        opts.robustnessEvidencePublicationHandoff,
        robustnessEvidencePublisher,
      )
    }
    if (this.useDagMlEngine) {
      throw new RtErrorException(makeRtError({
        verb: 'run',
        cause: 'unavailable_backend',
        message: 'dag-ml WASM is unavailable; refusing to run the browser/WASM path through the direct compatibility runner.',
        mitigation: 'Use the explicit single-file/offline engine path (useDagMl:false), or serve the app over HTTP(S) with the staged dag-ml WASM assets.',
      }))
    }
    if (this.policy.nativeWasmRequired) {
      throw new RtErrorException(makeRtError({
        verb: 'run',
        cause: 'unsupported_capability',
        message: 'The strict Web profile refuses the direct compatibility runner.',
        mitigation: 'Use the staged dag-ml/libn4m WASM route, or select the transitional profile for development or single-file use.',
        unsupported_capability: 'direct_browser_compatibility_runner',
      }))
    }
    // Offline single-file: dag-ml scheduling is intentionally disabled under
    // file://, but vite-plugin-singlefile inlines libn4m's WASM. Use it when
    // available so catalog models such as AOM/POP do not fall back to slow or
    // unsupported JS behavior.
    let backend = jsBackend
    try {
      backend = await loadLibn4mBackend()
    } catch (e) {
      opts.onProgress?.({
        phase: 'preprocess',
        pct: 1,
        message: `libn4m unavailable in offline mode — using JS fallback (${e instanceof Error ? e.message : String(e)})`,
      })
    }
    // Handle a generator-OR pipeline by expanding alternatives + selecting the
    // best by the canonical metric (host argmin/argmax — dag-ml scheduling is off
    // under file://).
    if (hasUnsupportedGenerator(dsl)) {
      throw new Error('Cartesian generators (and more than one OR generator) are not executable yet — use a single OR generator.')
    }
    if (activeOrGenerator(dsl)) {
      const minimize = ds.taskType === 'regression'
      const metric: RunResult['scoreMetric'] = minimize ? 'rmse' : 'accuracy'
      const result = await runGeneratorOr(
        dsl,
        expandGeneratorVariants(dsl),
        metric,
        minimize,
        (candidate) => runPipeline(ds, candidate, opts, backend),
        async (ranked) => ranked.reduce((best, r) => ((minimize ? r.metric < best.metric : r.metric > best.metric) ? r : best)).id,
      )
      return withWasmRobustnessEvidencePublicationTrace(
        result,
        ds,
        opts.robustnessEvidencePublicationHandoff,
        robustnessEvidencePublisher,
      )
    }
    const result = await runPipeline(ds, dsl, opts, backend)
    return withWasmRobustnessEvidencePublicationTrace(
      result,
      ds,
      opts.robustnessEvidencePublicationHandoff,
      robustnessEvidencePublisher,
    )
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    if (isPortableCoreModel(model)) {
      return predictPortableCore(model, Xnew, nSamples, nFeatures)
    }
    // A libn4m-fitted model MUST predict with libn4m — the model blob shape and the
    // preprocessing math differ from the JS backend, so never coerce it through JS.
    if (backendIdOf(model) === 'libn4m-wasm') {
      const backend = await loadLibn4mBackend()
      return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
    }
    if (this.policy.jsBackendFallback === 'forbid') {
      throw new RtErrorException(makeRtError({
        verb: 'predict',
        cause: 'unsupported_capability',
        message: 'The strict Web profile refuses prediction with a JavaScript-backend model.',
        mitigation: 'Refit or import a model produced by the portable Core or libn4m WASM backend.',
        unsupported_capability: 'javascript_model_backend',
      }))
    }
    return predictPipeline(model, Xnew, nSamples, nFeatures, jsBackend)
  }
}
