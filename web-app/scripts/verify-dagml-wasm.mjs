import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  "commit": "867f3576592ec390e2a16ced53cc027c022cde27",
  "tree": "6ec170b5f8011ed09a88578b552df3f9c4ee47f4",
  "version": "0.3.34"
})
const EXPECTED_N4M_DEPENDENCY = Object.freeze({
  "package": "n4m",
  "version": "0.4.0",
  "source_commit": "5fba13ba7b13d51fdeed9c4f6c11612d70b3b755",
  "source_tree": "89227d49462739b78f0ed5790fbe47a78acdc08c",
  "binding_source_tree": "df7b08e828c49b8763985934b17bf2086ab4c58a",
  "runtime_source_commit": "dcc570b3647f77cf0428dd346078f442ed5cd032",
  "runtime_source_tree": "4b711a5cf7b0fb1e10a6ed99e1202bdd89917c42",
  "runtime_binding_source_tree": "ebbc923de888648d217818c16eddda0ececc64c5",
  "registry_checksum": "262224913fd9338e523dea8a55e688abab21eb131422a23fc3f2dfb32a4001f6"
})
const EXPECTED_FILES = Object.freeze({
  "LICENSE": {
    "size": 34020,
    "sha256": "d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee"
  },
  "LICENSES/AGPL-3.0-or-later.txt": {
    "size": 34020,
    "sha256": "d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee"
  },
  "LICENSES/Apache-2.0.txt": {
    "size": 10280,
    "sha256": "074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff"
  },
  "LICENSES/BSD-3-Clause.txt": {
    "size": 1460,
    "sha256": "5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d"
  },
  "LICENSES/CeCILL-2.1.txt": {
    "size": 21778,
    "sha256": "4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5"
  },
  "LICENSES/MIT.txt": {
    "size": 1078,
    "sha256": "b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5"
  },
  "LICENSING.md": {
    "size": 1406,
    "sha256": "f9f26e32462eb28e350d0bd4db913ee5ccbd3a1eb88d97e78d187e1b35b86ae9"
  },
  "LICENSING_FR.md": {
    "size": 1521,
    "sha256": "6f907830be970cbd87723ebaa1e58ffd3dd3f69692a5b211edfc6ee964d93aff"
  },
  "README.md": {
    "size": 6397,
    "sha256": "235fc98b4aa19a29b365e88d9a76c23c8703ea2c413f7346cd7a8b7b47d2e25d"
  },
  "THIRD_PARTY_NOTICES.md": {
    "size": 1573,
    "sha256": "01a4064f18fa28336f49c40a4e2db4b40ebee4766160320174e5aaadc41304fd"
  },
  "dag_ml_wasm.d.ts": {
    "size": 22892,
    "sha256": "3c6f43cc0c067928e8ff3de0f5b745cdde28eacc204f8af7e25567221a04ae9c"
  },
  "dag_ml_wasm.js": {
    "size": 76945,
    "sha256": "2e94d019ad759a60a4d3709c48bde299b590794b4616f911b7480e19c4f8631c"
  },
  "dag_ml_wasm_bg.wasm": {
    "size": 10386254,
    "sha256": "1a3b653e8852289029070d925f8424d4d19697f6ae1f8d5f7622a3d3734b36a4"
  },
  "dag_ml_wasm_bg.wasm.d.ts": {
    "size": 9231,
    "sha256": "03c4e00fa4e380fcff24e0a7991a1cd5481dbc9dcbc41dcae51abff60f67d9bf"
  },
  "native_predictor_descriptor.v1.schema.json": {
    "size": 4275,
    "sha256": "b29746645106a88d7e014ff7ad8df242a967f0b60c85df259094063dab329c1d"
  },
  "package.json": {
    "size": 576,
    "sha256": "7aacaa7210185c1f2c42238a02949bdc850845474468d429334233e619d59263"
  }
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
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'wasm', 'dagml')
const receiptPath = join(root, 'PROVENANCE.json')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function filesRecursively(directory, current = directory) {
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? filesRecursively(directory, path) : [relative(directory, path).split(sep).join('/')]
    })
    .sort()
}

if (!existsSync(receiptPath)) throw new Error(`missing dag-ml WASM provenance: ${receiptPath}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'dag-ml-wasm' ||
  receipt.package !== 'dag-ml-wasm' ||
  receipt.version !== EXPECTED.version ||
  receipt.source?.commit !== EXPECTED.commit ||
  receipt.source?.tree !== EXPECTED.tree ||
  receipt.source?.clean !== true ||
  receipt.build?.target !== 'web' ||
  receipt.build?.profile !== 'release' ||
  receipt.build?.cargo_locked !== true ||
  JSON.stringify(receipt.build?.registry_dependency) !== JSON.stringify(EXPECTED_N4M_DEPENDENCY) ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.licensing?.expression !== 'CECILL-2.1 OR AGPL-3.0-or-later' ||
  receipt.licensing?.payload_source !== 'qualified source tree' ||
  JSON.stringify(receipt.licensing?.files) !== JSON.stringify(EXPECTED_LICENSE_FILES) ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.contract_manifest !== true ||
  receipt.witnesses?.native_predictor_descriptor_schema !== true
) throw new Error('dag-ml WASM provenance contract mismatch')

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = filesRecursively(root).filter((name) => name !== 'PROVENANCE.json')
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`dag-ml WASM inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}

const packageMetadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (packageMetadata.license !== 'CECILL-2.1 OR AGPL-3.0-or-later') {
  throw new Error(`dag-ml WASM license expression mismatch: ${packageMetadata.license}`)
}
for (const file of receipt.files) {
  const pinned = EXPECTED_FILES[file.path]
  const path = join(root, file.path)
  if (file.size !== pinned.size || file.sha256 !== pinned.sha256 || statSync(path).size !== pinned.size || sha256(path) !== pinned.sha256) {
    throw new Error(`staged dag-ml file does not match qualified bytes: ${file.path}`)
  }
}

const module = await import(`${pathToFileURL(join(root, 'dag_ml_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'dag_ml_wasm_bg.wasm')) })
const manifest = JSON.parse(module.contract_manifest_json())
if (
  module.dag_ml_version() !== EXPECTED.version ||
  manifest.crate !== 'dag-ml' ||
  !manifest.capabilities.includes('execute_execution_plan_phase') ||
  !manifest.capabilities.includes('loss_execution_attestation')
) throw new Error('dag-ml WASM runtime witness failed')
console.log(`dag-ml WASM ${EXPECTED.version} provenance and runtime verified`)
