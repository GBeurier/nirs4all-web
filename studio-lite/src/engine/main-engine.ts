// The engine the app uses. On the served build it runs the full WASM coordinator
// path — dag-ml's SequentialScheduler (WASM) drives the CV, libn4m (WASM) does the
// numerics. Offline (file:// single-file) it skips dag-ml/worker scheduling but
// still prefers the inlined libn4m WASM backend; pure-JS NIPALS is only a final
// fallback for legacy PLS-family runs.
import { jsBackend, loadLibn4mBackend } from './backends'
import { DagMlEngine } from './dagml-engine'
import { activeOrGenerator, dagMlAvailable, expandGeneratorVariants, hasUnsupportedGenerator } from './dagml'
import { assertAomBudget } from './guard'
import { backendIdOf, predictPipeline, runGeneratorOr, runPipeline } from './orchestrate'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'

interface MainEngineOptions {
  /** true when MainEngine runs on the browser UI thread instead of a Worker. */
  mainThread?: boolean
  /** served build uses dag-ml; offline/inline-worker builds can force direct libn4m. */
  useDagMl?: boolean
}

export class MainEngine implements Engine {
  readonly name = 'nirs4all-wasm'
  private dagml = new DagMlEngine()
  private readonly mainThread: boolean
  private readonly useDagMlEngine: boolean

  constructor(opts: MainEngineOptions = {}) {
    this.mainThread = opts.mainThread ?? (typeof location !== 'undefined' && location.protocol === 'file:')
    this.useDagMlEngine = opts.useDagMl ?? true
  }

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    const useDagMl = this.useDagMlEngine && dagMlAvailable()
    // Warn (or refuse) an oversized operator-adaptive screen before any compute,
    // so a heavy AOM/POP run is never silent (it runs in a worker, cancellable).
    assertAomBudget(ds, dsl, opts.onProgress, { mainThread: this.mainThread })
    if (useDagMl) return this.dagml.run(ds, dsl, opts) // dag-ml executes; libn4m numerics
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
      return runGeneratorOr(
        dsl,
        expandGeneratorVariants(dsl),
        metric,
        minimize,
        (candidate) => runPipeline(ds, candidate, opts, backend),
        async (ranked) => ranked.reduce((best, r) => ((minimize ? r.metric < best.metric : r.metric > best.metric) ? r : best)).id,
      )
    }
    return runPipeline(ds, dsl, opts, backend)
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    // A libn4m-fitted model MUST predict with libn4m — the model blob shape and the
    // preprocessing math differ from the JS backend, so never coerce it through JS.
    if (backendIdOf(model) === 'libn4m-wasm') {
      const backend = await loadLibn4mBackend()
      return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
    }
    return predictPipeline(model, Xnew, nSamples, nFeatures, jsBackend)
  }
}
