import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: '7abd256cbad1ee4eff3b6d507dd3fd28d2caac80',
  tree: 'b36575f0e21e3ff08225c7f421ce99deabd26aeb',
  version: '0.1.12',
  package: '@nirs4all/io-wasm',
  generatedPackage: 'nirs4all-io-wasm',
  wasmBindgen: '0.2.122',
})
const EXPECTED_FILES = Object.freeze({
  'COPY_PROVENANCE.md': { size: 2652, sha256: 'd2ba7d73b4e78530678c9ac411318dd8880b5ab6d43d828309815745e1590e41' },
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/AGPL-3.0-or-later.txt': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/Apache-2.0.txt': { size: 9723, sha256: '62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a' },
  'LICENSES/BSD-3-Clause.txt': { size: 1459, sha256: '3cf06aba3588c41c514f6946bb2d757b413ff6491647d474800f55edca75dcb4' },
  'LICENSES/COMMERCIAL-LICENSE.md': { size: 670, sha256: 'e62a66dc45d618d419706048b17a840f87d0c0c5c940eadd1cf6ea13c7eae08f' },
  'LICENSES/COMMERCIAL-LICENSE_FR.md': { size: 759, sha256: '7d1fd841891d4cb53836a6aca2fbbf7f36ef3bca540a394a9d94633af34ea3d6' },
  'LICENSES/CeCILL-2.1.txt': { size: 21778, sha256: '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5' },
  'LICENSES/MIT.txt': { size: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' },
  'LICENSES/Unicode-3.0.txt': { size: 1995, sha256: 'f7db81051789b729fea528a63ec4c938fdcb93d9d61d97dc8cc2e9df6d47f2a1' },
  'LICENSING.md': { size: 2113, sha256: 'b41ad1d4b8e62c89e42704fc4c9b5bb8a2099a0ad0680d72e95efb57c5d3326c' },
  'README.md': { size: 7389, sha256: 'a00106a406c90a2be85bd1063c62744e6f096499aaef7ae86ffacd0b4fcccf13' },
  'THIRD_PARTY_NOTICES.md': { size: 4935, sha256: '2d0aa4b2f137e77bad3d243bd908359c5e6bab37a3e9e29402f96e2103bb4932' },
  'idiomatic.d.ts': { size: 2044, sha256: 'cca0b1700625d48c17232333702e3d788047b5dfb9b953c78326bce61f4a6094' },
  'idiomatic.mjs': { size: 2684, sha256: 'a041c2304307eccbe805cfb97868eb2640fafe2fc51da8237e0a535135d1bfa3' },
  'nirs4all-io-wasm.cdx.json': { size: 34123, sha256: '2fb93d6b81a3fa7fab9b0bf388b170f8dac4e4ac0f5a37f51b616bfb67067631' },
  'nirs4all_io_wasm.d.ts': { size: 5369, sha256: 'a4fe6564849d63e779e5899d7e61d43e3d63ae17950b0aac84793b11e0ad2e8f' },
  'nirs4all_io_wasm.js': { size: 24322, sha256: '8fc4d75bc209f53db50aa2dc2ca1d5c159202bc2f10b4fe392b59963e12e005d' },
  'nirs4all_io_wasm_bg.wasm': { size: 2334986, sha256: 'a99b75a6dfa3fe86c0b27d96334b8da0b4ccae5eda39084533f57a104738fc9c' },
  'nirs4all_io_wasm_bg.wasm.d.ts': { size: 1273, sha256: 'fd34bc545e2588f28a9d388e7ac3890e83d9af1a38e2861c4426bdd8a1fb1740' },
  'package.json': { size: 1376, sha256: 'd7c4658efd2995d8830572539cf23670ea8895a58e06e77945475591c613036f' },
  'types/nirs4all-io.d.ts': { size: 3923, sha256: 'b0384126ad078a6fbb35172cf7983e37259aa1c0b2a96e3fa256cb83b1d7a555' },
})
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'wasm', 'io')
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

function assertRuntimeWitness(module) {
  if (module.version() !== EXPECTED.version) throw new Error(`WASM runtime version ${module.version()} != ${EXPECTED.version}`)
  const spec = module.to_spec(JSON.stringify({ name: 'web-witness', sources: [{ id: 'x', role: 'features', input: 'x.csv' }] }))
  module.validate(spec)
  const plan = module.inferFiles([
    {
      name: 'combined.csv',
      bytes: new TextEncoder().encode('sample_id;1000;1005;protein\ns1;0.10;0.20;11.2\ns2;0.30;0.40;12.5\n'),
    },
  ], {})
  if (JSON.parse(spec).schema_version !== 1 || plan?.structure?.value !== 'single_combined' || !plan?.resolved_spec?.sources?.length) {
    throw new Error('nirs4all-io WASM functional witness failed')
  }
}

if (!existsSync(receiptPath)) throw new Error(`missing nirs4all-io WASM provenance: ${receiptPath}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'nirs4all-io-wasm' ||
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
  receipt.build?.source_package_stager !== 'scripts/stage_wasm_package.mjs' ||
  receipt.reproducibility?.independent_target_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.to_spec_validate !== true ||
  receipt.witnesses?.infer_files !== true ||
  receipt.witnesses?.legal_closure !== true
) throw new Error('nirs4all-io WASM provenance contract mismatch')

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = inventory(root).filter((name) => name !== 'PROVENANCE.json')
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`nirs4all-io WASM inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}
for (const file of receipt.files) {
  const pinned = EXPECTED_FILES[file.path]
  const path = join(root, file.path)
  if (file.size !== pinned.size || file.sha256 !== pinned.sha256 || statSync(path).size !== pinned.size || sha256(path) !== pinned.sha256) {
    throw new Error(`staged nirs4all-io file does not match qualified bytes: ${file.path}`)
  }
}

const sbom = JSON.parse(readFileSync(join(root, 'nirs4all-io-wasm.cdx.json'), 'utf8'))
const sbomRoot = sbom.metadata?.component
const sbomProperties = Object.fromEntries((sbomRoot?.properties ?? []).map(({ name, value }) => [name, value]))
if (
  sbom.bomFormat !== 'CycloneDX' ||
  sbom.specVersion !== '1.6' ||
  sbom.serialNumber !== undefined ||
  sbom.metadata?.timestamp !== undefined ||
  sbomRoot?.name !== 'nirs4all-io-wasm' ||
  sbomRoot?.version !== EXPECTED.version ||
  sbomProperties['nirs4all:source:commit'] !== EXPECTED.commit ||
  sbomProperties['nirs4all:source:tree'] !== EXPECTED.tree ||
  sbom.components?.length !== 55
) throw new Error('nirs4all-io CycloneDX SBOM contract mismatch')

const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (metadata.name !== EXPECTED.package || metadata.version !== EXPECTED.version) {
  throw new Error(`package identity ${metadata.name}@${metadata.version} is not qualified`)
}
const module = await import(`${pathToFileURL(join(root, 'nirs4all_io_wasm.js')).href}?verify=${Date.now()}`)
module.initSync({ module: readFileSync(join(root, 'nirs4all_io_wasm_bg.wasm')) })
assertRuntimeWitness(module)
console.log(`nirs4all-io WASM ${EXPECTED.version} provenance and runtime verified`)
