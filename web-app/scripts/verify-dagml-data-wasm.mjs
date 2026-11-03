import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('dagml-data')
const EXPECTED = pin
const module = await import(`${pathToFileURL(join(root, 'dag_ml_data_wasm.js')).href}?verify=${Date.now()}`)
await module.default({ module_or_path: readFileSync(join(root, 'dag_ml_data_wasm_bg.wasm')) })
if (module.dag_ml_data_version() !== EXPECTED.version) {
  throw new Error(`WASM runtime version ${module.dag_ml_data_version()} != ${EXPECTED.version}`)
}
if (typeof module.WasmInMemoryProvider !== 'function') {
  throw new Error('provider build does not export WasmInMemoryProvider')
}
console.log(`dag-ml-data WASM ${EXPECTED.version} provenance and provider runtime verified`)
