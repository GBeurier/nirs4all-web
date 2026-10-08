import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const pin = JSON.parse(readFileSync(join(scripts, 'formats-public-pages.v1.json'), 'utf8'))
const EXPECTED = pin
const root = resolve(scripts, '..', 'src/engine/wasm/formats')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const receipt = JSON.parse(readFileSync(join(root, 'PROVENANCE.json'), 'utf8'))
if (receipt.schema !== 'nirs4all-web.wasm-pages-acquisition.v1' || receipt.component !== pin.component || receipt.package !== pin.package || receipt.version !== pin.version
  || receipt.source?.commit !== pin.commit || receipt.source?.tree !== pin.tree
  || receipt.acquisition?.deployment_id !== pin.deployment_id || receipt.acquisition?.run_id !== pin.run_id
  || JSON.stringify(receipt.acquisition?.authority_files) !== JSON.stringify(pin.authority_files)
  || JSON.stringify(receipt.acquisition?.downloads_receipt) !== JSON.stringify(pin.downloads_receipt)
  || JSON.stringify(receipt.acquisition?.published_files) !== JSON.stringify(pin.published_files)
  || JSON.stringify(receipt.source_extra_files) !== JSON.stringify(pin.source_extra_files)
  || receipt.public_workflow?.target !== 'web' || receipt.public_workflow?.profile !== 'release'
  || JSON.stringify(receipt.public_workflow?.features) !== JSON.stringify(['console-errors'])
  || receipt.public_workflow?.cargo_locked_flag_present !== false
  || receipt.reproducibility?.performed_by_web !== false || receipt.reproducibility?.independent_rebuild_claimed !== false) throw new Error('Formats Pages provenance contract mismatch')
function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? inventory(path) : [relative(root, path).split(sep).join('/')]
  }).sort()
}
const expectedFiles = Object.keys(pin.staged_files).sort()
if (JSON.stringify(receipt.files.map((row) => row.path).sort()) !== JSON.stringify(expectedFiles)
  || JSON.stringify(inventory(root).filter((name) => name !== 'PROVENANCE.json')) !== JSON.stringify(expectedFiles)) throw new Error('Formats staged inventory differs from captured public bytes')
for (const row of receipt.files) {
  const expected = pin.staged_files[row.path]
  if (row.size !== expected.size || row.sha256 !== expected.sha256 || statSync(join(root, row.path)).size !== expected.size
    || sha256(join(root, row.path)) !== expected.sha256) throw new Error(`Formats staged file hash mismatch: ${row.path}`)
}
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (metadata.name !== pin.package || metadata.version !== pin.version) throw new Error('Formats public package identity differs')
const module = await import(`${pathToFileURL(join(root, 'nirs4all_formats_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'nirs4all_formats_wasm_bg.wasm')) })
const features = module.features()
const readers = module.readerCatalog()
if (
  module.version() !== EXPECTED.version ||
  features?.hdf5 !== true || features?.matlab !== true || features?.parquet !== true ||
  !Array.isArray(readers) || readers.length !== pin.runtime_catalog.count ||
  module.recommended_chunk_size_mb() !== 4
) throw new Error('nirs4all-formats WASM runtime witness failed')
if (createHash('sha256').update(JSON.stringify(readers)).digest('hex') !== pin.runtime_catalog.json_sha256
  || readers.at(-1)?.reader !== pin.runtime_catalog.last_reader) throw new Error('Formats native reader catalog differs from the exact qualified public211 catalog')
console.log(`Formats ${pin.version} captured public Pages bytes and existing runtime witnesses verified`)
