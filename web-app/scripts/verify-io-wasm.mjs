import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('io')
const EXPECTED = pin
function assertRuntimeWitness(module) {
  if (module.version() !== pin.version) throw new Error(`WASM runtime version ${module.version()} != ${pin.version}`)
  const spec = module.to_spec(JSON.stringify({ name: 'web-witness', sources: [{ id: 'x', role: 'features', input: 'x.csv' }] }))
  module.validate(spec)
  const plan = module.inferFiles([
    {
      name: 'combined.csv',
      bytes: new TextEncoder().encode('sample_id;1000;1005;protein\ns1;0.10;0.20;11.2\ns2;0.30;0.40;12.5\n'),
    },
  ], {})
  if (JSON.parse(spec).schema_version !== 1 || plan?.structure?.value !== 'single_combined' || !plan?.resolved_spec?.sources?.length) {
    throw new Error('nirs4all-io WASM functional witness failed')
  }
}

const module = await import(`${pathToFileURL(join(root, 'nirs4all_io_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'nirs4all_io_wasm_bg.wasm')) })
assertRuntimeWitness(module)
console.log(`nirs4all-io WASM ${pin.version} provenance and runtime verified`)
