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
  commit: '7abd256cbad1ee4eff3b6d507dd3fd28d2caac80',
  tree: 'b36575f0e21e3ff08225c7f421ce99deabd26aeb',
  version: '0.1.12',
  wasmBindgen: '0.2.122',
})
const PACKAGE_NAME = '@nirs4all/io-wasm'
const GENERATED_PACKAGE_NAME = 'nirs4all-io-wasm'
const GENERATED_FILES = Object.freeze([
  'LICENSE',
  'README.md',
  'nirs4all_io_wasm.d.ts',
  'nirs4all_io_wasm.js',
  'nirs4all_io_wasm_bg.wasm',
  'nirs4all_io_wasm_bg.wasm.d.ts',
  'package.json',
])
const STAGED_FILES = Object.freeze([
  ...GENERATED_FILES,
  'COPY_PROVENANCE.md',
  'LICENSING.md',
  'THIRD_PARTY_NOTICES.md',
  'idiomatic.d.ts',
  'idiomatic.mjs',
  'nirs4all-io-wasm.cdx.json',
  'types/nirs4all-io.d.ts',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/COMMERCIAL-LICENSE.md',
  'LICENSES/COMMERCIAL-LICENSE_FR.md',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
  'LICENSES/Unicode-3.0.txt',
].sort())

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(process.env.NIRS4ALL_IO_ROOT ?? join(appRoot, '..', '..', 'nirs4all-io'))
const crateRoot = join(sourceRoot, 'bindings', 'wasm')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'io')
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

function assertRuntimeWitness(module) {
  if (module.version() !== EXPECTED_SOURCE.version) throw new Error(`WASM runtime version ${module.version()} != ${EXPECTED_SOURCE.version}`)
  const spec = module.to_spec(JSON.stringify({ name: 'web-witness', sources: [{ id: 'x', role: 'features', input: 'x.csv' }] }))
  module.validate(spec)
  const plan = module.inferFiles([
    {
      name: 'combined.csv',
      bytes: new TextEncoder().encode('sample_id;1000;1005;protein\ns1;0.10;0.20;11.2\ns2;0.30;0.40;12.5\n'),
    },
  ], {})
  if (JSON.parse(spec).schema_version !== 1 || plan?.structure?.value !== 'single_combined' || !plan?.resolved_spec?.sources?.length) {
    throw new Error('nirs4all-io WASM functional witness failed')
  }
}

if (!existsSync(crateRoot)) throw new Error(`nirs4all-io WASM crate not found: ${crateRoot}`)
if (git('status', '--porcelain') !== '') throw new Error(`nirs4all-io source must be clean: ${sourceRoot}`)
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(`unexpected nirs4all-io source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`)
}
const lock = readFileSync(join(crateRoot, 'Cargo.lock'), 'utf8')
const bindgenVersion = lock.match(/name = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1]
if (bindgenVersion !== EXPECTED_SOURCE.wasmBindgen) {
  throw new Error(`unexpected wasm-bindgen lock ${bindgenVersion}; expected ${EXPECTED_SOURCE.wasmBindgen}`)
}

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-io-'))
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
      },
    })
    const actualGenerated = inventory(output)
    if (JSON.stringify(actualGenerated) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected raw wasm-pack output: ${actualGenerated.join(', ')}`)
    }
    const rawMetadata = JSON.parse(readFileSync(join(output, 'package.json'), 'utf8'))
    if (generatedPackageName && rawMetadata.name !== generatedPackageName) {
      throw new Error(`inconsistent generated package names: ${generatedPackageName} / ${rawMetadata.name}`)
    }
    generatedPackageName = rawMetadata.name
    command(process.execPath, [join(sourceRoot, 'scripts', 'stage_wasm_package.mjs'), output], {
      env: { ...process.env, NPM_PKG_NAME: PACKAGE_NAME },
    })
    const stagedInventory = inventory(output)
    if (JSON.stringify(stagedInventory) !== JSON.stringify(STAGED_FILES)) {
      throw new Error(`unexpected authored nirs4all-io package output: ${stagedInventory.join(', ')}`)
    }
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(STAGED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(STAGED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) throw new Error('nirs4all-io WASM A/B builds are not byte-identical')
  if (generatedPackageName !== GENERATED_PACKAGE_NAME) throw new Error(`unexpected wasm-pack package name: ${generatedPackageName}`)
  const metadata = JSON.parse(readFileSync(join(outputs[0], 'package.json'), 'utf8'))
  if (metadata.name !== PACKAGE_NAME || metadata.version !== EXPECTED_SOURCE.version) {
    throw new Error(`built package identity ${metadata.name}@${metadata.version} is not qualified`)
  }
  const module = await import(`${pathToFileURL(join(outputs[0], 'nirs4all_io_wasm.js')).href}?verify=${Date.now()}`)
  module.initSync({ module: readFileSync(join(outputs[0], 'nirs4all_io_wasm_bg.wasm')) })
  assertRuntimeWitness(module)

  mkdirSync(destination, { recursive: true })
  const allowed = new Set([...STAGED_FILES, 'PROVENANCE.json'])
  const unexpected = inventory(destination).filter((name) => !allowed.has(name))
  if (unexpected.length > 0) throw new Error(`refusing to overwrite unexpected staged files: ${unexpected.join(', ')}`)
  for (const name of STAGED_FILES) copyRelative(outputs[0], destination, name)

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'nirs4all-io-wasm',
    package: PACKAGE_NAME,
    version: EXPECTED_SOURCE.version,
    source: {
      repository: 'https://github.com/GBeurier/nirs4all-io',
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
      package_name_normalization: { from: generatedPackageName, to: PACKAGE_NAME },
      source_package_stager: 'scripts/stage_wasm_package.mjs',
      tools: {
        wasm_pack: command(wasmPack, ['--version'], { capture: true }),
        cargo: command('cargo', ['--version'], { capture: true }),
        rustc: command('rustc', ['--version'], { capture: true }),
      },
    },
    reproducibility: { independent_target_directories: 2, byte_identical: true },
    witnesses: { runtime_version: true, to_spec_validate: true, infer_files: true, legal_closure: true },
    files: STAGED_FILES.map((name) => ({ path: name, size: statSync(join(destination, name)).size, sha256: hashesA[name] })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged nirs4all-io WASM ${EXPECTED_SOURCE.version} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
