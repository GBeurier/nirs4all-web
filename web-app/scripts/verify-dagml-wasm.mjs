import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '189099119b69e74c69466f2308808cb423dc2e94',
  tree: '6ce31722bdb999482932e9d4a3884987426d1dd6',
  version: '0.3.23',
})
const EXPECTED_N4M_PATCH = Object.freeze({
  package: 'n4m',
  version: '0.1.3',
  source_commit: 'a71ee2927524d03482183de3d6e22661efc05d12',
  source_tree: 'f6749f4c4be7dca161f3c2677dd10a9ac4434b66',
  persisted_in_release_lock: false,
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/AGPL-3.0-or-later.txt': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/Apache-2.0.txt': { size: 10280, sha256: '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff' },
  'LICENSES/BSD-3-Clause.txt': { size: 1460, sha256: '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d' },
  'LICENSES/CeCILL-2.1.txt': { size: 21778, sha256: '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5' },
  'LICENSES/MIT.txt': { size: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' },
  'LICENSING.md': { size: 1406, sha256: 'f9f26e32462eb28e350d0bd4db913ee5ccbd3a1eb88d97e78d187e1b35b86ae9' },
  'LICENSING_FR.md': { size: 1521, sha256: '6f907830be970cbd87723ebaa1e58ffd3dd3f69692a5b211edfc6ee964d93aff' },
  'README.md': { size: 4549, sha256: '6996cdcaf65f3cd0a934941482091ce83e1390a5ab57616e5727d289b0ac02e4' },
  'THIRD_PARTY_NOTICES.md': { size: 1573, sha256: '01a4064f18fa28336f49c40a4e2db4b40ebee4766160320174e5aaadc41304fd' },
  'dag_ml_wasm.d.ts': { size: 11607, sha256: '3cafdfb0603a8b5c32928ef20422676c5b63c111437ee327a5a20c76f9be3748' },
  'dag_ml_wasm.js': { size: 40062, sha256: 'e91cf64c6e6adad7abe06b2889f58880b1bd6affc8e0428d4136c11411666eef' },
  'dag_ml_wasm_bg.wasm': { size: 4758279, sha256: 'd6a548ba6b616c5d6d1585f0adfeed84b262a11a4146b76dee96fa9fd54eff8a' },
  'dag_ml_wasm_bg.wasm.d.ts': { size: 5165, sha256: '7d2153ae782688992671b959da807675c9370cc8217c3c1031709f5543fc3039' },
  'native_predictor_descriptor.v1.schema.json': { size: 2770, sha256: '7d89f4b4531c16a9512221192f030961072bfd4057e1c9e0f3371710298e1d0a' },
  'package.json': { size: 576, sha256: 'ff7b36dba8cbe59afe113fa0cf9a562d064ba8e6ec3b3f4dd8f0356e3a101ce8' },
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
  JSON.stringify(receipt.build?.qualification_patch) !== JSON.stringify(EXPECTED_N4M_PATCH) ||
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
