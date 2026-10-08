#!/usr/bin/env node
// SPDX-License-Identifier: CECILL-2.1

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const vendor = resolve(root, 'vendor', 'nirs4all')
const check = process.argv.includes('--check')
const required = process.env.NIRS4ALL_CORE_SHIM_REQUIRED === '1'
const logPrefix = '[sync-core-shim]'

const expected = Object.freeze({
  "commit": "5668796aaac9a02d8d0146ec05ead04f9c76657c",
  "tree": "a738c8a76bf2faa356c6db06f7e9aab78c26c517",
  "version": "0.4.5",
  "npmSha256": "4068294e29721796beaaac3f08d9ab54a3894601a569cf0f12f0b2dea8303d81",
  "provenanceSha256": "29da8be0555a344ae4d2d1ca39fd7e33333fcf5eeb2ed8af0b6825816afcef0e"
})

const sourceCandidates = [
  process.env.NIRS4ALL_CORE_WASM_DIR,
  process.env.NIRS4ALL_CORE_SHIM_ROOT,
  resolve(root, '..', '..', 'RC-v1-core-0.3.27', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'RC-v1-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'nirs4all-core-wasm-controllers', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'nirs4all-core-wasm-controllers', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
].filter(Boolean)

const sourceRoot = sourceCandidates.find((candidate) => existsSync(candidate))

const sourceFiles = [
  "LICENSE",
  "LICENSES/AGPL-3.0-or-later.txt",
  "LICENSES/Apache-2.0.txt",
  "LICENSES/BSD-3-Clause.txt",
  "LICENSES/COMMERCIAL-LICENSE.md",
  "LICENSES/COMMERCIAL-LICENSE_FR.md",
  "LICENSES/CeCILL-2.1.txt",
  "LICENSES/MIT.txt",
  "LICENSING.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "src/archive-v2.js",
  "src/browser-native-pipeline.d.ts",
  "src/browser-native-pipeline.js",
  "src/browser-tuning.d.ts",
  "src/browser-tuning.js",
  "src/classic-ml.d.ts",
  "src/conformal.d.ts",
  "src/conformal.js",
  "src/execution.js",
  "src/index.d.ts",
  "src/index.js",
  "src/js-estimator-controller.js",
  "src/ml-estimator-adapters.js",
  "src/multimodal-archive.d.ts",
  "src/multimodal-archive.js",
  "src/multimodal.d.ts",
  "src/multimodal.js",
  "src/n4m-roles.js",
  "src/native-augmentation.js",
  "src/native-multimodal.d.ts",
  "src/native-multimodal.js",
  "src/native-pipeline.d.ts",
  "src/native-pipeline.js",
  "src/result-view.d.ts",
  "src/result-view.js",
  "src/robustness.d.ts",
  "src/robustness.js",
  "src/tuning.d.ts",
  "src/tuning.js",
  "src/uncertainty-cohort.js",
  "src/workflow.d.ts",
  "src/workflow.js",
  "src/workspace.d.ts",
  "src/workspace.js"
]

// Exact inventory of the public 0.4.5 npm package. This is checked even
// when no sibling checkout is available.
const pinnedPackageSha256 = new Map(Object.entries({
  "LICENSE": "d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee",
  "LICENSES/AGPL-3.0-or-later.txt": "d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee",
  "LICENSES/Apache-2.0.txt": "074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff",
  "LICENSES/BSD-3-Clause.txt": "5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d",
  "LICENSES/COMMERCIAL-LICENSE.md": "4340124a3a1d3c82577ea3aebc834cb9d37ee196d83fbf320af218a751449702",
  "LICENSES/COMMERCIAL-LICENSE_FR.md": "e05393d17534ba7129cd04f51c2ebe00448a4b427a50204f52ea37e906bf115a",
  "LICENSES/CeCILL-2.1.txt": "4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5",
  "LICENSES/MIT.txt": "b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5",
  "LICENSING.md": "46c57e67ed1e40c98a714f32a968b343650b02df3627744c28e9ceba011b7447",
  "README.md": "dbc1ec5452a2bc4e62bbfacb2f20d609c0bbde3f8f4b49fd776ce5b8721664bc",
  "THIRD_PARTY_NOTICES.md": "36239a5e2cfb203f0f9b1a4d78578e938b35fc696e7bedc613e4030954ba14ac",
  "native/nirs4all_core_wasm_native.d.ts": "bc41410de95d94b72940509f61a1f6a3a142dc1dbe1977a79141468478a53c31",
  "native/nirs4all_core_wasm_native.js": "2e6e4032f1a6e1b1e31d64d60a074d223d8a9020b914d258b0d4c68c06d55189",
  "native/nirs4all_core_wasm_native_bg.wasm": "00fd7c991f72fa495e0fa76da905ba885b41a243530ebac9436e7e98db2a1e04",
  "native/nirs4all_core_wasm_native_bg.wasm.d.ts": "34267cab914657e5011c69cb838f54d983426adeee4bda72d0aa093d7866082e",
  "native/package.json": "f3bfed551621079ef0ffaafe5aa9a116965e74e6662cf75e638942685c6e7d63",
  "package.json": "b0d8da2f80863dfa21e6c5357b8685988552dc13702e50cfcc65fd00ed2d0758",
  "src/archive-v2.js": "7265d648a9c3aa62781ad5a1f2dc879c9f1a8bc748be9627dccac1fbbeb24a31",
  "src/browser-native-pipeline.d.ts": "cea682b9d91d29ed1ecf4dc4c7ccc88eac68973c4999b6583140791a6b871f59",
  "src/browser-native-pipeline.js": "9ad929007ac34f8c4fb698818d22c6672beb3b2b8a416894e94c280a33bcf3cb",
  "src/browser-tuning.d.ts": "14b3c9ef1ccb7eb1d22fb4e694e7ad6a325abaca1183e964df86525cc127b56a",
  "src/browser-tuning.js": "fdd989ca9e7416840c47fd4fb9b08d9a58ed872d2b626a10d0fb8e193ec9b84a",
  "src/classic-ml.d.ts": "84b0bb294a01dba395b31dec48813d866014df0e635f0e71c4ec8b084f00cd04",
  "src/conformal.d.ts": "5d58fd90afa24990b7b06ff081f0c8db718f85854bc4bd8d4a017a75bb9cc9e7",
  "src/conformal.js": "40806e5288e1f669967a8a7d4c93a527c865aa5e145e7f0c28c388a7e0563606",
  "src/execution.js": "dcc35fbe1a741764864c75786172362949e79815c862a014a08eafe535bee962",
  "src/index.d.ts": "522197f5d64d4a1e16510375b7618911a37feead5ae9c2604d483f49676367f8",
  "src/index.js": "f854343eff23b56926e7169d74f7d6d1f064fc6a71759a99f1053008fa3ded24",
  "src/js-estimator-controller.js": "24166d1a8694c8afc9bfd104e574422ac3e08cd9e02dd069bc06bcac64236061",
  "src/ml-estimator-adapters.js": "530e3081a3caba6e4f726f21fff7aaa48b0b95b10680e60c4d70531e0f399701",
  "src/multimodal-archive.d.ts": "5673c776ec1c95445f5373456f5e4774c5b550f223108e4c7710a5d8236dbae5",
  "src/multimodal-archive.js": "8c09b672d9b100dc14e585ba048b48bd8851041da06121c4eb4b2dc4d499608a",
  "src/multimodal.d.ts": "ba31be8aa9d3c1e3bfb5424802d79e33a8314a0a13f84f604840baeb3eaa4ff5",
  "src/multimodal.js": "05cd920a4d6dafe7ec2cf12ee1b8b8bd6919ec36e68a89ce1e888fd49a337e13",
  "src/n4m-roles.js": "8e7564714f4bca0795ef6024b512ed85bc6cb2e719b6360e4ccf734e4b7d3abb",
  "src/native-augmentation.js": "eefca27e7d15c711e87f78a5661357f0db5afda6de8d7446cfefffa997d3ac2a",
  "src/native-multimodal.d.ts": "ebca23e4145e1d74d6dbc2dfa129170cb82ab93a50204bea72fadd056a907a1f",
  "src/native-multimodal.js": "61c80287661219c83ccb0597b9a4841e78351521fa39dc0d79d30cbc426ece1f",
  "src/native-pipeline.d.ts": "77fabecf16226777dba55ae40d86a848f523f996158ffa87ff72aa62e47f7232",
  "src/native-pipeline.js": "9ee7dfe9713c6713fc6a4b1fe2104b9813263ae4b8812edc3af2a7bab7f07159",
  "src/result-view.d.ts": "fde34ced1775a9ffa798bf1bf9f4aa5ea52459bcf5cb4d8fc3e553066c8d1e17",
  "src/result-view.js": "a15a53d07d2f18a78fa80b4c2ab07cc1cf1035500c4b758b9a7c63125f7fef25",
  "src/robustness.d.ts": "d7c3a95e21508d90a058ceb010f448e28e48d7f65b1acb159c0142bd13dd27f0",
  "src/robustness.js": "f68204e9c2550d7eec979d253476ecd39e2240f20854b434ec9ba5ea2ea79129",
  "src/tuning.d.ts": "3f2b3e31175e912c8d68730f29bf1e50a7cec1fa9f72723b6efdd418966b50c0",
  "src/tuning.js": "c1c35e4d43b31799dff295a617f4791fc4a3b915a15a1fd9806caee2359dcaf9",
  "src/uncertainty-cohort.js": "3d6326a86bbaa19bccae17e1f6a236bce3a214437960cdbbc4f3ca3070d897ce",
  "src/workflow.d.ts": "cae8a9d196e0eeca446cc38cd4a8dea3748e9dfe59e1aa2dda4c3122e44ccd14",
  "src/workflow.js": "b9d6cb052547b1e90312d1493023f09ae3ec57bddb94d4b45d7df57e25701f81",
  "src/workspace.d.ts": "e40aff470aaef6d599952d9a35bda8eb25e8052bc215bd38ba77588348452107",
  "src/workspace.js": "5a862b1bf551ecfa161856b21dc085c5292d45223c68b94ff193b587a9a2fc17"
}))

function packageFiles(directory, prefix = '') {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ((prefix === '' && entry.name === 'PROVENANCE.md') || entry.name === 'node_modules') continue
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      found.push(...packageFiles(resolve(directory, entry.name), relativePath))
    } else if (entry.isFile()) {
      found.push(relativePath)
    } else {
      throw new Error(`unsupported staged package entry: ${relativePath}`)
    }
  }
  return found.sort()
}

