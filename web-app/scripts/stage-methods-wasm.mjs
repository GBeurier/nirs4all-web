import { stagePackage } from './public-package.mjs'
await stagePackage('methods')
await import('./verify-methods-wasm.mjs')
