#!/usr/bin/env node
// SPDX-License-Identifier: CECILL-2.1

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const vendor = resolve(root, 'vendor', 'nirs4all')
const check = process.argv.includes('--check')
const required = process.env.NIRS4ALL_CORE_SHIM_REQUIRED === '1'
const logPrefix = '[sync-core-shim]'

const sourceCandidates = [
  process.env.NIRS4ALL_CORE_WASM_DIR,
  process.env.NIRS4ALL_CORE_SHIM_ROOT,
  resolve(root, '..', '..', 'RC-v1-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
].filter(Boolean)

const sourceRoot = sourceCandidates.find((candidate) => existsSync(candidate))

const files = [
  'package.json',
  'README.md',
  'LICENSE',
  'src/index.js',
  'src/index.d.ts',
  'src/execution.js',
  'src/archive-v2.js',
  'native/package.json',
  'native/nirs4all_core_wasm_native.js',
  'native/nirs4all_core_wasm_native.d.ts',
  'native/nirs4all_core_wasm_native_bg.wasm',
  'native/nirs4all_core_wasm_native_bg.wasm.d.ts',
]

// wasm-pack output is intentionally not committed in nirs4all-core. When the
// sibling source checkout has not been built, still verify the exact generated
// files from the qualified 0.3.22 package instead of decoding them as text or
// silently skipping them.
const pinnedGeneratedSha256 = new Map(Object.entries({
  'native/package.json': 'dc78a0dfed37bbeaa24b0e73ffa119d96bca05543ecf6fe371af9fd7365355c3',
  'native/nirs4all_core_wasm_native.js': '3cefba88621070908ec83c6d88885076cbab7617e8a409c3699ae192cbfb00a4',
  'native/nirs4all_core_wasm_native.d.ts': '87cb5e55006d9184dca4ad8cdadb691f3a144345536daff62a494950098dfc3d',
  'native/nirs4all_core_wasm_native_bg.wasm': '6eb1f28ff00641415104411284029f7c49f85f612d15b70d776cf5a79edb1d82',
  'native/nirs4all_core_wasm_native_bg.wasm.d.ts': '98063e66d65f4a166eac9622cb86ad7a88b0c0141c9a9a37fdd896fad00dcfbc',
}))

function normalizeForWeb(file, bytes) {
  if (!['package.json', 'README.md', 'src/index.js'].includes(file)) {
    return bytes
  }
  return Buffer.from(
    bytes.toString('utf8').replaceAll('@nirs4all/methods' + '-wasm', '@nirs4all/methods'),
    'utf8',
  )
}

if (!sourceRoot) {
  const msg = `nirs4all-core shim not found. Tried: ${sourceCandidates.join(', ')}`
  if (required) {
    throw new Error(msg)
  }
  console.warn(`${logPrefix} ${msg}; skipping.`)
  process.exit(0)
}

console.log(`${logPrefix} source ${relative(root, sourceRoot)}`)

let drift = false

for (const file of files) {
  const source = resolve(sourceRoot, file)
  const target = resolve(vendor, file)
  if (!existsSync(source)) {
    const expected = pinnedGeneratedSha256.get(file)
    if (expected && existsSync(target)) {
      const actual = createHash('sha256').update(readFileSync(target)).digest('hex')
      if (actual === expected) continue
      throw new Error(`qualified generated shim hash mismatch for ${target}: ${actual} != ${expected}`)
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

if (!drift) {
  console.log(`${logPrefix} vendor/nirs4all is up to date.`)
}
