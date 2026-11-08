// Single-file (file://) build engine. vite.config.ts aliases `@/engine/client`
// to this module in `singlefile` mode. The engine always runs in Vite's inline
// classic Blob worker (Chrome refuses Blob module workers on file://), where
// `worker.ts` builds the same owner DAG-ML `MainEngine` as the served build. An
// environment without `Worker` is refused explicitly: there is no in-thread engine.
import { WorkerEngine } from './worker-engine'
import { makeRtError, RtErrorException } from './rt'
import type { RtVerb } from './rt'
import type { Engine } from './types'
import InlineEngineWorker from './worker?worker&inline'

const unsupported = (verb: RtVerb) => Promise.reject(new RtErrorException(makeRtError({
  verb,
  cause: 'unsupported_capability',
  message: 'The single-file build runs the engine in an inline Web Worker, which this environment does not provide.',
  unsupported_capability: 'web_worker',
  mitigation: 'Open the single-file build in a browser with Web Worker support, or serve the app over HTTP(S).',
})))

const unsupportedEngine: Engine = {
  name: 'nirs4all-wasm-unsupported',
  run: () => unsupported('run'),
  predict: () => unsupported('predict'),
  exportModel: () => unsupported('export'),
}

export const engine: Engine = typeof Worker !== 'undefined'
  ? new WorkerEngine(() => new InlineEngineWorker())
  : unsupportedEngine
