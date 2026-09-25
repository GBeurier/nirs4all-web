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
  commit: '57e372202989becb77f3b706b7ab9a5f0014e9f7',
  tree: '57202cc8b0430ad16a68d51926ce0014c7181de4',
  version: '0.3.32',
  npmSha256: '8e28bf41ca7afa8c36b63c989fb3b316065d29960d3bd985082a04f31b8fd4ea',
  provenanceSha256: '375901247d30febea10cf218ef3adbd6ca91bea6d3a7db913965ec0527274e95',
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
  'package.json',
  'README.md',
  'LICENSE',
  'src/index.js',
  'src/index.d.ts',
  'src/js-estimator-controller.js',
  'src/execution.js',
  'src/archive-v2.js',
  'native/nirs4all_core_wasm_native.d.ts',
  'native/nirs4all_core_wasm_native.js',
  'native/nirs4all_core_wasm_native_bg.wasm',
  'native/nirs4all_core_wasm_native_bg.wasm.d.ts',
  'native/package.json',
]

// Exact inventory of the locally qualified 0.3.32 npm package. This is
// checked even when no sibling checkout is available.
const pinnedPackageSha256 = new Map(Object.entries({
  "LICENSE": 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee',
  "LICENSES/AGPL-3.0-or-later.txt": 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee',
  "LICENSES/Apache-2.0.txt": '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff',
  "LICENSES/BSD-3-Clause.txt": '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d',
  "LICENSES/COMMERCIAL-LICENSE.md": '4340124a3a1d3c82577ea3aebc834cb9d37ee196d83fbf320af218a751449702',
  "LICENSES/COMMERCIAL-LICENSE_FR.md": 'e05393d17534ba7129cd04f51c2ebe00448a4b427a50204f52ea37e906bf115a',
  "LICENSES/CeCILL-2.1.txt": '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5',
  "LICENSES/MIT.txt": 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5',
  "LICENSING.md": '46c57e67ed1e40c98a714f32a968b343650b02df3627744c28e9ceba011b7447',
  "README.md": '7b3d236125640810d9984a411db07b33cb34ef1579f3fcb212fd7d96102ce539',
  "THIRD_PARTY_NOTICES.md": '36239a5e2cfb203f0f9b1a4d78578e938b35fc696e7bedc613e4030954ba14ac',
  "native/nirs4all_core_wasm_native.d.ts": '829c7e2b56cb9f97cdf35aee6da68ef765942a238949c4a3a994553a137bc0e3',
  "native/nirs4all_core_wasm_native.js": 'e5b743ae98d98e61b6e5c46538ecc5a813e1293eb96f08bba99fe55e199b3e13',
  "native/nirs4all_core_wasm_native_bg.wasm": '66c39cdde1482203800518b614fb16fa3dce3bc4f02197cc71778c98b24a4d0a',
  "native/nirs4all_core_wasm_native_bg.wasm.d.ts": '156193632dd90859ae50d7da7cfc3ea2f138832bc1c2da6eebb5b3e9b16a0c94',
  "native/package.json": '11dcbbca834811c2779ccdd44a13beb995345f3562e78090fd9d922a204a21f5',
  "package.json": 'ea2651608a62c059617e37028db7d5c3cb368a64f7b1ad196ef04bd83651feb7',
  "src/archive-v2.js": '69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4',
  "src/execution.js": '7e58d4d121675ca441cba89a8ac4399e9797d3b04d3b0284721aa392c86772de',
  "src/index.d.ts": '85f17b4b1e44508c63e23ec5a8aa0a079b4fbc6fb555ba2c987659f0f80c0157',
  "src/index.js": '414e0d1798c2709611af9682f17752391e4f5902b5ce6fd370b85e9e2afdb16c',
  "src/js-estimator-controller.js": '3766a3b4035e96d7f24e91a6912ad318a895fd1bd261ffe5808d9404601d9ad6',
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
