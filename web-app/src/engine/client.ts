// The singleton engine the React app talks to (served / dev build). The engine
// runs in a Web Worker (WorkerEngine) so heavy libn4m / dag-ml WASM compute never
// freezes the UI — progress streams and Cancel works. The constructor is cheap
// (the worker is spawned lazily on first run/predict). The single-file (file://)
// build aliases this module to `client.singlefile.ts` (see vite.config.ts), which
// uses its own inline classic worker.
import { MainEngine } from './main-engine'
import { WorkerEngine } from './worker-engine'
import type { Engine } from './types'

const useWorker = typeof Worker !== 'undefined' && (typeof location === 'undefined' || location.protocol !== 'file:')
const createServedWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

export const engine: Engine = useWorker ? new WorkerEngine(createServedWorker) : new MainEngine({ mainThread: true })
