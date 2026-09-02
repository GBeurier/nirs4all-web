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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXPECTED_SOURCE = Object.freeze({
  commit: '01596ab6a77ce3141d1f96d1cf675d13cacbc59a',
  tree: '661750b9e565c76baa6fbc5550e88ece2aba7934',
  version: '0.3.8',
})
const PACKAGE_NAME = '@nirs4all/datasets-wasm'
const GENERATED_PACKAGE_NAME = '@nirs4all/nirs4all-datasets-wasm'
const GENERATED_FILES = Object.freeze([
  'LICENSE',
  'README.md',
  'nirs4all_datasets_wasm.d.ts',
  'nirs4all_datasets_wasm.js',
  'nirs4all_datasets_wasm_bg.wasm',
  'nirs4all_datasets_wasm_bg.wasm.d.ts',
  'package.json',
])

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(
  process.env.NIRS4ALL_DATASETS_ROOT ?? join(appRoot, '..', '..', 'nirs4all-datasets'),
)
const crateRoot = join(sourceRoot, 'bindings', 'wasm')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'datasets')
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

function normalizePackage(path) {
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  const generatedName = metadata.name
  metadata.name = PACKAGE_NAME
  writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`)
  return generatedName
}

if (!existsSync(crateRoot)) {
  throw new Error(`nirs4all-datasets WASM crate not found: ${crateRoot}`)
}
if (git('status', '--porcelain') !== '') {
  throw new Error(`nirs4all-datasets source must be clean: ${sourceRoot}`)
}
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(
    `unexpected nirs4all-datasets source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`,
  )
}

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-datasets-'))
const outputs = []
let generatedPackageName = ''
try {
  for (const leg of ['a', 'b']) {
    const output = join(proofRoot, `out-${leg}`)
    const target = join(proofRoot, `target-${leg}`)
    const args = [
      'build',
      crateRoot,
      '--target',
      'web',
      '--release',
      '--out-dir',
      output,
      '--scope',
      'nirs4all',
    ]
    if (wasmPackMode) args.push('--mode', wasmPackMode)
    args.push('--', '--locked')
    command(wasmPack, args, {
      env: {
        ...process.env,
        CARGO_TARGET_DIR: target,
        SOURCE_DATE_EPOCH: String(source.epoch),
      },
    })

    const actualFiles = readdirSync(output).filter((name) => name !== '.gitignore').sort()
    if (JSON.stringify(actualFiles) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected wasm-pack output: ${actualFiles.join(', ')}`)
    }
    const legGeneratedName = normalizePackage(join(output, 'package.json'))
    if (generatedPackageName && legGeneratedName !== generatedPackageName) {
      throw new Error(`wasm-pack generated inconsistent package names: ${generatedPackageName} / ${legGeneratedName}`)
    }
    generatedPackageName = legGeneratedName
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) {
    throw new Error('nirs4all-datasets WASM A/B builds are not byte-identical')
  }
  if (generatedPackageName !== GENERATED_PACKAGE_NAME) {
    throw new Error(`unexpected wasm-pack package name: ${generatedPackageName}`)
  }

  const builtPackage = JSON.parse(readFileSync(join(outputs[0], 'package.json'), 'utf8'))
  if (builtPackage.name !== PACKAGE_NAME || builtPackage.version !== EXPECTED_SOURCE.version) {
    throw new Error(`built package identity ${builtPackage.name}@${builtPackage.version} is not qualified`)
  }
  const module = await import(`${pathToFileURL(join(outputs[0], 'nirs4all_datasets_wasm.js')).href}?verify=${Date.now()}`)
  module.initSync({ module: readFileSync(join(outputs[0], 'nirs4all_datasets_wasm_bg.wasm')) })
  if (module.abiVersion() !== EXPECTED_SOURCE.version) {
    throw new Error(`WASM runtime version ${module.abiVersion()} != ${EXPECTED_SOURCE.version}`)
  }
  if (module.sha256(new Uint8Array([97, 98, 99])) !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
    throw new Error('WASM SHA-256 witness failed')
  }

  mkdirSync(destination, { recursive: true })
  const allowedDestinationFiles = new Set([...GENERATED_FILES, 'PROVENANCE.json'])
  const unexpectedDestinationFiles = readdirSync(destination).filter((name) => !allowedDestinationFiles.has(name))
  if (unexpectedDestinationFiles.length > 0) {
    throw new Error(`refusing to overwrite unexpected staged files: ${unexpectedDestinationFiles.join(', ')}`)
  }
  for (const name of GENERATED_FILES) {
    copyFileSync(join(outputs[0], name), join(destination, name))
  }

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'nirs4all-datasets-wasm',
    package: PACKAGE_NAME,
    version: EXPECTED_SOURCE.version,
    source: {
      repository: 'https://github.com/GBeurier/nirs4all-datasets',
      commit: source.commit,
      tree: source.tree,
      clean: true,
    },
    build: {
      target: 'web',
      profile: 'release',
      cargo_locked: true,
      source_date_epoch: source.epoch,
      tools: {
        wasm_pack: command(wasmPack, ['--version'], { capture: true }),
        cargo: command('cargo', ['--version'], { capture: true }),
        rustc: command('rustc', ['--version'], { capture: true }),
      },
      package_name_normalization: {
        from: generatedPackageName,
        to: PACKAGE_NAME,
      },
    },
    reproducibility: {
      independent_target_directories: 2,
      byte_identical: true,
    },
    witnesses: {
      runtime_version: true,
      sha256_abc: true,
    },
    files: GENERATED_FILES.map((name) => ({
      path: name,
      size: statSync(join(destination, name)).size,
      sha256: hashesA[name],
    })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged nirs4all-datasets WASM ${EXPECTED_SOURCE.version} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
