import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '1f60b920d34acda7c0fbc044b593bb6af1fab4c1',
  tree: 'f2144d861642e81758dcef4f6ee76ec32c0961ff',
  version: '0.2.10',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/AGPL-3.0-or-later.txt': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/Apache-2.0.txt': { size: 10280, sha256: '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff' },
  'LICENSES/BSD-3-Clause.txt': { size: 1460, sha256: '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d' },
  'LICENSES/CeCILL-2.1.txt': { size: 21778, sha256: '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5' },
  'LICENSES/MIT.txt': { size: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' },
  'LICENSING.md': { size: 1421, sha256: 'de862d775334ff3cf60df5a4f2bde6a08bd0aac0add477212d94f82989e3a2a3' },
  'LICENSING_FR.md': { size: 1536, sha256: 'cf4da85268262def2eb370b379d0d52d7bea3dc347a67ddc53ef108b914df68d' },
  'README.md': { size: 2465, sha256: '471b5bc0070411c82674a24fb776efeb00a44f27d821a8327c6d9536145555b0' },
  'THIRD_PARTY_NOTICES.md': { size: 1583, sha256: 'd4e03627160b905122799e578ed8e1288969a70f47488db402cf55c5e2bb633e' },
  'dag_ml_data_wasm.d.ts': { size: 9920, sha256: 'f217d639f912a7d57827bb5aec8ee9d0d2a7f9ea77345dde13712d8b82de843a' },
  'dag_ml_data_wasm.js': { size: 34118, sha256: '85e91d92faeb619abc1fe4682b648c499afd3bcff7d8f61825382c4a1f53e746' },
  'dag_ml_data_wasm_bg.wasm': { size: 1202907, sha256: 'ae5475188fb29e3027ae041ce6c157d9cd87de79564022f80e5325d2497cb31b' },
  'dag_ml_data_wasm_bg.wasm.d.ts': { size: 4363, sha256: '9f6716d8350aa14b8cbc2b57e0ff3bc987ca3849b6557447310db5041017390c' },
  'package.json': { size: 621, sha256: '35364cd0376c83da5fd594b679aaefe62fdd321f99df44c6557dc02135810348' },
})
const EXPECTED_LICENSE_FILES = Object.freeze([
  'LICENSE',
  'LICENSING.md',
  'LICENSING_FR.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
])
const scriptDir = dirname(fileURLToPath(import.meta.url))
const bundleRoot = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'dagml-data')
const receiptPath = join(bundleRoot, 'PROVENANCE.json')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function filesRecursively(directory, current = directory) {
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? filesRecursively(directory, path) : [relative(directory, path).split(sep).join('/')]
    })
    .sort()
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
  receipt.reproducibility?.byte_identical !== true ||
  receipt.licensing?.expression !== 'CECILL-2.1 OR AGPL-3.0-or-later' ||
  receipt.licensing?.payload_source !== 'qualified source tree' ||
  JSON.stringify(receipt.licensing?.files) !== JSON.stringify(EXPECTED_LICENSE_FILES)
) {
  throw new Error('dag-ml-data WASM provenance contract mismatch')
}

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = filesRecursively(bundleRoot).filter((name) => name !== 'PROVENANCE.json')
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`staged file inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}
for (const file of receipt.files) {
  const pinned = EXPECTED_FILES[file.path]
  const path = join(bundleRoot, file.path)
  if (file.size !== pinned.size || file.sha256 !== pinned.sha256 || statSync(path).size !== pinned.size || sha256(path) !== pinned.sha256) {
    throw new Error(`staged file does not match provenance: ${file.path}`)
  }
}

const packageMetadata = JSON.parse(readFileSync(join(bundleRoot, 'package.json'), 'utf8'))
if (packageMetadata.version !== EXPECTED.version) {
  throw new Error(`package version ${packageMetadata.version} != ${EXPECTED.version}`)
}
if (packageMetadata.license !== 'CECILL-2.1 OR AGPL-3.0-or-later') {
  throw new Error(`dag-ml-data WASM license expression mismatch: ${packageMetadata.license}`)
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
