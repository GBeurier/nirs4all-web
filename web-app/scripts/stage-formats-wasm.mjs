import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED_SOURCE = Object.freeze({
  commit: '2d46285843dc366da1d38f133131b5329c886b12',
  tree: '2ee12c035db8a78721315ee65cf684d811552aa9',
  version: '0.2.8',
  wasmBindgen: '0.2.127',
})
const PACKAGE_NAME = '@nirs4all/formats-wasm'
const GENERATED_PACKAGE_NAME = 'nirs4all-formats-wasm'
const GENERATED_FILES = Object.freeze([
  'README.md',
  'nirs4all_formats_wasm.d.ts',
  'nirs4all_formats_wasm.js',
  'nirs4all_formats_wasm_bg.wasm',
  'nirs4all_formats_wasm_bg.wasm.d.ts',
  'package.json',
  'snippets/rds2rust-b87e702ea5d57172/wasm/decompress.js',
])
const LICENSE_FILES = Object.freeze([
  'LICENSE',
  'LICENSING.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
])
const QUALIFIED_FILES = Object.freeze([...GENERATED_FILES, ...LICENSE_FILES].sort())

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(process.env.NIRS4ALL_FORMATS_ROOT ?? join(appRoot, '..', '..', 'nirs4all-formats'))
const crateRoot = join(sourceRoot, 'bindings', 'wasm')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'formats')
const wasmPack = process.env.WASM_PACK_BIN ?? 'wasm-pack'
const wasmPackMode = process.env.WASM_PACK_MODE

function command(commandName, args, options = {}) {
  const output = execFileSync(commandName, args, {
    cwd: options.cwd ?? appRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env,
  })
  return typeof output === 'string' ? output.trim() : ''
}

function git(...args) {
  return command('git', ['-C', sourceRoot, ...args], { capture: true })
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function inventory(root) {
  const files = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.gitignore') continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else files.push(relative(root, absolute).split(sep).join('/'))
    }
  }
  visit(root)
  return files.sort()
}

function copyRelative(sourceBase, destinationBase, name) {
  const output = join(destinationBase, name)
  mkdirSync(dirname(output), { recursive: true })
  copyFileSync(join(sourceBase, name), output)
}

