import { stagePackage } from './public-package.mjs'
await stagePackage('datasets')
await import('./verify-datasets-wasm.mjs')
