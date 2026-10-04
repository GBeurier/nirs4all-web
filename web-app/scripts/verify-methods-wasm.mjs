import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED = Object.freeze({
  "commit": "dcc570b3647f77cf0428dd346078f442ed5cd032",
  "tree": "4b711a5cf7b0fb1e10a6ed99e1202bdd89917c42",
  "version": "1.3.2",
  "runtimeVersion": "1.3.2+abi.2.17.0",
  "abi": "2.17.0",
  "emscripten": "3.1.74",
  "package": "@nirs4all/methods",
  "npmIntegrity": "sha512-EAahIiRbQYKsJkOZ78M8RU2eoa+K7dvgOpmIRLpILdqWP/7Dq5bqB0i9DDPuVTCIXk/I80eXpyTJeisx9KV92w=="
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
  "LICENSES/COMMERCIAL-LICENSE.md": {
    "size": 680,
    "sha256": "f26f5d9ce50fbbebf089b921bcb44add711cb066ec4dbb767da450dc767a81a6"
  },
  "LICENSES/COMMERCIAL-LICENSE_FR.md": {
    "size": 769,
    "sha256": "d6cb8560f7f4ba35443d91e47280da0e9b2369ba05b597db9d812646cc4336ee"
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
    "size": 2133,
    "sha256": "674f3ab09bc6fca997bc765bbd5b710aabecb60d68f722ed4182bf40ec274bf1"
  },
  "LICENSING_FR.md": {
    "size": 2280,
    "sha256": "6996c1e0385782ca1d6adf3a2fe07189a4bbcad8be727adb7cac0b85c71255a1"
  },
  "NOTICE.md": {
    "size": 1190,
    "sha256": "c85840381f10a962f85703c0cffbaadeaa22bd9e2ea607b360f9623baa2702a8"
  },
  "THIRD_PARTY_LICENSES.md": {
    "size": 4804,
    "sha256": "0f61b74f895a6fa4c8026bf465da107037a3d291bc9f2fe5b3f030585b6f71c9"
  },
  "THIRD_PARTY_NOTICES.md": {
    "size": 1520,
    "sha256": "d7cb88c7da4946046de190b23be0b747f10136f8423e3eda29d5d9c2a9b192e4"
  },
  "config.d.ts": {
    "size": 512,
    "sha256": "50baeef98dc3ed4e3840aeb2146c61d2a3c66ad598f4ef0818c2ea6c887ef7f9"
  },
  "config.js": {
    "size": 1982,
    "sha256": "386dfd18890d81c815bb07ccaa1ae1dd8e9f0f6063a85bf8b90869e7a5938788"
  },
  "context.d.ts": {
    "size": 800,
    "sha256": "701d7344a07f4f3f3487ce182a04e3493781f5818e0d69acdb2b11dfaf668ec6"
  },
  "context.js": {
    "size": 1572,
    "sha256": "3a58b4044b0ddb86bbfdfc4127b8146b69bc087e043364ef402840d3ad4142c5"
  },
  "estimatorRoles.d.ts": {
    "size": 7845,
    "sha256": "2389591087f0dbea32e6b252ac4f16b51e8bc513f8f1e9f440f50b94f531d38a"
  },
  "estimatorRoles.js": {
    "size": 26633,
    "sha256": "632245bd3548e23aaf619a93a63e3d222d52e4b13395eafd8c023f1b98d32d66"
  },
  "estimatorRolesGenerated.d.ts": {
    "size": 166757,
    "sha256": "f47b9fc7d08226bf0828d9186570e1c733c5da5cf85c6bfd1fc0c1780695375e"
  },
  "estimatorRolesGenerated.js": {
    "size": 113071,
    "sha256": "07c58441f641782459f716c9ce2e07538968c7e3d5afd388d643581a838e4784"
  },
  "ffi.d.ts": {
    "size": 2285,
    "sha256": "cc1f3aa4183c1e9565485d257af728b2881e1663f00c98949969be1443556a15"
  },
  "ffi.js": {
    "size": 4655,
    "sha256": "5c548af3c9ca606cd33b7cc5e4d3fd0fa0b05de2ae1393126e7c75df36feab45"
  },
  "index.d.ts": {
    "size": 2988,
    "sha256": "8cc3b78cd8c435507fa4d0326fcd1965745220f7ae62dca1b5bbc834dd057f6c"
  },
  "index.js": {
    "size": 2718,
    "sha256": "26c7d18175e9212734c68af8a4364aa6e0c94c4348cf55b1f344c53c456b368e"
  },
  "methodResult.d.ts": {
    "size": 1514,
    "sha256": "b75ef84c1fdfb73a3a20e342a4e83170ee350118d1d6bdc152c41569636e9cf4"
  },
  "methodResult.js": {
    "size": 7244,
    "sha256": "b170d81532878c83cce9a13c14d9d7645c0368272106a905a297723fd001fb8d"
  },
  "model.d.ts": {
    "size": 11450,
    "sha256": "545e4dc89f7543d822d761ec503d6e6bb5d274501a6c6d0de8af3ab752dc0eba"
  },
  "model.js": {
    "size": 28099,
    "sha256": "f39f2ca8e181cdc3193ca8cf0228faa084b937147ea1d8e3ebd471afa5326b4f"
  },
  "multimodalPipeline.d.ts": {
    "size": 2983,
    "sha256": "8c22fec8585580e58ccbac637be206eaa460a0e89d0e684a9042b8a299428951"
  },
  "multimodalPipeline.js": {
    "size": 28174,
    "sha256": "c791bc9d50ed90a589a7ef888cc67046519bd90c39e2652b6d7281fe8ca79603"
  },
  "n4m.js": {
    "size": 191970,
    "sha256": "0f7f56ad8b67ca7d78bc9ef1d9bac986d3dd99e1038a6a5ad2a6943396ebe6fd"
  },
  "n4m.wasm": {
    "size": 2817247,
    "sha256": "18e7ea2d3804b8eafb32a550c835982c1c9219667123cecdc69fb99a25e5d518"
  },
  "nativeAugmentation.d.ts": {
    "size": 1340,
    "sha256": "55e3f2d7692ec5da253c8b17c3e9b9efaa497c6a4a465e7c37cb6c224905aee2"
  },
  "nativeAugmentation.js": {
    "size": 2479,
    "sha256": "f623004e281162862a3fa10095e9a3d162159663a53952235aa2333e0d5ae851"
  },
  "nativeModel.d.ts": {
    "size": 735,
    "sha256": "e28d791d034cc030bf9501dd4b6b7a6adb522cda3bc8cba237f837f6f2468fd9"
  },
  "nativeModel.js": {
    "size": 3890,
    "sha256": "6de1d1ac18aed75fe3921460fd5f7e0c77322b89d69874d181b6222a620fed49"
  },
  "nativePreprocessingPipeline.d.ts": {
    "size": 1591,
    "sha256": "7f264bf4dd9733450ad6ef3f64796f959c666e64c0e53030d7c44c91e7bb8469"
  },
  "nativePreprocessingPipeline.js": {
    "size": 11029,
    "sha256": "3e3d2106b7eda95f3c0dce82d06d9a9947ed548e28858caf798f2a90c6b4538d"
  },
  "nativeSplitter.d.ts": {
    "size": 1040,
    "sha256": "45523cf0dc068f8e61d2e30835b3f7249388a5949cb6061ad71e3c8728ca924d"
  },
  "nativeSplitter.js": {
    "size": 5272,
    "sha256": "4277fe3a0bf0625b7b1c3e3417888017bd9746a3f2a4dcba42ef38807c5aa163"
  },
  "optimization.d.ts": {
    "size": 4026,
    "sha256": "1205fbd561a0d0121b3a08e5c2cbab5f4055d11e55d691f4f835d67708db3a19"
  },
  "optimization.js": {
    "size": 29995,
    "sha256": "04c0568d1cd84c0eb2d535e1c3b26abb10eae45aebb66a95db10e06aeb019bce"
  },
  "preprocessing.d.ts": {
    "size": 985,
    "sha256": "9408b9c93abdc74af2e0c8b042fdcd17ea1701961b6f6a746e0cc7ad1ed79a49"
  },
  "preprocessing.js": {
    "size": 4726,
    "sha256": "e9714d38d9a744a706ff38c13c4b42fc737a3236dee6a1ccdf9e690db2519af8"
  },
  "rolePipeline.d.ts": {
    "size": 4750,
    "sha256": "ff7bff5b830f829f90e039cd543dd7c052c7835031bd8e3b7e777324564a1f41"
  },
  "rolePipeline.js": {
    "size": 20140,
    "sha256": "8779166e0a71339e120d608cfdd0ecd03d1630e7b7f42c8bea38c4a881913033"
  },
  "selection.d.ts": {
    "size": 508,
    "sha256": "b42f61adb1047978a3f719b109342d3be37850f7155a19993159c45393f1c01e"
  },
  "selection.js": {
    "size": 11407,
    "sha256": "112ba4aa0db523b9edcd46f62df36c0b28b4129adf7920e1822c30334a6eb237"
  },
  "serialization.d.ts": {
    "size": 2028,
    "sha256": "0ca1d47fb4b6d189b2fbfa270d4669ed3505c7896636b5607757c2a05c14ed0a"
  },
  "serialization.js": {
    "size": 5133,
    "sha256": "0bbb43cf63525293ff8675a4fb53c42b9aa36a940d1807a53ec9e4c84bd75474"
  },
  "spectralEncoding.d.ts": {
    "size": 746,
    "sha256": "93e20866de551a539a65d9e6597385d79c8343130d9cc7c2a5b2870cd391dff7"
  },
  "spectralEncoding.js": {
    "size": 4096,
    "sha256": "9e867f17b05949dd2581ad90c53bc86dc744c146490e25f4eb100b87703a81ac"
  },
  "types.d.ts": {
    "size": 1817,
    "sha256": "68f54b1ae5383ab23e80ee9e3e79d790581372418e6039453a6f3962a40a28b8"
  },
  "types.js": {
    "size": 3702,
    "sha256": "a8c1310252eb6fe4e78fd55511b1976cd598653853c1ea060c44312fa929a60f"
  }
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
  const estimator = new (module.methodClass('models.pls.pls_regression'))()
  estimator.params = { n_components: 1 }
  estimator.fit(X, Y)
  const restored = module.NativeEstimator.fromN4me(estimator.toN4me())
  const direct = estimator.predict(X).data
  const replayed = restored.predict(X).data
  estimator.dispose()
  restored.dispose()
  if (restored.methodId !== 'models.pls.pls_regression' || direct.some((value, index) => value !== replayed[index])) {
    throw new Error('Methods estimator-role N4ME round-trip witness failed')
  }
  // A state that embeds training rows (kernel PLS) exports only with the explicit opt-in.
  const kernel = new (module.methodClass('models.pls.kernel'))()
  kernel.params = { n_components: 1 }
  kernel.fit(X, Y)
  let refused = false
  try {
    kernel.toN4me()
  } catch {
    refused = true
  }
  const shared = module.NativeEstimator.fromN4me(kernel.toN4me({ allowTrainingRows: true }))
  const optIn = refused && kernel.containsTrainingRows() && shared.containsTrainingRows()
  kernel.dispose()
  shared.dispose()
  if (!optIn) throw new Error('Methods training-row export opt-in witness failed')
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
  receipt.witnesses?.estimator_role_n4me !== true ||
  receipt.witnesses?.training_rows_opt_in !== true ||
  receipt.registry?.package !== `${EXPECTED.package}@${EXPECTED.version}` ||
  receipt.registry?.integrity !== EXPECTED.npmIntegrity ||
  receipt.registry?.byte_identical !== true ||
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