function verifyPinnedPackage() {
  const expectedFiles = [...pinnedPackageSha256.keys()].sort()
  const actualFiles = packageFiles(vendor)
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`qualified Core package inventory mismatch: actual=${actualFiles}; expected=${expectedFiles}`)
  }

  for (const [file, expectedSha256] of pinnedPackageSha256) {
    const target = resolve(vendor, file)
    const actualSha256 = createHash('sha256').update(readFileSync(target)).digest('hex')
    if (actualSha256 !== expectedSha256) {
      throw new Error(`qualified Core package hash mismatch for ${target}: ${actualSha256} != ${expectedSha256}`)
    }
  }

  const packageMetadata = JSON.parse(readFileSync(resolve(vendor, 'package.json'), 'utf8'))
  if (packageMetadata.name !== 'nirs4all' || packageMetadata.version !== expected.version) {
    throw new Error(`qualified Core package identity mismatch: ${packageMetadata.name}@${packageMetadata.version}`)
  }

  const provenancePath = resolve(vendor, 'PROVENANCE.md')
  const provenanceSha256 = createHash('sha256').update(readFileSync(provenancePath)).digest('hex')
  if (provenanceSha256 !== expected.provenanceSha256) {
    throw new Error(`qualified Core provenance hash mismatch: ${provenanceSha256} != ${expected.provenanceSha256}`)
  }
}

