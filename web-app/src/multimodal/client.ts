import type { LabConfig, LabDataset, LabProgress, LabRunResult, LabWorkerReply, LabWorkerRequest } from './types'
export { defaultLabConfig } from './recipes'
export type { LabConfig, LabDataset, LabProgress, LabRunResult } from './types'

/** One owned compute worker. Abort terminates synchronous native training. */
export class LabClient {
  private worker: Worker | null = null
  private pending: { id: string; resolve(value: LabRunResult): void; reject(reason: Error): void
    progress?: (value: LabProgress) => void; cleanup(): void } | null = null

  run(dataset: LabDataset, configs: LabConfig[], onProgress?: (value: LabProgress) => void, signal?: AbortSignal): Promise<LabRunResult> {
    if (this.pending) return Promise.reject(new Error('A laboratory run is already active'))
    if (signal?.aborted) return Promise.reject(new DOMException('Laboratory run cancelled', 'AbortError'))
    const worker = this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const abort = () => this.cancel()
      this.pending = { id, resolve, reject, progress: onProgress, cleanup: () => signal?.removeEventListener('abort', abort) }
      signal?.addEventListener('abort', abort, { once: true })
      worker.onmessage = (event: MessageEvent<LabWorkerReply>) => {
        const current = this.pending, message = event.data
        if (!current || current.id !== message.id) return
        if (message.kind === 'progress') { current.progress?.(message.progress); return }
        this.pending = null
        current.cleanup()
        if (message.kind === 'result') current.resolve(message.result)
        else { const error = new Error(message.error.message); error.name = message.error.name; current.reject(error) }
      }
      worker.onerror = event => {
        const current = this.pending
        this.pending = null
        current?.cleanup()
        current?.reject(new Error(event.message || 'Laboratory compute worker failed'))
        worker.terminate()
        this.worker = null
      }
      try {
        // Clone rather than transfer: the controlled UI keeps its original dataset.
        worker.postMessage({ id, kind: 'run', dataset, configs } satisfies LabWorkerRequest)
      } catch (error) {
        this.pending = null
        signal?.removeEventListener('abort', abort)
        reject(error)
      }
    })
  }

  cancel(): void {
    this.worker?.terminate()
    this.worker = null
    const current = this.pending
    this.pending = null
    current?.cleanup()
    current?.reject(new DOMException('Laboratory run cancelled', 'AbortError'))
  }

  dispose(): void { this.cancel() }
}

export function createLabClient(): LabClient { return new LabClient() }
