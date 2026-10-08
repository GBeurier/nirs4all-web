import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(readFileSync(join(here, 'dagml-public-package.v1.json'), 'utf8'))
const destination = resolve(here, '..', 'src', 'engine', 'wasm', 'dagml')
const tarballPath = process.env.NIRS4ALL_DAG_ML_NPM_TARBALL
const metadataPath = process.env.NIRS4ALL_DAG_ML_NPM_METADATA
if (!tarballPath || !metadataPath) {
  throw new Error('Set NIRS4ALL_DAG_ML_NPM_TARBALL and NIRS4ALL_DAG_ML_NPM_METADATA to the captured public npm tarball and version metadata; this command does not rebuild WASM.')
}
const hash = (algorithm, bytes, encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding)
const bytes = readFileSync(tarballPath)
const metadataBytes = readFileSync(metadataPath)
const metadata = JSON.parse(metadataBytes.toString('utf8'))
if (metadata.name !== expected.package || metadata.version !== expected.version || metadata.gitHead !== expected.source.commit ||
    metadata.dist?.tarball !== expected.registry.tarball_url || metadata.dist?.integrity !== expected.registry.integrity ||
    metadata.dist?.shasum !== expected.registry.sha1 ||
    bytes.length !== expected.registry.tarball_size || hash('sha256', bytes) !== expected.registry.sha256 ||
    hash('sha1', bytes) !== expected.registry.sha1 || `sha512-${hash('sha512', bytes, 'base64')}` !== expected.registry.integrity) {
  throw new Error('Captured public dag-ml npm metadata or tarball does not match the pinned release')
}
const names = Object.keys(expected.public_files).sort()
const listed = execFileSync('tar', ['-tzf', resolve(tarballPath)], { encoding: 'utf8' }).trim().split('\n').sort()
if (JSON.stringify(listed) !== JSON.stringify(names.map((name) => `package/${name}`).sort())) {
  throw new Error('Pinned public dag-ml tarball inventory differs')
}
function inventory(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name)
    if (entry.isDirectory()) return inventory(root, path)
    if (!entry.isFile()) throw new Error(`unsupported staged entry: ${path}`)
    return [relative(root, path).split(sep).join('/')]
  }).sort()
}
// These extra legal/contract files were verified against the exact release source.
// Keep them byte-for-byte; the public npm package does not carry all of them.
for (const [name, fact] of Object.entries(expected.source_files)) {
  const bytes = readFileSync(join(destination, name))
  if (bytes.length !== fact.size || hash('sha256', bytes) !== fact.sha256) {
    throw new Error(`Additional source legal/contract file differs: ${name}`)
  }
}
const oldGeneratedDeclaration = 'dag_ml_wasm_bg.wasm.d.ts'
const allowed = new Set([...names, ...Object.keys(expected.source_files), 'PROVENANCE.json', oldGeneratedDeclaration])
for (const name of inventory(destination)) {
  if (!allowed.has(name)) throw new Error(`refusing to replace unexpected dag-ml staged file: ${name}`)
}
const temporary = mkdtempSync(join(tmpdir(), 'nirs4all-web-dagml-public-'))
try {
  execFileSync('tar', ['-xzf', resolve(tarballPath), '-C', temporary])
  for (const [name, fact] of Object.entries(expected.public_files)) {
    const file = join(temporary, 'package', name)
    const bytes = readFileSync(file)
    if (bytes.length !== fact.size || hash('sha256', bytes) !== fact.sha256) throw new Error(`Public dag-ml file differs: ${name}`)
  }
  const obsolete = join(destination, oldGeneratedDeclaration)
  if (existsSync(obsolete)) {
    if (hash('sha256', readFileSync(obsolete)) !== '03c4e00fa4e380fcff24e0a7991a1cd5481dbc9dcbc41dcae51abff60f67d9bf') {
      throw new Error('Obsolete private WASM declaration has unexpected bytes')
    }
    rmSync(obsolete)
  }
  for (const name of names) {
    mkdirSync(dirname(join(destination, name)), { recursive: true })
    copyFileSync(join(temporary, 'package', name), join(destination, name))
  }
  const files = [...names, ...Object.keys(expected.source_files)].sort().map((name) => ({
    path: name, size: statSync(join(destination, name)).size, sha256: hash('sha256', readFileSync(join(destination, name))),
  }))
  const receipt = {
    schema: 'nirs4all-web.public-wasm-acquisition.v1', component: expected.package, package: expected.package,
    version: expected.version, source: { repository: 'https://github.com/GBeurier/dag-ml', ...expected.source },
    acquisition: { metadata_url: expected.registry.metadata_url, tarball_url: expected.registry.tarball_url,
      git_head: metadata.gitHead, tarball_size: bytes.length, sha256: hash('sha256', bytes), sha1: hash('sha1', bytes),
      integrity: `sha512-${hash('sha512', bytes, 'base64')}`, metadata_sha256: hash('sha256', metadataBytes),
      sha256_sha1_sri_verified: true },
    reproducibility: { performed_by_web: false, independent_rebuild_claimed: false },
    licensing: { expression: metadata.license, payload_source: 'public npm package plus pinned source legal and contract files' },
    files,
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  await import('./verify-dagml-wasm.mjs')
  console.log(`staged published dag-ml WASM ${expected.version}; no native rebuild performed`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
