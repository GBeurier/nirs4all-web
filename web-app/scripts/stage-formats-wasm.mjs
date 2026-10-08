import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const pin = JSON.parse(readFileSync(join(scripts, 'formats-public-pages.v1.json'), 'utf8'))
const destination = resolve(scripts, '..', 'src/engine/wasm/formats')
const capture = process.env.NIRS4ALL_FORMATS_PAGES_CAPTURE_DIR
const authorities = process.env.NIRS4ALL_FORMATS_DEPLOYMENT_CAPTURE_DIR
if (!capture || !authorities) throw new Error('Provide the pinned Formats public Pages file and deployment captures; no native build is performed.')
const sha = (data) => createHash('sha256').update(data).digest('hex')
function checked(base, name, expected) {
  const data = readFileSync(join(base, name))
  if (data.length !== expected.size || sha(data) !== expected.sha256) throw new Error(`Formats capture differs from qualified bytes: ${name}`)
  return data
}
const downloads = JSON.parse(checked(capture, 'downloads.json', pin.downloads_receipt).toString('utf8'))
for (const [name, expected] of Object.entries(pin.authority_files)) checked(authorities, name, expected)
const run = JSON.parse(readFileSync(join(authorities, 'formats211-official-demo-run.json'), 'utf8'))
const deployment = JSON.parse(readFileSync(join(authorities, 'formats211-public-pages-deployment.json'), 'utf8'))
const statuses = JSON.parse(readFileSync(join(authorities, 'formats211-public-pages-deployment-statuses.json'), 'utf8'))
if (run.id !== pin.run_id || run.head_sha !== pin.commit || run.conclusion !== 'success'
  || deployment.id !== pin.deployment_id || deployment.sha !== pin.commit || deployment.environment !== 'github-pages'
  || statuses[0]?.state !== 'success' || statuses[0]?.environment_url !== pin.deployment_url) throw new Error('Formats deployment source binding differs')
const declared = downloads.files.map((row) => row.path).sort()
if (JSON.stringify(declared) !== JSON.stringify(Object.keys(pin.published_files).sort())) throw new Error('Formats HTTP capture inventory differs')
for (const row of downloads.files) {
  const expected = pin.published_files[row.path]
  if (row.http_status !== 200 || row.url !== expected.url || row.final_url !== expected.url
    || row.bytes !== expected.size || row.sha256 !== expected.sha256) throw new Error(`Formats HTTP capture identity differs: ${row.path}`)
  checked(capture, row.path, expected)
}
for (const row of pin.source_extra_files) checked(destination, row.path, row)
function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? inventory(path) : [relative(destination, path).split(sep).join('/')]
  }).sort()
}
const allowed = new Set([...Object.keys(pin.staged_files), 'PROVENANCE.json', ...pin.obsolete_files.map((row) => row.path)])
if (inventory(destination).some((name) => !allowed.has(name))) throw new Error('Unexpected Formats destination file; refusing overwrite')
for (const row of pin.obsolete_files) {
  const path = join(destination, row.path)
  if (existsSync(path) && sha(readFileSync(path)) !== row.sha256) throw new Error(`Refusing removal of unrecognized old Formats artifact: ${row.path}`)
}
for (const name of Object.keys(pin.published_files)) copyFileSync(join(capture, name), join(destination, name))
for (const row of pin.obsolete_files) rmSync(join(destination, row.path), { force: true })
const provenance = {
  schema: 'nirs4all-web.wasm-pages-acquisition.v1', component: pin.component, package: pin.package, version: pin.version,
  source: { repository: 'https://github.com/GBeurier/nirs4all-formats', commit: pin.commit, tree: pin.tree, basis: 'Captured public Pages deployment and successful official run at this source; legal extras read from its exact Git tree.' },
  acquisition: { base_url: pin.deployment_url, deployment_id: pin.deployment_id, deployment_created_at: pin.deployment_created_at, run_id: pin.run_id, authority_files: pin.authority_files, downloads_receipt: pin.downloads_receipt, published_files: pin.published_files },
  public_workflow: { target: 'web', profile: 'release', features: ['console-errors'], cargo_locked_flag_present: false },
  reproducibility: { performed_by_web: false, independent_rebuild_claimed: false },
  source_extra_files: pin.source_extra_files,
  files: Object.keys(pin.staged_files).sort().map((name) => ({ path: name, size: statSync(join(destination, name)).size, sha256: sha(readFileSync(join(destination, name))) })),
}
writeFileSync(join(destination, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n')
await import(pathToFileURL(join(scripts, 'verify-formats-wasm.mjs')).href)
