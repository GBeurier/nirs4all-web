// The engine the app uses. On the served build it runs the full WASM coordinator
// path — dag-ml's SequentialScheduler (WASM) drives the CV, libn4m (WASM) does the
// numerics (DagMlEngine, which itself falls back to direct libn4m orchestration on
// any error). Offline (file://) it uses the pure-JS NIPALS backend. Same Engine
// contract throughout.
import { jsBackend, loadLibn4mBackend } from './backends'
import { DagMlEngine } from './dagml-engine'
import { activeOrGenerator, dagMlAvailable, expandGeneratorVariants, hasUnsupportedGenerator } from './dagml'
import { backendIdOf, predictPipeline, runGeneratorOr, runPipeline } from './orchestrate'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'

export class MainEngine implements Engine {
  readonly name = 'nirs4all-wasm'
  private dagml = new DagMlEngine()

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    if (dagMlAvailable()) return this.dagml.run(ds, dsl, opts) // dag-ml executes; libn4m numerics
    // offline single-file (JS backend). Handle a generator-OR pipeline by
    // expanding alternatives + selecting the best by the canonical metric (host
    // argmin/argmax — dag-ml-wasm isn't loadable under file://).
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
        (candidate) => runPipeline(ds, candidate, opts, jsBackend),
        async (ranked) => ranked.reduce((best, r) => ((minimize ? r.metric < best.metric : r.metric > best.metric) ? r : best)).id,
      )
    }
    return runPipeline(ds, dsl, opts, jsBackend)
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    // A libn4m-fitted model MUST predict with libn4m — the model blob shape and the
    // preprocessing math differ from the JS backend, so never coerce it through JS.
    if (backendIdOf(model) === 'libn4m-wasm') {
      const backend = await loadLibn4mBackend() // throws under file:// → clear "needs libn4m"
      return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
    }
    return predictPipeline(model, Xnew, nSamples, nFeatures, jsBackend)
  }
}
