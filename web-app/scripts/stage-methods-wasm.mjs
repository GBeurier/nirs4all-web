import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pin = JSON.parse(readFileSync(join(scriptDir, 'methods-public-package.v1.json'), 'utf8'))
const destination = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'methods')
const tarball = process.env.NIRS4ALL_METHODS_NPM_TARBALL
const metadataPath = process.env.NIRS4ALL_METHODS_NPM_METADATA
if (!tarball || !metadataPath) throw new Error('Provide authenticated NIRS4ALL_METHODS_NPM_TARBALL and NIRS4ALL_METHODS_NPM_METADATA captures; no Methods rebuild is performed.')
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding)
const archive = readFileSync(tarball)
const metadataBytes = readFileSync(metadataPath)
const metadata = JSON.parse(metadataBytes.toString('utf8'))
if (metadata.name !== pin.package || metadata.version !== pin.version || metadata.gitHead !== pin.commit
  || metadata.dist?.tarball !== pin.tarball_url || metadata.dist?.shasum !== pin.tarball_sha1
  || metadata.dist?.integrity !== pin.tarball_sri || archive.length !== pin.tarball_size
  || hash(archive) !== pin.tarball_sha256 || hash(archive, 'sha1') !== pin.tarball_sha1
  || `sha512-${hash(archive, 'sha512', 'base64')}` !== pin.tarball_sri) {
  throw new Error('Methods capture differs from the authenticated public package')
}
const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/).sort()
const expectedListing = Object.keys(pin.published_files).map((name) => `package/${name}`).sort()
if (JSON.stringify(listing) !== JSON.stringify(expectedListing)) throw new Error('Methods tarball inventory differs from the pinned public files')
for (const row of pin.source_extra_files) {
  const bytes = readFileSync(join(destination, row.path))
  if (bytes.length !== row.size || hash(bytes) !== row.sha256) throw new Error(`Methods source legal payload mismatch: ${row.path}`)
}
function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? inventory(path) : [relative(destination, path).split(sep).join('/')]
  }).sort()
}
const allowed = new Set([...Object.keys(pin.staged_files), 'PROVENANCE.json'])
if (inventory(destination).some((name) => !allowed.has(name))) throw new Error('Unexpected file in Methods destination; refusing overwrite')
const temporary = mkdtempSync(join(tmpdir(), 'nirs4all-web-methods-public-'))
try {
  execFileSync('tar', ['-xzf', tarball, '-C', temporary, '--no-same-owner', '--no-same-permissions'])
  for (const [name, expected] of Object.entries(pin.published_files)) {
    const bytes = readFileSync(join(temporary, 'package', name))
    if (bytes.length !== expected.size || hash(bytes) !== expected.sha256) throw new Error(`Methods public file hash mismatch: ${name}`)
  }
  for (const [from, to] of Object.entries(pin.published_to_staged)) {
    const path = join(destination, to)
    mkdirSync(dirname(path), { recursive: true })
    copyFileSync(join(temporary, 'package', from), path)
  }
  const provenance = {
    schema: 'nirs4all-web.wasm-public-acquisition.v1', component: pin.component,
    package: pin.package, version: pin.version, runtime_version: pin.runtimeVersion, abi: pin.abi,
    source: { commit: pin.commit, tree: pin.tree, npm_git_head: metadata.gitHead, basis: 'Actual public registry gitHead and its Git tree; legal extras read from that exact tree.' },
    acquisition: { registry_metadata_url: pin.registry_metadata_url, metadata_sha256: hash(metadataBytes), tarball_url: pin.tarball_url, tarball_sha256: pin.tarball_sha256, tarball_sha1: pin.tarball_sha1, tarball_sri: pin.tarball_sri, tarball_bytes: archive.length, sha256_sha1_sri_verified: true },
    reproducibility: { performed_by_web: false, independent_rebuild_claimed: false },
    source_extra_files: pin.source_extra_files,
    files: Object.keys(pin.staged_files).sort().map((name) => ({ path: name, size: statSync(join(destination, name)).size, sha256: hash(readFileSync(join(destination, name))) })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n')
  await import(pathToFileURL(join(scriptDir, 'verify-methods-wasm.mjs')).href)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
