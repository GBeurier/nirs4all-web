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
  "commit": "68282900ab8314ab71182fd155b0493d896e4ee2",
  "tree": "95ded435a72c1bf3a031b0d26b31e98847058ce5",
  "version": "0.4.1",
  "npmSha256": "92fcbed30d6b8a9c47ccfbedec3543b9c7729ee63d7b3488905f99abb4ea95c3",
  "provenanceSha256": "81b79f5eaf7fa410d8014146ebb8056a33836b11b45d96841d04e1ce815ea424"
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
  "src/classic-ml.d.ts",
  "src/execution.js",
  "src/index.d.ts",
  "src/index.js",
  "src/js-estimator-controller.js",
  "src/ml-estimator-adapters.js",
  "src/n4m-roles.js",
  "src/native-augmentation.js"
]

// Exact inventory of the public 0.4.1 npm package. This is checked even
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
  "native/nirs4all_core_wasm_native.d.ts": "835f3fecd34c24a998288063dba32ef2b861d849bf18129826f43c50044f6041",
  "native/nirs4all_core_wasm_native.js": "dff3cc39efe0642da497d166167d32ea38e26f84f7de676da2a387cde6afe44e",
  "native/nirs4all_core_wasm_native_bg.wasm": "f9b89c4787f05239186d625955565509cd953ad576fe229febe3f5003fc3e22a",
  "native/nirs4all_core_wasm_native_bg.wasm.d.ts": "2f78b00c7756fc855b5bed15a893b6d14d2802d038e745ffce17814fa196df53",
  "native/package.json": "4546ce9eff13db3ae13eb98e29fe9b26135c1544f57704c8df230422acee5b0b",
  "package.json": "585f11d4bece2bfa3ededc5abbf8037b3757d409374c3e10b52ce2bfc06bec7d",
  "src/archive-v2.js": "d8764ad63ceb6d7bbcb24b9eb302771ab2b22046f94fd46eece79df196d7be33",
  "src/classic-ml.d.ts": "84b0bb294a01dba395b31dec48813d866014df0e635f0e71c4ec8b084f00cd04",
  "src/execution.js": "dcc35fbe1a741764864c75786172362949e79815c862a014a08eafe535bee962",
  "src/index.d.ts": "c62bad39f309558638c1d56f6f70345ccf1dd8e0b3f6c45b15f65f0551bfdaed",
  "src/index.js": "e48e57c8aa9f66a4678923b1ead17c963ca0532d14a364d0085a241665901fdc",
  "src/js-estimator-controller.js": "24166d1a8694c8afc9bfd104e574422ac3e08cd9e02dd069bc06bcac64236061",
  "src/ml-estimator-adapters.js": "530e3081a3caba6e4f726f21fff7aaa48b0b95b10680e60c4d70531e0f399701",
  "src/n4m-roles.js": "8e7564714f4bca0795ef6024b512ed85bc6cb2e719b6360e4ccf734e4b7d3abb",
  "src/native-augmentation.js": "eefca27e7d15c711e87f78a5661357f0db5afda6de8d7446cfefffa997d3ac2a"
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
