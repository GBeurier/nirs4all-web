// Single-file (file://) build engine. vite.config.ts aliases `@/engine/client`
// to this module in `singlefile` mode. It uses Vite's inline-worker transform so
// heavy libn4m/AOM work stays off the UI thread even for the offline build.
import { MainEngine } from './main-engine'
import { WorkerEngine } from './worker-engine'
import type { Engine } from './types'
import InlineEngineWorker from './worker?worker&inline'

export const engine: Engine = typeof Worker !== 'undefined' ? new WorkerEngine(() => new InlineEngineWorker()) : new MainEngine({ mainThread: true, useDagMl: false })
