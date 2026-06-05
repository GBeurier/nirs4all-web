// Single-file (file://) build engine. vite.config.ts aliases `@/engine/client`
// to this module in `singlefile` mode so the Web Worker path (client.ts →
// worker-engine.ts → worker.ts) is never pulled into the graph: a module worker
// that code-splits its WASM via dynamic import() can't be inlined into one HTML,
// and the offline build uses the light in-thread JS backend anyway.
import { MainEngine } from './main-engine'
import type { Engine } from './types'

export const engine: Engine = new MainEngine()
