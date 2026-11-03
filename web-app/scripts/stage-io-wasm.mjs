import { stagePackage } from './public-package.mjs'
await stagePackage('io')
await import('./verify-io-wasm.mjs')
