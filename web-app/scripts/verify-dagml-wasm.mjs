import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: 'bad5aff0bfbc14c622f5ade7f393f29399df6e07',
  tree: '529ecc687d6b9307f41ee34feafcf5d8135ba9ae',
  version: '0.3.23',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'README.md': { size: 4549, sha256: '6996cdcaf65f3cd0a934941482091ce83e1390a5ab57616e5727d289b0ac02e4' },
  'dag_ml_wasm.d.ts': { size: 11607, sha256: '3cafdfb0603a8b5c32928ef20422676c5b63c111437ee327a5a20c76f9be3748' },
  'dag_ml_wasm.js': { size: 40062, sha256: 'e91cf64c6e6adad7abe06b2889f58880b1bd6affc8e0428d4136c11411666eef' },
  'dag_ml_wasm_bg.wasm': { size: 4757298, sha256: '83c06488400ce0b151e5ab0d01dde604d47e94bcca412783a3b39d08d212bf81' },
  'dag_ml_wasm_bg.wasm.d.ts': { size: 5165, sha256: '7d2153ae782688992671b959da807675c9370cc8217c3c1031709f5543fc3039' },
  'package.json': { size: 576, sha256: 'ff7b36dba8cbe59afe113fa0cf9a562d064ba8e6ec3b3f4dd8f0356e3a101ce8' },
})
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'wasm', 'dagml')
const receiptPath = join(root, 'PROVENANCE.json')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

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
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.contract_manifest !== true
) throw new Error('dag-ml WASM provenance contract mismatch')

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = readdirSync(root).filter((name) => name !== 'PROVENANCE.json').sort()
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`dag-ml WASM inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
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
