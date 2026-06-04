// StubEngine — the pure-JS PLS engine (NIPALS) behind the shared orchestration.
// Kept as a thin, dependency-free engine for unit tests and as the offline
// fallback backend. The app uses MainEngine, which prefers real libn4m WASM.
import { jsBackend } from './backends'
import { predictPipeline, runPipeline } from './orchestrate'
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'

export class StubEngine implements Engine {
  readonly name = 'stub-js-pls'

  run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    return runPipeline(ds, dsl, opts, jsBackend)
  }

  predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    return Promise.resolve(predictPipeline(model, Xnew, nSamples, nFeatures, jsBackend))
  }
}
