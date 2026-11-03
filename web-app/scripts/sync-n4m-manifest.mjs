#!/usr/bin/env node
// SPDX-License-Identifier: CECILL-2.1
// Refresh (or --check) the checked-in n4m method manifest that the node catalog
// is generated from, so builds never need the native CLI.
//   node scripts/sync-n4m-manifest.mjs [--check] [--cli <path to n4m_cli>]
// Defaults to the staged Methods runtime; --cli / N4M_CLI select a native CLI.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src/catalog/n4m-manifest.json')
const args = process.argv.slice(2)
const cliFlag = args.indexOf('--cli')
let manifest
if (cliFlag >= 0 || process.env.N4M_CLI) {
  const cli = cliFlag >= 0 ? resolve(args[cliFlag + 1]) : process.env.N4M_CLI
  manifest = JSON.parse(execFileSync(cli, ['--manifest-json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
} else {
  const methods = await import('../src/engine/wasm/methods/index.js')
  await methods.loadModule()
  manifest = methods.manifest()
}
const text = `${JSON.stringify(manifest, null, 2)}\n`

if (args.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
    console.error('✗ src/catalog/n4m-manifest.json is stale — run npm run n4m:manifest')
    process.exit(1)
  }
  console.log(`✓ n4m manifest in sync (ABI ${manifest.abi}, ${manifest.methods.length} methods)`)
} else {
  writeFileSync(target, text)
  console.log(`wrote src/catalog/n4m-manifest.json (ABI ${manifest.abi}, ${manifest.methods.length} methods)`)
}
