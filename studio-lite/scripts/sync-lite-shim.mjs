#!/usr/bin/env node
// SPDX-License-Identifier: CECILL-2.1

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const vendor = resolve(root, 'vendor', 'nirs4all')
const check = process.argv.includes('--check')
const required = process.env.NIRS4ALL_LITE_SHIM_REQUIRED === '1'

const liteCandidates = [
  process.env.NIRS4ALL_CORE_WASM_DIR,
  process.env.NIRS4ALL_LITE_SHIM_ROOT,
  resolve(root, '..', '..', 'nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', '_worktrees', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'RC-v1-nirs4all-core', 'bindings', 'wasm'),
  resolve(root, '..', '..', 'nirs4all-lite', 'bindings', 'wasm'),
].filter(Boolean)

const lite = liteCandidates.find((candidate) => existsSync(candidate))

const files = [
  'package.json',
  'README.md',
  'LICENSE',
  'src/index.js',
  'src/index.d.ts',
  'src/execution.js',
]

if (!lite) {
  const msg = `nirs4all-core/lite shim not found. Tried: ${liteCandidates.join(', ')}`
  if (required) {
    throw new Error(msg)
  }
  console.warn(`[sync-lite-shim] ${msg}; skipping.`)
  process.exit(0)
}

console.log(`[sync-lite-shim] source ${relative(root, lite)}`)

let drift = false

for (const file of files) {
  const source = resolve(lite, file)
  const target = resolve(vendor, file)
  if (!existsSync(source)) {
    throw new Error(`missing source shim file: ${source}`)
  }

  const sourceText = readFileSync(source)
  const targetText = existsSync(target) ? readFileSync(target) : null
  if (targetText && Buffer.compare(sourceText, targetText) === 0) {
    continue
  }

  drift = true
  const pretty = relative(root, target)
  if (check) {
    console.error(`[sync-lite-shim] drift: ${pretty}`)
  } else {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, sourceText)
    console.log(`[sync-lite-shim] updated ${pretty}`)
  }
}

if (check && drift) {
  console.error('[sync-lite-shim] run `npm run vendor:lite` from studio-lite.')
  process.exit(1)
}

if (!drift) {
  console.log('[sync-lite-shim] vendor/nirs4all is up to date.')
}
