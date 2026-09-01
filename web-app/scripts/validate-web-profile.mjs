import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [outDir, expectedProfile] = process.argv.slice(2)
if (!outDir || !['strict-wasm', 'transitional'].includes(expectedProfile)) {
  throw new Error('usage: validate-web-profile.mjs <out-dir> <strict-wasm|transitional>')
}

const path = join(outDir, 'nirs4all-web-profile.v1.json')
const manifest = JSON.parse(await readFile(path, 'utf8'))
const strict = expectedProfile === 'strict-wasm'
const expected = {
  contract: 'nirs4all.web-runtime-profile.v1',
  profile: expectedProfile,
  nativeWasmRequired: strict,
  jsBackendFallback: strict ? 'forbid' : 'allow-explicit-offline',
  providerMatrixFallback: strict ? 'forbid' : 'allow-diagnosed',
  schedulerFallback: strict ? 'forbid' : 'allow-explicit',
  remoteComputeProvider: 'forbid',
}

if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
  throw new Error(`unexpected Web runtime profile manifest at ${path}: ${JSON.stringify(manifest)}`)
}

console.log(`validated ${expectedProfile} Web runtime profile: ${path}`)