function normalizePackage(path) {
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  const generatedName = metadata.name
  metadata.name = PACKAGE_NAME
  writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`)
  return generatedName
}

if (!existsSync(crateRoot)) throw new Error(`nirs4all-formats WASM crate not found: ${crateRoot}`)
if (git('status', '--porcelain') !== '') throw new Error(`nirs4all-formats source must be clean: ${sourceRoot}`)
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(`unexpected nirs4all-formats source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`)
}
const lock = readFileSync(join(crateRoot, 'Cargo.lock'), 'utf8')
const bindgenVersion = lock.match(/name = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1]
if (bindgenVersion !== EXPECTED_SOURCE.wasmBindgen) {
  throw new Error(`unexpected wasm-bindgen lock ${bindgenVersion}; expected ${EXPECTED_SOURCE.wasmBindgen}`)
}
for (const name of LICENSE_FILES) {
  if (!existsSync(join(sourceRoot, name))) throw new Error(`missing required license payload: ${name}`)
}
const emcc = process.env.EMCC_BIN ?? process.env.CC_wasm32_unknown_unknown ?? command('which', ['emcc'], { capture: true })
const emar = process.env.EMAR_BIN ?? process.env.AR_wasm32_unknown_unknown ?? command('which', ['emar'], { capture: true })

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-formats-'))
const outputs = []
let generatedPackageName = ''
try {
  for (const leg of ['a', 'b']) {
    const output = join(proofRoot, `out-${leg}`)
    const args = ['build', crateRoot, '--target', 'web', '--release', '--out-dir', output]
    if (wasmPackMode) args.push('--mode', wasmPackMode)
    args.push('--', '--locked')
    command(wasmPack, args, {
      env: {
        ...process.env,
        CARGO_TARGET_DIR: join(proofRoot, `target-${leg}`),
        SOURCE_DATE_EPOCH: String(source.epoch),
        CONST_RANDOM_SEED: source.commit,
        CC_wasm32_unknown_unknown: emcc,
        AR_wasm32_unknown_unknown: emar,
        CRATE_CC_NO_DEFAULTS: '1',
      },
    })
    const actualGenerated = inventory(output)
    if (JSON.stringify(actualGenerated) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected wasm-pack output: ${actualGenerated.join(', ')}`)
    }
    const legGeneratedName = normalizePackage(join(output, 'package.json'))
    if (generatedPackageName && legGeneratedName !== generatedPackageName) {
      throw new Error(`inconsistent generated package names: ${generatedPackageName} / ${legGeneratedName}`)
    }
    generatedPackageName = legGeneratedName
    for (const name of LICENSE_FILES) copyRelative(sourceRoot, output, name)
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(QUALIFIED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(QUALIFIED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) {
    throw new Error('nirs4all-formats WASM A/B builds are not byte-identical')
  }
  if (generatedPackageName !== GENERATED_PACKAGE_NAME) {
    throw new Error(`unexpected wasm-pack package name: ${generatedPackageName}`)
  }
  const metadata = JSON.parse(readFileSync(join(outputs[0], 'package.json'), 'utf8'))
  if (metadata.name !== PACKAGE_NAME || metadata.version !== EXPECTED_SOURCE.version) {
    throw new Error(`built package identity ${metadata.name}@${metadata.version} is not qualified`)
  }
  const module = await import(`${pathToFileURL(join(outputs[0], 'nirs4all_formats_wasm.js')).href}?verify=${Date.now()}`)
  module.initSync({ module: readFileSync(join(outputs[0], 'nirs4all_formats_wasm_bg.wasm')) })
  const features = module.features()
  const readers = module.readerCatalog()
  if (
    module.version() !== EXPECTED_SOURCE.version ||
    features?.hdf5 !== true || features?.matlab !== true || features?.parquet !== true ||
    !Array.isArray(readers) || readers.length !== 44 ||
    module.recommended_chunk_size_mb() !== 4
  ) {
    throw new Error('nirs4all-formats WASM runtime witness failed')
  }

  mkdirSync(destination, { recursive: true })
  const actualDestination = inventory(destination)
  const allowedDestination = new Set([...QUALIFIED_FILES, 'PROVENANCE.json'])
  const unexpected = actualDestination.filter((name) => !allowedDestination.has(name))
  if (unexpected.length > 0) throw new Error(`refusing to overwrite unexpected staged files: ${unexpected.join(', ')}`)
  for (const name of QUALIFIED_FILES) copyRelative(outputs[0], destination, name)

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'nirs4all-formats-wasm',
    package: PACKAGE_NAME,
    version: EXPECTED_SOURCE.version,
    source: {
      repository: 'https://github.com/GBeurier/nirs4all-formats',
      commit: source.commit,
      tree: source.tree,
      clean: true,
    },
    build: {
      target: 'web',
      profile: 'release',
      cargo_locked: true,
      source_date_epoch: source.epoch,
      const_random_seed: source.commit,
      wasm_bindgen_lock: bindgenVersion,
      tools: {
        wasm_pack: command(wasmPack, ['--version'], { capture: true }),
        cargo: command('cargo', ['--version'], { capture: true }),
        rustc: command('rustc', ['--version'], { capture: true }),
        emcc: command(emcc, ['--version'], { capture: true }).split('\n')[0],
      },
      package_name_normalization: { from: generatedPackageName, to: PACKAGE_NAME },
      supplemental_license_payload: LICENSE_FILES,
    },
    reproducibility: { independent_target_directories: 2, byte_identical: true },
    witnesses: { runtime_version: true, feature_flags: true, reader_catalog_count: readers.length, chunk_size_mb: 4 },
    files: QUALIFIED_FILES.map((name) => ({
      path: name,
      size: statSync(join(destination, name)).size,
      sha256: hashesA[name],
    })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged nirs4all-formats WASM ${EXPECTED_SOURCE.version} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
