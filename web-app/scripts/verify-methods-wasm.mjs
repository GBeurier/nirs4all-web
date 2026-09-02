import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  commit: 'a71ee2927524d03482183de3d6e22661efc05d12',
  tree: 'f6749f4c4be7dca161f3c2677dd10a9ac4434b66',
  version: '1.0.14',
  runtimeVersion: '1.0.14+abi.2.4.0',
  abi: '2.4.0',
  package: '@nirs4all/methods',
  emscripten: '3.1.74',
})
const EXPECTED_FILES = Object.freeze({
  'LICENSE': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/AGPL-3.0-or-later.txt': { size: 34020, sha256: 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee' },
  'LICENSES/Apache-2.0.txt': { size: 10280, sha256: '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff' },
  'LICENSES/BSD-3-Clause.txt': { size: 1460, sha256: '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d' },
  'LICENSES/COMMERCIAL-LICENSE.md': { size: 680, sha256: 'f26f5d9ce50fbbebf089b921bcb44add711cb066ec4dbb767da450dc767a81a6' },
  'LICENSES/COMMERCIAL-LICENSE_FR.md': { size: 769, sha256: 'd6cb8560f7f4ba35443d91e47280da0e9b2369ba05b597db9d812646cc4336ee' },
  'LICENSES/CeCILL-2.1.txt': { size: 21778, sha256: '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5' },
  'LICENSES/MIT.txt': { size: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' },
  'LICENSING.md': { size: 2133, sha256: '674f3ab09bc6fca997bc765bbd5b710aabecb60d68f722ed4182bf40ec274bf1' },
  'LICENSING_FR.md': { size: 2280, sha256: '6996c1e0385782ca1d6adf3a2fe07189a4bbcad8be727adb7cac0b85c71255a1' },
  'NOTICE.md': { size: 1190, sha256: 'c85840381f10a962f85703c0cffbaadeaa22bd9e2ea607b360f9623baa2702a8' },
  'THIRD_PARTY_LICENSES.md': { size: 4782, sha256: '05105be116e1d57a7192c2ffa59d168e317f094cd98caa179527f7e92e3739e9' },
  'THIRD_PARTY_NOTICES.md': { size: 1520, sha256: 'd7cb88c7da4946046de190b23be0b747f10136f8423e3eda29d5d9c2a9b192e4' },
  'config.d.ts': { size: 512, sha256: '50baeef98dc3ed4e3840aeb2146c61d2a3c66ad598f4ef0818c2ea6c887ef7f9' },
  'config.js': { size: 1982, sha256: '386dfd18890d81c815bb07ccaa1ae1dd8e9f0f6063a85bf8b90869e7a5938788' },
  'context.d.ts': { size: 800, sha256: '701d7344a07f4f3f3487ce182a04e3493781f5818e0d69acdb2b11dfaf668ec6' },
  'context.js': { size: 1572, sha256: '3a58b4044b0ddb86bbfdfc4127b8146b69bc087e043364ef402840d3ad4142c5' },
  'ffi.d.ts': { size: 2285, sha256: 'cc1f3aa4183c1e9565485d257af728b2881e1663f00c98949969be1443556a15' },
  'ffi.js': { size: 4655, sha256: '5c548af3c9ca606cd33b7cc5e4d3fd0fa0b05de2ae1393126e7c75df36feab45' },
  'index.d.ts': { size: 1185, sha256: 'e14ddbe54ee0e0895dffd01a4fc6a36e34d288903a4303d73b2391300444cbd4' },
  'index.js': { size: 1813, sha256: '8931c298d302b12cec6c46cb62cf375bb4c45f6b1129481cb26f23f42c88b4f3' },
  'methodResult.d.ts': { size: 1385, sha256: 'b7f04f638af654c65198606650c6691107c9b636b531d807eed1f21affd55f4f' },
  'methodResult.js': { size: 5708, sha256: '48e484fc3c6e05bdbbf3db2ea748e237d8c84eb04004315d0bdea9203f235469' },
  'model.d.ts': { size: 10243, sha256: '86ad335441c6df563301fba365b7d5534acdda44dd4850cca3a16f2e02a3248f' },
  'model.js': { size: 24213, sha256: '0846c2596d1a241213c7abb3a71f73bcb8aa1642c3db34b05d87de67fac3a2bd' },
  'n4m.js': { size: 172179, sha256: '27b8015715d229064273d6383393474fe6a1639eeea7c6de9c844b63fd139cac' },
  'n4m.wasm': { size: 2056216, sha256: 'e30128f7b8b0446053d344286d2c3129303894c1f34ec3e8a721ff2995468bf3' },
  'preprocessing.d.ts': { size: 985, sha256: '9408b9c93abdc74af2e0c8b042fdcd17ea1701961b6f6a746e0cc7ad1ed79a49' },
  'preprocessing.js': { size: 4726, sha256: 'e9714d38d9a744a706ff38c13c4b42fc737a3236dee6a1ccdf9e690db2519af8' },
  'serialization.d.ts': { size: 964, sha256: '4b08af8515592d96371360b9badac41129148e81250976b3bfc9c399d3466310' },
  'serialization.js': { size: 2097, sha256: '656e450d6dbd82b9f0506bcaf797366dfe19c9c3e118b29d362eb8db2e8a3307' },
  'types.d.ts': { size: 1748, sha256: 'b8f21b59681e5fa18a13b4fd31d6e2c9a139ef6719f72012ca4dbe09f1529b9f' },
  'types.js': { size: 3577, sha256: '464fcb35f9fc3ca1c03ed888d125afba145269333098e25b9e864abd14b5aff0' },
})
const LEGAL_FILES = Object.freeze([
  'LICENSE',
  'LICENSING.md',
  'LICENSING_FR.md',
  'NOTICE.md',
  'THIRD_PARTY_LICENSES.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/COMMERCIAL-LICENSE.md',
  'LICENSES/COMMERCIAL-LICENSE_FR.md',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
].sort())

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'wasm', 'methods')
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

