import { stagePackage } from './public-package.mjs'
await stagePackage('dagml')
await import('./verify-dagml-wasm.mjs')
