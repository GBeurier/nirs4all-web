// Verify published bytes and the explicitly recorded browser builds for this release.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const app = resolve(scripts, '..')
export const pins = JSON.parse(readFileSync(join(scripts, 'public-packages.v1.json'), 'utf8'))
const hash = (algorithm, bytes, encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding)
function inventory(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules') return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return inventory(root, path)
    if (!entry.isFile()) throw new Error(`Unsupported package entry: ${path}`)
    return [relative(root, path)]
  }).sort()
}
function check(bytes, fact, name) {
  if (bytes.length !== fact.size || hash('sha256', bytes) !== fact.sha256) throw new Error(`Published bytes differ: ${name}`)
}
export function verifyPackage(key) {
  const pin = pins[key]
  const root = resolve(app, pin.destination)
  const receipt = JSON.parse(readFileSync(join(root, 'PROVENANCE.json'), 'utf8'))
  const expected = { schema: 'nirs4all-web.public-npm-acquisition.v1', package: pin.package, version: pin.version,
    source: pin.source, acquisition: pin.registry, reproducibility: { performed_by_web: Boolean(pin.build), independent_rebuild_claimed: false }, files: pin.files, ...(pin.browser_deployment ? { browser_deployment: pin.browser_deployment } : {}), ...(pin.build ? { build: pin.build } : {}) }
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) throw new Error(`Acquisition receipt differs: ${key}`)
  const names = Object.keys(pin.files).sort()
  if (JSON.stringify(inventory(root).filter(name => name !== 'PROVENANCE.json')) !== JSON.stringify(names)) throw new Error(`Package inventory differs: ${key}`)
  for (const name of names) check(readFileSync(join(root, name)), pin.files[name], name)
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if ((metadata.name !== (pin.staged_package ?? pin.package)) || metadata.version !== pin.version || metadata.license.replace(/[()]/g, '') !== 'CECILL-2.1 OR AGPL-3.0-or-later') throw new Error(`Package identity/license differs: ${key}`)
  console.log(`${pin.package}@${pin.version} published inventory and acquisition verified`)
  return { pin, root }
}
export async function stagePackage(key) {
  const pin = pins[key]
  const metadata = await (await fetch(pin.registry.metadata_url)).json()
  const bytes = Buffer.from(await (await fetch(pin.registry.tarball_url)).arrayBuffer())
  check(bytes, pin.registry, key)
  if (metadata.name !== pin.package || metadata.version !== pin.version || metadata.dist?.tarball !== pin.registry.tarball_url ||
      metadata.dist?.integrity !== pin.registry.integrity || metadata.dist?.shasum !== pin.registry.sha1 ||
      hash('sha1', bytes) !== pin.registry.sha1 || `sha512-${hash('sha512', bytes, 'base64')}` !== pin.registry.integrity ||
      (metadata.gitHead && metadata.gitHead !== pin.source.commit)) throw new Error(`Registry identity/integrity differs: ${key}`)
  const temporary = mkdtempSync(join(tmpdir(), 'web-public-package-'))
  try {
    const archive = join(temporary, 'package.tgz')
    writeFileSync(archive, bytes)
    const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n').sort()
    if (names.some(name => !name.startsWith('package/') || name.includes('..')) || Object.values(pin.projection).some(name => !names.includes(`package/${name}`))) throw new Error(`Registry archive inventory differs: ${key}`)
    execFileSync('tar', ['-xzf', archive, '-C', temporary])
    const staged = join(temporary, 'staged')
    for (const [name, source] of Object.entries(pin.projection)) {
      let body = readFileSync(join(temporary, 'package', source))
      if (name === 'package.json' && pin.package_type_normalization) {
        const metadata = JSON.parse(body)
        metadata.type = pin.package_type_normalization
        body = Buffer.from(JSON.stringify(metadata, null, 2) + '\n')
      }
      check(body, pin.files[name], name)
      mkdirSync(dirname(join(staged, name)), { recursive: true })
      writeFileSync(join(staged, name), body)
    }
    for (const [name, fact] of Object.entries(pin.source_files)) {
      const body = Buffer.from(await (await fetch(`${pin.source.repository.replace('github.com', 'raw.githubusercontent.com')}/${pin.source.commit}/${fact.source_path}`)).arrayBuffer())
      check(body, fact, name)
      mkdirSync(dirname(join(staged, name)), { recursive: true })
      writeFileSync(join(staged, name), body)
    }
    if (pin.build) {
      if (execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim() !== pin.build.rustc) throw new Error('Build Rust compiler version differs')
      const source = process.env[`NIRS4ALL_${key.toUpperCase().replaceAll('-', '_')}_SOURCE`]
      if (!source) throw new Error(`Set NIRS4ALL_${key.toUpperCase().replaceAll('-', '_')}_SOURCE to the pinned clean source checkout`)
      const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
      if (git('rev-parse', 'HEAD') !== pin.source.commit || git('rev-parse', 'HEAD^{tree}') !== pin.source.tree || git('status', '--porcelain')) throw new Error(`Build source differs: ${key}`)
      const lock = join(source, key === 'datasets' ? 'bindings/wasm/Cargo.lock' : 'Cargo.lock')
      if (hash('sha256', readFileSync(lock)) !== pin.build.lock_sha256) throw new Error('Build lock differs')
      const target = join(temporary, 'target')
      const args = ['build', '--manifest-path', join(source, pin.build.manifest), '--target', 'wasm32-unknown-unknown', '--release', '--locked']
      if (pin.build.features.length) args.push('--features', pin.build.features.join(','))
      execFileSync('cargo', args, { stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target } })
      const bindgen = process.env[`NIRS4ALL_${key.toUpperCase().replaceAll('-', '_')}_BINDGEN`] ?? 'wasm-bindgen'
      if (execFileSync(bindgen, ['--version'], { encoding: 'utf8' }).trim() !== `wasm-bindgen ${pin.build.wasm_bindgen}`) throw new Error('Build wasm-bindgen version differs')
      const stem = key === 'datasets' ? 'nirs4all_datasets_wasm' : 'dag_ml_data_wasm'
      const generated = join(temporary, 'generated')
      execFileSync(bindgen, [join(target, 'wasm32-unknown-unknown/release', `${stem}.wasm`), '--target', 'web', '--out-dir', generated], { stdio: 'inherit' })
      for (const name of inventory(generated)) {
        const body = readFileSync(join(generated, name))
        check(body, pin.files[name], name)
        writeFileSync(join(staged, name), body)
      }
    }
    for (const [name, fact] of Object.entries(pin.browser_files ?? {})) {
      const body = Buffer.from(await (await fetch(fact.url)).arrayBuffer())
      check(body, fact, name)
      writeFileSync(join(staged, name), body)
    }
    const destination = resolve(app, pin.destination)
    if (JSON.stringify(inventory(staged)) !== JSON.stringify(Object.keys(pin.files).sort())) throw new Error(`Incomplete staged inventory: ${key}`)
    mkdirSync(destination, { recursive: true })
    // Keep npm's installed dependencies when refreshing a linked Core package.
    for (const name of inventory(destination)) rmSync(join(destination, name))
    for (const name of Object.keys(pin.files)) {
      mkdirSync(dirname(join(destination, name)), { recursive: true })
      copyFileSync(join(staged, name), join(destination, name))
    }
    writeFileSync(join(destination, 'PROVENANCE.json'), JSON.stringify({ schema: 'nirs4all-web.public-npm-acquisition.v1', package: pin.package, version: pin.version,
      source: pin.source, acquisition: pin.registry, reproducibility: { performed_by_web: Boolean(pin.build), independent_rebuild_claimed: false }, files: pin.files, ...(pin.browser_deployment ? { browser_deployment: pin.browser_deployment } : {}), ...(pin.build ? { build: pin.build } : {}) }, null, 2) + '\n')
    verifyPackage(key)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}