async function assertRuntimeWitness() {
  const module = await import(`${pathToFileURL(join(root, 'index.js')).href}?verify=${Date.now()}`)
  await module.loadModule()
  if (module.version() !== EXPECTED.runtimeVersion) throw new Error(`Methods runtime version ${module.version()} != ${EXPECTED.runtimeVersion}`)
  if (module.abiVersion().join('.') !== EXPECTED.abi) throw new Error(`Methods ABI ${module.abiVersion().join('.')} != ${EXPECTED.abi}`)
  const X = { data: Float64Array.from([0, 0, 1, 0, 0, 1, 1, 1]), rows: 4, cols: 2 }
  const Y = { data: Float64Array.from([0, 1, 2, 3]), rows: 4, cols: 1 }
  const prediction = module.predictPls(module.fitPls(X, Y, 1), X)
  const expected = [0, 1, 2, 3]
  const maxError = Math.max(...prediction.data.map((value, index) => Math.abs(value - expected[index])))
  if (prediction.rows !== 4 || prediction.cols !== 1 || !Number.isFinite(maxError) || maxError > 1e-10) {
    throw new Error(`Methods PLS fit/predict witness failed (max error ${maxError})`)
  }
}

if (!existsSync(receiptPath)) throw new Error(`missing nirs4all-methods WASM provenance: ${receiptPath}`)
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
if (
  receipt.schema !== 'nirs4all-web.wasm-provenance.v1' ||
  receipt.component !== 'nirs4all-methods-wasm' ||
  receipt.package !== EXPECTED.package ||
  receipt.version !== EXPECTED.version ||
  receipt.runtime_version !== EXPECTED.runtimeVersion ||
  receipt.abi !== EXPECTED.abi ||
  receipt.source?.commit !== EXPECTED.commit ||
  receipt.source?.tree !== EXPECTED.tree ||
  receipt.source?.clean !== true ||
  receipt.build?.target !== 'web' ||
  receipt.build?.profile !== 'release' ||
  receipt.build?.emscripten !== EXPECTED.emscripten ||
  receipt.reproducibility?.independent_build_directories !== 2 ||
  receipt.reproducibility?.byte_identical !== true ||
  receipt.witnesses?.runtime_version !== true ||
  receipt.witnesses?.abi_version !== true ||
  receipt.witnesses?.pls_fit_predict !== true ||
  receipt.legal_payload?.included !== true ||
  JSON.stringify([...receipt.legal_payload.files].sort()) !== JSON.stringify(LEGAL_FILES)
) throw new Error('nirs4all-methods WASM provenance contract mismatch')

const expectedFiles = Object.keys(EXPECTED_FILES).sort()
const declaredFiles = receipt.files.map(({ path }) => path).sort()
const actualFiles = inventory(root).filter((name) => name !== 'PROVENANCE.json')
if (JSON.stringify(declaredFiles) !== JSON.stringify(expectedFiles) || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`nirs4all-methods WASM inventory mismatch: declared=${declaredFiles}; actual=${actualFiles}; expected=${expectedFiles}`)
}
for (const file of receipt.files) {
  const pinned = EXPECTED_FILES[file.path]
  const path = join(root, file.path)
  if (file.size !== pinned.size || file.sha256 !== pinned.sha256 || statSync(path).size !== pinned.size || sha256(path) !== pinned.sha256) {
    throw new Error(`staged nirs4all-methods file does not match qualified bytes: ${file.path}`)
  }
}
await assertRuntimeWitness()
console.log(`nirs4all-methods WASM ${EXPECTED.runtimeVersion} provenance and runtime verified`)
