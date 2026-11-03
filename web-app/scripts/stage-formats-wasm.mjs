import { stagePackage } from './public-package.mjs'
await stagePackage('formats')
await import('./verify-formats-wasm.mjs')
