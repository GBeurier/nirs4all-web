import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '3e5a05674dfab4bbcebf23fe9d615d231ca4d551',
  tree: '3b9717258fc80791d80641633a4bbf6478e7256a',
  version: '0.2.9',
  package: '@nirs4all/formats-wasm',
  generatedPackage: 'nirs4all-formats-wasm',
  wasmBindgen: '0.2.127',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/AGPL-3.0-or-later.txt': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/Apache-2.0.txt': { size: 10280, sha256: '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff' },
  'LICENSES/BSD-3-Clause.txt': { size: 1460, sha256: '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d' },
  'LICENSES/CeCILL-2.1.txt': { size: 21778, sha256: '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5' },
  'LICENSES/MIT.txt': { size: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' },
  'LICENSING.md': { size: 1436, sha256: 'a002efcef5dd83e5612fbd38990b0265da5fef66a67bfc7c849bdf06860076fd' },
  'README.md': { size: 2918, sha256: '724b92047f40593956684d2e0e58fced595df93eb01c953792bc5e43ef0345ee' },
  'THIRD_PARTY_NOTICES.md': { size: 1424, sha256: 'b1227b3159f26cd3af19c6f08fddc1662f1aab8118f964d7a968ce725d2e2b75' },
  'nirs4all_formats_wasm.d.ts': { size: 5205, sha256: 'de5bed954ea567a7a6b450920207c4edf582b07592c2e68f19d9ea6b05ee4feb' },
  'nirs4all_formats_wasm.js': { size: 23435, sha256: '1ee17efff92d71153517b983d6b190cea765c9092c4c3dcd1e6740d57de642fd' },
  'nirs4all_formats_wasm_bg.wasm': { size: 6444993, sha256: 'de0881dfc3ee53729b8c39c4214461660d4bec863a2e39455d797e09c2fffcd0' },
  'nirs4all_formats_wasm_bg.wasm.d.ts': { size: 1882, sha256: '6c37403e7702d32e7b9c62f50bc0ea8fe78083a56e3dcb98aaa47e70117bec68' },
  'package.json': { size: 609, sha256: '69391aafbcccc7c1382a0a182ea04043211ad44fdf741dffe379148101f92541' },
  'snippets/rds2rust-b87e702ea5d57172/wasm/decompress.js': { size: 16502, sha256: '5258768404663b4b48572796afbe51e2a8669a89d3d5e21cf18c41830bf1d46b' },
})
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'wasm', 'formats')
const receiptPath = join(root, 'PROVENANCE.json')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function inventory(directory) {
  const files = []
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else files.push(relative(directory, absolute).split(sep).join('/'))
    }
  }
  visit(directory)
  return files.sort()
}

if (!existsSync(receiptPath)) throw new Error(`missing nirs4all-formats WASM provenance: ${receiptPath}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'nirs4all-formats-wasm' ||
  receipt.package !== EXPECTED.package ||
  receipt.version !== EXPECTED.version ||
  receipt.source?.commit !== EXPECTED.commit ||
  receipt.source?.tree !== EXPECTED.tree ||
  receipt.source?.clean !== true ||
  receipt.build?.target !== 'web' ||
  receipt.build?.profile !== 'release' ||
  receipt.build?.cargo_locked !== true ||
  receipt.build?.const_random_seed !== EXPECTED.commit ||
  receipt.build?.wasm_bindgen_lock !== EXPECTED.wasmBindgen ||
  receipt.build?.package_name_normalization?.from !== EXPECTED.generatedPackage ||
  receipt.build?.package_name_normalization?.to !== EXPECTED.package ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.feature_flags !== true ||
  receipt.witnesses?.reader_catalog_count !== 44 ||
  receipt.witnesses?.chunk_size_mb !== 4
) throw new Error('nirs4all-formats WASM provenance contract mismatch')

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = inventory(root).filter((name) => name !== 'PROVENANCE.json')
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`nirs4all-formats WASM inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}
for (const file of receipt.files) {
  const pinned = EXPECTED_FILES[file.path]
  const path = join(root, file.path)
  if (file.size !== pinned.size || file.sha256 !== pinned.sha256 || statSync(path).size !== pinned.size || sha256(path) !== pinned.sha256) {
    throw new Error(`staged nirs4all-formats file does not match qualified bytes: ${file.path}`)
  }
}

const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (metadata.name !== EXPECTED.package || metadata.version !== EXPECTED.version) {
  throw new Error(`package identity ${metadata.name}@${metadata.version} is not qualified`)
}
const module = await import(`${pathToFileURL(join(root, 'nirs4all_formats_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'nirs4all_formats_wasm_bg.wasm')) })
const features = module.features()
const readers = module.readerCatalog()
if (
  module.version() !== EXPECTED.version ||
  features?.hdf5 !== true || features?.matlab !== true || features?.parquet !== true ||
  !Array.isArray(readers) || readers.length !== 44 ||
  module.recommended_chunk_size_mb() !== 4
) throw new Error('nirs4all-formats WASM runtime witness failed')
console.log(`nirs4all-formats WASM ${EXPECTED.version} provenance and runtime verified`)
