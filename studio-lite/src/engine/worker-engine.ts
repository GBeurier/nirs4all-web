// Main-thread Engine facade over the engine Web Worker (worker.ts). Implements
// the same Engine contract the app codes against, but every run/predict executes
// in the worker — so a long AOM screen or large CV never freezes the UI, progress
// still streams, and Cancel works. Messages are correlated by a per-call job id;
// a rejected job whose error was an AbortError is rebuilt as a DOMException so the
// app's existing cancel handling (App.tsx) behaves identically to the in-thread engine.
import { type RtError, RtErrorException } from './rt'
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
  | { type: 'error'; id: string; name: string; message: string; rtError?: RtError }

export class WorkerEngine implements Engine {
  readonly name = 'nirs4all-wasm-worker'
  private worker: Worker | null = null
  private seq = 0
  private readonly createWorker: () => Worker

  constructor(createWorker: () => Worker) {
    this.createWorker = createWorker
  }

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker()
    }
    return this.worker
  }

  private dispose(worker: Worker): void {
    if (this.worker === worker) this.worker = null
    worker.terminate()
  }

  private call<T>(payload: Record<string, unknown>, opts?: RunOptions): Promise<T> {
    const worker = this.ensure()
    const id = `job-${++this.seq}`
    return new Promise<T>((resolve, reject) => {
      let done = false
      const finish = (fn: () => void) => {
        if (done) return
        done = true
        cleanup()
        fn()
      }
      const onMessage = (ev: MessageEvent<OutMsg>) => {
        const m = ev.data
        if (!m || m.id !== id) return
        if (m.type === 'progress') {
          opts?.onProgress?.(m.progress)
          return
        }
        finish(() => {
          this.dispose(worker)
          if (m.type === 'result') resolve(m.result as T)
          // Preserve the typed RtError across the worker boundary (B-018): a strict
          // (allowFallback:false) refusal in the worker is rebuilt as an
          // RtErrorException so the main thread keeps the typed error path.
          else if (m.rtError) reject(new RtErrorException(m.rtError))
          else reject(m.name === 'AbortError' ? new DOMException(m.message, 'AbortError') : new Error(m.message))
        })
      }
      const onWorkerError = (ev: ErrorEvent) => {
        finish(() => {
          this.dispose(worker)
          reject(new Error(ev.message || 'Engine worker failed to load or crashed.'))
        })
      }
      const onMessageError = () => {
        finish(() => {
          this.dispose(worker)
          reject(new Error('Engine worker sent an unreadable message.'))
        })
      }
      const onAbort = () => {
        finish(() => {
          this.dispose(worker)
          reject(new DOMException('Operation canceled.', 'AbortError'))
        })
      }
      const cleanup = () => {
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onWorkerError)
        worker.removeEventListener('messageerror', onMessageError)
        opts?.signal?.removeEventListener('abort', onAbort)
      }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onWorkerError)
      worker.addEventListener('messageerror', onMessageError)
      if (opts?.signal) {
        if (opts.signal.aborted) {
          onAbort()
          return
        }
        opts.signal.addEventListener('abort', onAbort)
      }
      worker.postMessage({ ...payload, id })
    })
  }

  run(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult> {
    // allowFallback is a plain flag → forward it into the worker payload (onProgress/
    // signal stay main-thread). Omitted ⇒ default fallback behavior in the engine.
    return this.call<RunResult>({ type: 'run', ds, dsl, allowFallback: opts.allowFallback }, opts)
  }

  predict(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
    return this.call<PredictResult>({ type: 'predict', model, Xnew, nSamples, nFeatures })
  }
}
