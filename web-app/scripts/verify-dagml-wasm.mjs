import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(readFileSync(join(here, 'dagml-public-package.v1.json'), 'utf8'))
const root = resolve(here, '..', 'src', 'engine', 'wasm', 'dagml')
const receiptPath = join(root, 'PROVENANCE.json')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function inventory(directory, current = directory) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name)
    if (entry.isDirectory()) return inventory(directory, path)
    if (!entry.isFile()) throw new Error(`unsupported staged dag-ml entry: ${path}`)
    return [relative(directory, path).split(sep).join('/')]
  }).sort()
}

if (!existsSync(receiptPath)) throw new Error(`missing dag-ml WASM provenance: ${receiptPath}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.public-wasm-acquisition.v1' ||
  receipt.component !== expected.package || receipt.package !== expected.package ||
  receipt.version !== expected.version ||
  receipt.source?.commit !== expected.source.commit || receipt.source?.tree !== expected.source.tree ||
  receipt.acquisition?.metadata_url !== expected.registry.metadata_url ||
  receipt.acquisition?.tarball_url !== expected.registry.tarball_url ||
  receipt.acquisition?.git_head !== expected.source.commit ||
  receipt.acquisition?.tarball_size !== expected.registry.tarball_size ||
  receipt.acquisition?.sha256 !== expected.registry.sha256 ||
  receipt.acquisition?.sha1 !== expected.registry.sha1 ||
  receipt.acquisition?.integrity !== expected.registry.integrity ||
  receipt.acquisition?.sha256_sha1_sri_verified !== true ||
  receipt.reproducibility?.performed_by_web !== false ||
  receipt.reproducibility?.independent_rebuild_claimed !== false ||
  receipt.licensing?.expression !== 'CECILL-2.1 OR AGPL-3.0-or-later' ||
  receipt.licensing?.payload_source !== 'public npm package plus pinned source legal and contract files'
) throw new Error('dag-ml public WASM acquisition contract mismatch')

const pinned = { ...expected.public_files, ...expected.source_files }
const names = Object.keys(pinned).sort()
const actual = inventory(root).filter((name) => name !== 'PROVENANCE.json')
const declared = receipt.files.map(({ path }) => path).sort()
if (JSON.stringify(actual) !== JSON.stringify(names) || JSON.stringify(declared) !== JSON.stringify(names)) {
  throw new Error(`dag-ml public WASM inventory mismatch: actual=${actual}; declared=${declared}; expected=${names}`)
}
for (const file of receipt.files) {
  const fact = pinned[file.path]
  const path = join(root, file.path)
  if (file.size !== fact.size || file.sha256 !== fact.sha256 || statSync(path).size !== fact.size || sha256(path) !== fact.sha256) {
    throw new Error(`staged dag-ml file differs from pinned public/source bytes: ${file.path}`)
  }
}
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (metadata.name !== expected.package || metadata.version !== expected.version || metadata.license !== 'CECILL-2.1 OR AGPL-3.0-or-later') {
  throw new Error('dag-ml public package identity mismatch')
}
const module = await import(`${pathToFileURL(join(root, 'dag_ml_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'dag_ml_wasm_bg.wasm')) })
const manifest = JSON.parse(module.contract_manifest_json())
if (module.dag_ml_version() !== expected.version || manifest.crate !== 'dag-ml' ||
    !manifest.capabilities.includes('execute_execution_plan_phase') ||
    !manifest.capabilities.includes('loss_execution_attestation')) {
  throw new Error('dag-ml public WASM runtime witness failed')
}
console.log(`dag-ml WASM ${expected.version} published bytes, source legal payload and runtime verified`)
