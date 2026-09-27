// StubEngine — the pure-JS PLS engine (NIPALS) behind the shared orchestration.
// Kept as a thin, dependency-free engine for unit tests and as the offline
// fallback backend. The app uses MainEngine, which prefers real libn4m WASM.
import { jsBackend } from './backends'
import { exportPipeline, predictPipeline, runPipeline } from './orchestrate'
import type { Engine, ExportOptions, FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult, RunOptions, RunResult } from './types'

export class StubEngine implements Engine {
  readonly name = 'stub-js-pls'

  run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    return runPipeline(ds, dsl, opts, jsBackend)
  }

  predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number, featureNames?: string[]): Promise<PredictResult> {
    return Promise.resolve(predictPipeline(model, Xnew, nSamples, nFeatures, jsBackend, featureNames))
  }

  exportModel(model: FittedPipeline, { allowTrainingRows }: ExportOptions): Promise<FittedPipeline> {
    return Promise.resolve(exportPipeline(model, allowTrainingRows, jsBackend))
  }
}
