import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('formats')
const EXPECTED = pin
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
if (createHash('sha256').update(JSON.stringify(readers)).digest('hex') !== pin.runtime_catalog.json_sha256) throw new Error('Formats reader catalog differs')
console.log(`Formats ${pin.version} runtime verified`)
