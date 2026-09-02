import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '01596ab6a77ce3141d1f96d1cf675d13cacbc59a',
  tree: '661750b9e565c76baa6fbc5550e88ece2aba7934',
  version: '0.3.8',
  package: '@nirs4all/datasets-wasm',
  generatedPackage: '@nirs4all/nirs4all-datasets-wasm',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 1110, sha256: 'd013c19348cb484bf19db0406cafeecb8df2103fd3a8a55a9dc16ce948bcdb96' },
  'README.md': { size: 1551, sha256: 'a9d335168cc534a9367661135d6db4fc8d9483b7ca1fa5cff7c72d5aeb3cb81f' },
  'nirs4all_datasets_wasm.d.ts': { size: 2179, sha256: '56155de207a39df2f6687e37e47c29b25f130c60dc5e5106088d64fd7e20294d' },
  'nirs4all_datasets_wasm.js': { size: 8680, sha256: 'c965911f3ba0289d5b9035b1a3b80abcae309f26f2322595dbfb08c44e36ec0e' },
  'nirs4all_datasets_wasm_bg.wasm': { size: 195621, sha256: '3518a10581bb8cde47bee554297f0a6a607230537d3836ae3302215eaf9ebcba' },
  'nirs4all_datasets_wasm_bg.wasm.d.ts': { size: 688, sha256: '5306e0127507cd339d4039117701a8968eb69058658e01641ce0ba54378f1ae8' },
  'package.json': { size: 707, sha256: 'e7793dd50344d0f18e4c51031a3dcaf70375680216f7cf736eef3ec29fa06170' },
})
const scriptDir = dirname(fileURLToPath(import.meta.url))
const bundleRoot = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'datasets')
const receiptPath = join(bundleRoot, 'PROVENANCE.json')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

if (!existsSync(receiptPath)) {
  throw new Error(`missing nirs4all-datasets WASM provenance: ${receiptPath}`)
}
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'nirs4all-datasets-wasm' ||
  receipt.package !== EXPECTED.package ||
  receipt.version !== EXPECTED.version ||
  receipt.source?.commit !== EXPECTED.commit ||
  receipt.source?.tree !== EXPECTED.tree ||
  receipt.source?.clean !== true ||
  receipt.build?.target !== 'web' ||
  receipt.build?.profile !== 'release' ||
  receipt.build?.cargo_locked !== true ||
  receipt.build?.package_name_normalization?.from !== EXPECTED.generatedPackage ||
  receipt.build?.package_name_normalization?.to !== EXPECTED.package ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.sha256_abc !== true
) {
  throw new Error('nirs4all-datasets WASM provenance contract mismatch')
}

const declaredFiles = receipt.files.map(({ path }) => path).sort()
const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const actualFiles = readdirSync(bundleRoot).filter((name) => name !== 'PROVENANCE.json').sort()
if (
  JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) ||
  JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)
) {
  throw new Error(`staged file inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}
for (const file of receipt.files) {
  const path = join(bundleRoot, file.path)
  const pinned = EXPECTED_FILES[file.path]
  if (
    file.size !== pinned.size ||
    file.sha256 !== pinned.sha256 ||
    statSync(path).size !== pinned.size ||
    sha256(path) !== pinned.sha256
  ) {
    throw new Error(`staged file does not match provenance: ${file.path}`)
  }
}

const packageMetadata = JSON.parse(readFileSync(join(bundleRoot, 'package.json'), 'utf8'))
if (packageMetadata.name !== EXPECTED.package || packageMetadata.version !== EXPECTED.version) {
  throw new Error(`package identity ${packageMetadata.name}@${packageMetadata.version} is not qualified`)
}
const module = await import(`${pathToFileURL(join(bundleRoot, 'nirs4all_datasets_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(bundleRoot, 'nirs4all_datasets_wasm_bg.wasm')) })
if (module.abiVersion() !== EXPECTED.version) {
  throw new Error(`WASM runtime version ${module.abiVersion()} != ${EXPECTED.version}`)
}
if (module.sha256(new Uint8Array([97, 98, 99])) !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
  throw new Error('WASM SHA-256 witness failed')
}
console.log(`nirs4all-datasets WASM ${EXPECTED.version} provenance and runtime verified`)
