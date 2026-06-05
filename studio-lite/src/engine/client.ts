// The singleton engine the React app talks to (served / dev build). The engine
// runs in a Web Worker (WorkerEngine) so heavy libn4m / dag-ml WASM compute never
// freezes the UI — progress streams and Cancel works. The constructor is cheap
// (the worker is spawned lazily on first run/predict). The single-file (file://)
// build aliases this module to `client.singlefile.ts` (see vite.config.ts), which
// keeps the engine in-thread — its WASM-code-split worker chunk can't be inlined.
import { MainEngine } from './main-engine'
import { WorkerEngine } from './worker-engine'
import type { Engine } from './types'

const useWorker = typeof Worker !== 'undefined' && (typeof location === 'undefined' || location.protocol !== 'file:')

export const engine: Engine = useWorker ? new WorkerEngine() : new MainEngine()
