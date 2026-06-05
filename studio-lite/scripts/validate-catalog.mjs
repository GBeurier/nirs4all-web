#!/usr/bin/env node
// Catalog ↔ ABI drift gate. Every n4m_* symbol referenced by the node catalog
// must be an exported libn4m symbol upstream — so the demo never advertises a
// method the engine can't run (e.g. OPLS). Fails CI on drift.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
// candidate locations for the upstream ABI symbol snapshot
const abiCandidates = [
  join(root, '../../nirs4all-methods/cpp/abi/expected_symbols_linux.txt'),
  join(root, '../../nirs4all-methods/cpp/abi/expected_symbols_macos.txt'),
]

let abiText = ''
for (const p of abiCandidates) {
  try {
    abiText += '\n' + readFileSync(p, 'utf8')
  } catch {
    /* optional */
  }
}
if (!abiText.trim()) {
  console.warn('⚠ catalog validator: upstream nirs4all-methods ABI snapshot not found — skipping (run in the ecosystem tree to enforce).')
  process.exit(0)
}
const exported = new Set(abiText.split(/\s+/).filter((s) => s.startsWith('n4m_')))

const nodesSrc = readFileSync(join(root, 'src/catalog/nodes.ts'), 'utf8')
// only check symbols declared inside `n4m: { ... }` blocks
const symbols = new Set()
for (const m of nodesSrc.matchAll(/n4m:\s*\{([^}]*)\}/g)) {
  for (const s of m[1].matchAll(/'(n4m_[a-z0-9_]+)'/g)) symbols.add(s[1])
}

const missing = [...symbols].filter((s) => !exported.has(s))
// predict-side helpers live in the JS binding (emscripten-only n4m_wasm_*),
// not the C ABI snapshot — allow them
const ALLOW = new Set(['n4m_wasm_pls_predict_from_coeffs', 'n4m_wasm_model_predict_from_coeffs'])
const realMissing = missing.filter((s) => !ALLOW.has(s))

console.log(`catalog validator: ${symbols.size} symbols referenced, ${exported.size} exported upstream.`)
if (realMissing.length) {
  console.error('✗ catalog references symbols NOT exported by libn4m:\n  - ' + realMissing.join('\n  - '))
  process.exit(1)
}
if (/\bOPLS\b/.test(nodesSrc) && /type:\s*'OPLS'/.test(nodesSrc)) {
  console.error('✗ OPLS is advertised but not exported in the ABI — remove it from the v1 catalog.')
  process.exit(1)
}

// --- DAG / structure operators ↔ nirs4all-studio canonical registry ---------
// Every `dag.studioNodeType` token in the catalog must be a real flow/utility
// node id in nirs4all-studio's CANONICAL registry (the generated
// node-reference.json — e.g. branch.parallel, merge.sources,
// container.concat_transform, generator.or), so the structural/generator
// operator set lines up with what studio actually provides. Best-effort: skips
// if the studio repo isn't in the tree (e.g. CI without the sibling checkout).
const referenced = [...new Set([...nodesSrc.matchAll(/studioNodeType:\s*'([a-z_.]+)'/g)].map((x) => x[1]))]
let studioFlowIds = null
try {
  const reg = JSON.parse(readFileSync(join(root, '../../nirs4all-studio/src/data/nodes/generated/node-reference.json'), 'utf8'))
  const nodes = Array.isArray(reg) ? reg : (reg.nodes ?? Object.values(reg.definitions ?? reg))
  studioFlowIds = new Set(
    (Array.isArray(nodes) ? nodes : Object.values(nodes))
      .filter((n) => n && (n.type === 'flow' || n.type === 'utility'))
      .map((n) => n.id ?? n.name),
  )
} catch {
  /* optional — canonical registry absent */
}
if (studioFlowIds && studioFlowIds.size) {
  const badStudio = referenced.filter((t) => !studioFlowIds.has(t))
  if (badStudio.length) {
    console.error('✗ DAG operators reference id(s) NOT in nirs4all-studio’s canonical flow registry:\n  - ' + badStudio.join('\n  - '))
    console.error('  (canonical flow ids: ' + [...studioFlowIds].sort().join(', ') + ')')
    process.exit(1)
  }
  console.log(`✓ DAG operators ↔ nirs4all-studio canonical registry in sync (${referenced.length} ops: ${referenced.join(', ')}).`)
} else {
  console.warn('⚠ catalog validator: nirs4all-studio canonical registry not found — skipping DAG flow-id check.')
}

console.log('✓ catalog ↔ ABI in sync.')
