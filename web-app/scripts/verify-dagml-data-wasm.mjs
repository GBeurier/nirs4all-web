import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '1f60b920d34acda7c0fbc044b593bb6af1fab4c1',
  tree: 'f2144d861642e81758dcef4f6ee76ec32c0961ff',
  version: '0.2.10',
})
const scriptDir = dirname(fileURLToPath(import.meta.url))
const bundleRoot = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'dagml-data')
const receiptPath = join(bundleRoot, 'PROVENANCE.json')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

if (!existsSync(receiptPath)) {
  throw new Error(`missing dag-ml-data WASM provenance: ${receiptPath}`)
}
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'dag-ml-data-wasm' ||
  receipt.version !== EXPECTED.version ||
  receipt.source?.commit !== EXPECTED.commit ||
  receipt.source?.tree !== EXPECTED.tree ||
  receipt.source?.clean !== true ||
  receipt.build?.cargo_locked !== true ||
  JSON.stringify(receipt.build?.features) !== JSON.stringify(['provider']) ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true
) {
  throw new Error('dag-ml-data WASM provenance contract mismatch')
}

const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = readdirSync(bundleRoot).filter((name) => name !== 'PROVENANCE.json').sort()
if (JSON.stringify(declaredFiles) !== JSON.stringify(actualFiles)) {
  throw new Error(`staged file inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}`)
}
for (const file of receipt.files) {
  const path = join(bundleRoot, file.path)
  if (statSync(path).size !== file.size || sha256(path) !== file.sha256) {
    throw new Error(`staged file does not match provenance: ${file.path}`)
  }
}

const packageMetadata = JSON.parse(readFileSync(join(bundleRoot, 'package.json'), 'utf8'))
if (packageMetadata.version !== EXPECTED.version) {
  throw new Error(`package version ${packageMetadata.version} != ${EXPECTED.version}`)
}
const module = await import(`${pathToFileURL(join(bundleRoot, 'dag_ml_data_wasm.js')).href}?verify=${Date.now()}`)
await module.default({ module_or_path: readFileSync(join(bundleRoot, 'dag_ml_data_wasm_bg.wasm')) })
if (module.dag_ml_data_version() !== EXPECTED.version) {
  throw new Error(`WASM runtime version ${module.dag_ml_data_version()} != ${EXPECTED.version}`)
}
if (typeof module.WasmInMemoryProvider !== 'function') {
  throw new Error('provider build does not export WasmInMemoryProvider')
}
console.log(`dag-ml-data WASM ${EXPECTED.version} provenance and provider runtime verified`)
