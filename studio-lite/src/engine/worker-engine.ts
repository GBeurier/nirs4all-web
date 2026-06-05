// Main-thread Engine facade over the engine Web Worker (worker.ts). Implements
// the same Engine contract the app codes against, but every run/predict executes
// in the worker — so a long AOM screen or large CV never freezes the UI, progress
// still streams, and Cancel works. Messages are correlated by a per-call job id;
// a rejected job whose error was an AbortError is rebuilt as a DOMException so the
// app's existing cancel handling (App.tsx) behaves identically to the in-thread engine.
import type {
  Engine,
  FittedPipeline,
  MaterializedDataset,
  PipelineDSL,
  PredictResult,
  RunOptions,
  RunResult,
} from './types'

type OutMsg =
  | { type: 'progress'; id: string; progress: Parameters<NonNullable<RunOptions['onProgress']>>[0] }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id: string; name: string; message: string }

export class WorkerEngine implements Engine {
  readonly name = 'nirs4all-wasm-worker'
  private worker: Worker | null = null
  private seq = 0

  private ensure(): Worker {
    if (!this.worker) {
      // Module worker: the engine code-splits its WASM via dynamic import(), which
      // an IIFE worker can't bundle. The served build supports module workers; the
      // single-file (file://) build never instantiates this (see client.ts).
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    }
    return this.worker
  }

  private call<T>(payload: Record<string, unknown>, opts?: RunOptions): Promise<T> {
    const worker = this.ensure()
    const id = `job-${++this.seq}`
    return new Promise<T>((resolve, reject) => {
      const onMessage = (ev: MessageEvent<OutMsg>) => {
        const m = ev.data
        if (!m || m.id !== id) return
        if (m.type === 'progress') {
          opts?.onProgress?.(m.progress)
          return
        }
        cleanup()
        if (m.type === 'result') resolve(m.result as T)
        else reject(m.name === 'AbortError' ? new DOMException(m.message, 'AbortError') : new Error(m.message))
      }
      const onAbort = () => worker.postMessage({ type: 'cancel', id })
      const cleanup = () => {
        worker.removeEventListener('message', onMessage)
        opts?.signal?.removeEventListener('abort', onAbort)
      }
      worker.addEventListener('message', onMessage)
      if (opts?.signal) {
        if (opts.signal.aborted) onAbort()
        opts.signal.addEventListener('abort', onAbort)
      }
      worker.postMessage({ ...payload, id })
    })
  }

  run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    return this.call<RunResult>({ type: 'run', ds, dsl }, opts)
  }

  predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    return this.call<PredictResult>({ type: 'predict', model, Xnew, nSamples, nFeatures })
  }
}
