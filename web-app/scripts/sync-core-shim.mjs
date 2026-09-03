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
  commit: '89787477bd7883ceb26b51fa3228bca13db85f6e',
  tree: '7d748e79e4bef0da2a0803f9a0dd8984e28a46bb',
  version: '0.3.27',
  npmSha256: 'dd55134aa9439ac4ac194bbcd7b5aa3ac5364de789672546c64e76cf4500b177',
  provenanceSha256: '2f1b6a228323c76c2a14e105b36db2a24fab3c77275526819afe48eca82feac3',
})

const sourceCandidates = [
  process.env.NIRS4ALL_CORE_WASM_DIR,
  process.env.NIRS4ALL_CORE_SHIM_ROOT,
  resolve(root, '..', '..', 'RC-v1-core-0.3.27', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'RC-v1-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-core', 'bindings', 'wasm'),
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
  'src/execution.js',
  'src/archive-v2.js',
  'native/nirs4all_core_wasm_native.d.ts',
  'native/nirs4all_core_wasm_native.js',
  'native/nirs4all_core_wasm_native_bg.wasm',
  'native/nirs4all_core_wasm_native_bg.wasm.d.ts',
  'native/package.json',
]

// Exact inventory of the independently fetched public 0.3.27 npm artifact. This
// is checked even when no sibling checkout is available, so CI cannot silently
// accept a stale or locally rebuilt WASM payload.
const pinnedPackageSha256 = new Map(Object.entries({
  'LICENSE': 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee',
  'LICENSES/AGPL-3.0-or-later.txt': 'd8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee',
  'LICENSES/Apache-2.0.txt': '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff',
  'LICENSES/BSD-3-Clause.txt': '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d',
  'LICENSES/COMMERCIAL-LICENSE.md': '4340124a3a1d3c82577ea3aebc834cb9d37ee196d83fbf320af218a751449702',
  'LICENSES/COMMERCIAL-LICENSE_FR.md': 'e05393d17534ba7129cd04f51c2ebe00448a4b427a50204f52ea37e906bf115a',
  'LICENSES/CeCILL-2.1.txt': '4ea234937bc7b0aa5247e436690d1eb9324875bc7590ecde50befd38e35190a5',
  'LICENSES/MIT.txt': 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5',
  'LICENSING.md': '46c57e67ed1e40c98a714f32a968b343650b02df3627744c28e9ceba011b7447',
  'README.md': 'b6495cd4bbec596ffb5dc713aa002597fc08149226702f5e3db1c52119177a38',
  'THIRD_PARTY_NOTICES.md': '36239a5e2cfb203f0f9b1a4d78578e938b35fc696e7bedc613e4030954ba14ac',
  'native/nirs4all_core_wasm_native.d.ts': '829c7e2b56cb9f97cdf35aee6da68ef765942a238949c4a3a994553a137bc0e3',
  'native/nirs4all_core_wasm_native.js': 'e5b743ae98d98e61b6e5c46538ecc5a813e1293eb96f08bba99fe55e199b3e13',
  'native/nirs4all_core_wasm_native_bg.wasm': 'ace0b9079d98f6411bf02a483ea27f0767b6a1ebb1415740e31b12a892a80f44',
  'native/nirs4all_core_wasm_native_bg.wasm.d.ts': '156193632dd90859ae50d7da7cfc3ea2f138832bc1c2da6eebb5b3e9b16a0c94',
  'native/package.json': '3bbe5e8299800d65f571d6b8d503911b1fdeed914ce1ebc308a80a7b710d806f',
  'package.json': '3d7fc4e0a0e6f7ab5decd6c4a91514268312a329e6d2ca580ea5347a1b99a0db',
  'src/archive-v2.js': '69b613bce35ccb34ee328a4257f0254ce58719d95d6519ac38ff0eb81710b7e4',
  'src/execution.js': '1137730eca30c14c6615c40ca6cd979dbc1d48930a5103f0b3a44630c98784c6',
  'src/index.d.ts': 'c43856d507a043402ec746801e704e1d02c86c9aa67e7ff875fecab0a8d9e069',
  'src/index.js': '6fa6a44e29300ca0add1bfdb5aab2deb64ca069655505d4a66dd6467ca1a1326',
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
  throw new Error(
    `nirs4all-core sibling identity mismatch: ${sourceCommit}/${sourceTree} != ${expected.commit}/${expected.tree}`,
  )
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