function normalizeForWeb(file, bytes) {
  if (!['package.json', 'README.md', 'src/index.js'].includes(file)) {
    return bytes
  }
  const normalized = bytes.toString('utf8').replaceAll('@nirs4all/methods' + '-wasm', '@nirs4all/methods')
  if (file === 'package.json') {
    const metadata = JSON.parse(normalized)
    metadata.publishConfig = { access: 'public', provenance: true }
    return Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  }
  return Buffer.from(normalized, 'utf8')
}

if (!sourceRoot) {
  const msg = `nirs4all-core shim not found. Tried: ${sourceCandidates.join(', ')}`
  if (required) {
    throw new Error(msg)
  }
  verifyPinnedPackage()
  console.warn(`${logPrefix} ${msg}; verified pinned ${expected.version} package without sibling source.`)
  process.exit(0)
}

console.log(`${logPrefix} source ${relative(root, sourceRoot)}`)

const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const sourceTree = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim()
if (sourceCommit !== expected.commit || sourceTree !== expected.tree) {
  const msg = `nirs4all-core sibling identity mismatch: ${sourceCommit}/${sourceTree} != ${expected.commit}/${expected.tree}`
  if (!check || required) {
    throw new Error(msg)
  }
  verifyPinnedPackage()
  console.warn(`${logPrefix} ${msg}; verified pinned ${expected.version} package independently.`)
  process.exit(0)
}

let drift = false

for (const file of sourceFiles) {
  // Generated WASM bytes depend on the build toolchain. The published binary
  // is checked against the pinned registry hash by verifyPinnedPackage().
  if (file.startsWith('native/')) continue
  const source = resolve(sourceRoot, file)
  const target = resolve(vendor, file)
  if (!existsSync(source)) {
    const expectedSha256 = pinnedPackageSha256.get(file)
    if (expectedSha256 && existsSync(target)) {
      const actual = createHash('sha256').update(readFileSync(target)).digest('hex')
      if (actual === expectedSha256) continue
      throw new Error(`qualified generated shim hash mismatch for ${target}: ${actual} != ${expectedSha256}`)
    }
    throw new Error(`missing source shim file: ${source}`)
  }

  const sourceBytes = normalizeForWeb(file, readFileSync(source))
  const targetBytes = existsSync(target) ? readFileSync(target) : null
  if (targetBytes?.equals(sourceBytes)) {
    continue
  }

  drift = true
  const pretty = relative(root, target)
  if (check) {
    console.error(`${logPrefix} drift: ${pretty}`)
  } else {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, sourceBytes)
    console.log(`${logPrefix} updated ${pretty}`)
  }
}

if (check && drift) {
  console.error(`${logPrefix} run \`npm run vendor:core\` from web-app.`)
  process.exit(1)
}

verifyPinnedPackage()

if (!drift) {
  console.log(`${logPrefix} vendor/nirs4all ${expected.version} is up to date (${expected.commit}; npm ${expected.npmSha256}).`)
}
