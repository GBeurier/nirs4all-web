// Engine Web Worker: hosts MainEngine off the main thread so heavy libn4m /
// dag-ml WASM compute (notably the AOM operator screen on a large dataset) never
// blocks the UI. The main thread talks to it through WorkerEngine (worker-engine.ts)
// with a tiny request/response protocol: {run|predict|cancel} in, {progress|
// result|error} out, correlated by job id. onProgress is relayed as messages and
// AbortSignal is bridged to a per-job AbortController.
/// <reference lib="webworker" />
import { MainEngine } from './main-engine'
import type { RunOptions } from './types'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const engine = new MainEngine({ mainThread: false, useDagMl: ctx.location?.protocol !== 'blob:' })
const controllers = new Map<string, AbortController>()

interface RunMsg { type: 'run'; id: string; ds: Parameters<MainEngine['run']>[0]; dsl: Parameters<MainEngine['run']>[1] }
interface PredictMsg { type: 'predict'; id: string; model: Parameters<MainEngine['predict']>[0]; Xnew: Float64Array; nSamples: number; nFeatures: number }
interface CancelMsg { type: 'cancel'; id: string }
type InMsg = RunMsg | PredictMsg | CancelMsg

ctx.onmessage = (ev: MessageEvent<InMsg>) => {
  void handle(ev.data)
}

async function handle(msg: InMsg): Promise<void> {
  if (msg.type === 'cancel') {
    controllers.get(msg.id)?.abort()
    return
  }
  const ctrl = new AbortController()
  controllers.set(msg.id, ctrl)
  const opts: RunOptions = {
    signal: ctrl.signal,
    onProgress: (progress) => ctx.postMessage({ type: 'progress', id: msg.id, progress }),
  }
  try {
    const result =
      msg.type === 'run'
        ? await engine.run(msg.ds, msg.dsl, opts)
        : await engine.predict(msg.model, msg.Xnew, msg.nSamples, msg.nFeatures)
    ctx.postMessage({ type: 'result', id: msg.id, result })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    // forward name so the client can rebuild an AbortError DOMException (App.tsx
    // suppresses those) rather than surfacing a cancel as a hard error.
    ctx.postMessage({ type: 'error', id: msg.id, name: err.name, message: err.message })
  } finally {
    controllers.delete(msg.id)
  }
}
