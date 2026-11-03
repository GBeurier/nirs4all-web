import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('datasets')
const EXPECTED = pin
function assertResolveWitness(module) {
  const index = JSON.stringify({
    schema: '1.0',
    n_datasets: 1,
    datasets: {
      witness: {
        tier: 'public',
        dataverse: { instance: 'https://dv.example', doi: '10.70112/WITNESS', dataset_version: '1.0' },
        files: [{ name: 'X.parquet', relpath: 'canonical/sources/X.parquet', sha256: 'aa', size: 9 }],
        origins: [{ kind: 'manual', mode: 'canonical', locator: 'witness', access: 'open' }],
        retrieval: { schema_version: '1.0', status: 'canonical_only', routes: [] },
        descriptor: {
          id: 'witness',
          sources: [{ source_id: 'X', modality: 'NIR' }],
          variables: [{ name: 'target', role: 'target', type: 'numeric' }],
          ids: { sample_id: 'sample_id' },
        },
      },
    },
  })
  const resolved = JSON.parse(module.resolve(index, 'witness'))
  if (resolved.id !== 'witness' || resolved.files?.[0]?.relpath !== 'canonical/sources/X.parquet' || resolved.descriptor?.sources?.length !== 1) {
    throw new Error('WASM dataset resolve witness failed')
  }
}

const module = await import(`${pathToFileURL(join(root, 'nirs4all_datasets_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'nirs4all_datasets_wasm_bg.wasm')) })
if (module.abiVersion() !== EXPECTED.version) {
  throw new Error(`WASM runtime version ${module.abiVersion()} != ${EXPECTED.version}`)
}
if (module.sha256(new Uint8Array([97, 98, 99])) !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
  throw new Error('WASM SHA-256 witness failed')
}
assertResolveWitness(module)
console.log(`nirs4all-datasets WASM ${EXPECTED.version} provenance and runtime verified`)
