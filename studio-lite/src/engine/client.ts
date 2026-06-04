// The singleton engine the React app talks to. MainEngine runs on the main
// thread and uses real libn4m WASM numerics when available (served build),
// transparently falling back to the JS backend offline.
import { MainEngine } from './main-engine'
import type { Engine } from './types'

export const engine: Engine = new MainEngine()
