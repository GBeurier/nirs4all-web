// Owner-preview worker factory for the served / dev build. It spawns the same
// engine worker module as `client.ts` through a real-URL module worker, so the
// emitted code-split chunks (Methods / dag-ml WASM glue) resolve against the
// worker's own asset URL. The single-file build aliases this module to
// `preview-worker.singlefile.ts` (see vite.config.ts).
export function createPreviewWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}
