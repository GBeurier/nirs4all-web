import { stagePackage } from './public-package.mjs'
await stagePackage('dagml-data')
await import('./verify-dagml-data-wasm.mjs')
