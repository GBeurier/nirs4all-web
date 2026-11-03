import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('dagml')
const EXPECTED = pin
const module = await import(`${pathToFileURL(join(root, 'dag_ml_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'dag_ml_wasm_bg.wasm')) })
const manifest = JSON.parse(module.contract_manifest_json())
if (module.dag_ml_version() !== pin.version || manifest.crate !== 'dag-ml' ||
    !manifest.capabilities.includes('execute_execution_plan_phase') ||
    !manifest.capabilities.includes('loss_execution_attestation')) {
  throw new Error('dag-ml public WASM runtime witness failed')
}
console.log(`dag-ml WASM ${pin.version} published bytes, source legal payload and runtime verified`)
