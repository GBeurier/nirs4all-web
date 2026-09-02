import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '53017672c82df106a17b512846425bc9e846565f',
  tree: '68513f3b938407846a9014d0dad47f58ded09bf4',
  version: '0.3.9',
  package: '@nirs4all/datasets-wasm',
  generatedPackage: '@nirs4all/nirs4all-datasets-wasm',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 1110, sha256: 'd013c19348cb484bf19db0406cafeecb8df2103fd3a8a55a9dc16ce948bcdb96' },
  'README.md': { size: 1551, sha256: 'a9d335168cc534a9367661135d6db4fc8d9483b7ca1fa5cff7c72d5aeb3cb81f' },
  'nirs4all_datasets_wasm.d.ts': { size: 2179, sha256: '56155de207a39df2f6687e37e47c29b25f130c60dc5e5106088d64fd7e20294d' },
  'nirs4all_datasets_wasm.js': { size: 8680, sha256: 'c965911f3ba0289d5b9035b1a3b80abcae309f26f2322595dbfb08c44e36ec0e' },
  'nirs4all_datasets_wasm_bg.wasm': { size: 195502, sha256: '9275834e88b052304b0258022956ab99373cd874b2c6167081faedf58ad20f0a' },
  'nirs4all_datasets_wasm_bg.wasm.d.ts': { size: 688, sha256: '5306e0127507cd339d4039117701a8968eb69058658e01641ce0ba54378f1ae8' },
  'package.json': { size: 707, sha256: 'ba0c18bd68a571b04223cb5f64df4d486f387e363817bd7e8d621077dfb3a791' },
})
const scriptDir = dirname(fileURLToPath(import.meta.url))
const bundleRoot = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'datasets')
const receiptPath = join(bundleRoot, 'PROVENANCE.json')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function assertResolveWitness(module) {
  const index = JSON.stringify({
    schema: '1.0',
    n_datasets: 1,
    datasets: {
      witness: {
        tier: 'public',
        dataverse: { instance: 'https://dv.example', doi: '10.70112/WITNESS', dataset_version: '1.0' },
        files: [{ name: 'X.parquet', relpath: 'canonical/sources/X.parquet', sha256: 'aa', size: 9 }],
        origins: [{ kind: 'manual', mode: 'canonical', locator: 'witness', access: 'open' }],
        retrieval: { schema_version: '1.0', status: 'canonical_only', routes: [] },
        descriptor: {
          id: 'witness',
          sources: [{ source_id: 'X', modality: 'NIR' }],
          variables: [{ name: 'target', role: 'target', type: 'numeric' }],
          ids: { sample_id: 'sample_id' },
        },
      },
    },
  })
  const resolved = JSON.parse(module.resolve(index, 'witness'))
  if (resolved.id !== 'witness' || resolved.files?.[0]?.relpath !== 'canonical/sources/X.parquet' || resolved.descriptor?.sources?.length !== 1) {
    throw new Error('WASM dataset resolve witness failed')
  }
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
  receipt.build?.const_random_seed !== EXPECTED.commit ||
  receipt.build?.package_name_normalization?.from !== EXPECTED.generatedPackage ||
  receipt.build?.package_name_normalization?.to !== EXPECTED.package ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.sha256_abc !== true ||
  receipt.witnesses?.resolve_contract !== true
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
assertResolveWitness(module)
console.log(`nirs4all-datasets WASM ${EXPECTED.version} provenance and runtime verified`)
