#!/usr/bin/env node
// SPDX-License-Identifier: CECILL-2.1
// Refresh (or --check) the checked-in n4m method manifest that the node catalog
// is generated from, so builds never need the native CLI.
//   node scripts/sync-n4m-manifest.mjs [--check] [--cli <path to n4m_cli>]
// The CLI defaults to $N4M_CLI, then the sibling nirs4all-methods dev build.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src/catalog/n4m-manifest.json')
const args = process.argv.slice(2)
const cliFlag = args.indexOf('--cli')
const cli = cliFlag >= 0
  ? resolve(args[cliFlag + 1])
  : process.env.N4M_CLI ?? join(root, '../../nirs4all-methods/build/dev-release/cpp/cli/n4m_cli')

if (!existsSync(cli)) {
  console.error(`✗ n4m_cli not found at ${cli} (pass --cli or set N4M_CLI)`)
  process.exit(1)
}
const manifest = JSON.parse(execFileSync(cli, ['--manifest-json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
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
