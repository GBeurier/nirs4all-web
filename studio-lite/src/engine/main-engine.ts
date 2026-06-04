// The engine the app uses. On the served build it runs the full WASM coordinator
// path — dag-ml's SequentialScheduler (WASM) drives the CV, libn4m (WASM) does the
// numerics (DagMlEngine, which itself falls back to direct libn4m orchestration on
// any error). Offline (file://) it uses the pure-JS NIPALS backend. Same Engine
// contract throughout.
import { jsBackend, loadLibn4mBackend } from './backends'
import { DagMlEngine } from './dagml-engine'
import { dagMlAvailable } from './dagml'
import { backendIdOf, type ModelBackend, predictPipeline, runPipeline } from './orchestrate'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'

export class MainEngine implements Engine {
  readonly name = 'nirs4all-wasm'
  private dagml = new DagMlEngine()
  private libn4m: Promise<ModelBackend> | null = null

  private backend(): Promise<ModelBackend> {
    if (!dagMlAvailable()) return Promise.resolve(jsBackend) // file:// → JS PLS
    if (!this.libn4m) this.libn4m = loadLibn4mBackend().catch(() => jsBackend)
    return this.libn4m
  }

  async run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    if (dagMlAvailable()) return this.dagml.run(ds, dsl, opts) // dag-ml executes; libn4m numerics
    return runPipeline(ds, dsl, opts, jsBackend) // offline single-file
  }

  async predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    const backend = backendIdOf(model) === 'libn4m-wasm' ? await this.backend() : jsBackend
    return predictPipeline(model, Xnew, nSamples, nFeatures, backend)
  }
}
