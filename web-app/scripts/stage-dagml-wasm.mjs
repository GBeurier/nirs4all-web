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
  commit: 'bad5aff0bfbc14c622f5ade7f393f29399df6e07',
  tree: '529ecc687d6b9307f41ee34feafcf5d8135ba9ae',
  version: '0.3.23',
})
const GENERATED_FILES = Object.freeze([
  'LICENSE',
  'README.md',
  'dag_ml_wasm.d.ts',
  'dag_ml_wasm.js',
  'dag_ml_wasm_bg.wasm',
  'dag_ml_wasm_bg.wasm.d.ts',
  'package.json',
])

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(process.env.NIRS4ALL_DAG_ML_ROOT ?? join(appRoot, '..', '..', 'dag-ml'))
const crateRoot = join(sourceRoot, 'crates', 'dag-ml-wasm')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'dagml')
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

if (!existsSync(crateRoot)) throw new Error(`dag-ml WASM crate not found: ${crateRoot}`)
if (git('status', '--porcelain') !== '') throw new Error(`dag-ml source must be clean: ${sourceRoot}`)
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(`unexpected dag-ml source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`)
}

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-dagml-'))
const outputs = []
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
      },
    })
    const actualFiles = readdirSync(output).filter((name) => name !== '.gitignore').sort()
    if (JSON.stringify(actualFiles) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected wasm-pack output: ${actualFiles.join(', ')}`)
    }
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) throw new Error('dag-ml WASM A/B builds are not byte-identical')

  const metadata = JSON.parse(readFileSync(join(outputs[0], 'package.json'), 'utf8'))
  if (metadata.name !== 'dag-ml-wasm' || metadata.version !== EXPECTED_SOURCE.version) {
    throw new Error(`built package identity ${metadata.name}@${metadata.version} is not qualified`)
  }
  const module = await import(`${pathToFileURL(join(outputs[0], 'dag_ml_wasm.js')).href}?verify=${Date.now()}`)
  module.initSync({ module: readFileSync(join(outputs[0], 'dag_ml_wasm_bg.wasm')) })
  const manifest = JSON.parse(module.contract_manifest_json())
  if (
    module.dag_ml_version() !== EXPECTED_SOURCE.version ||
    manifest.crate !== 'dag-ml' ||
    !manifest.capabilities.includes('execute_execution_plan_phase') ||
    !manifest.capabilities.includes('loss_execution_attestation')
  ) {
    throw new Error('dag-ml WASM runtime witness failed')
  }

  mkdirSync(destination, { recursive: true })
  const allowed = new Set([...GENERATED_FILES, 'PROVENANCE.json'])
  const unexpected = readdirSync(destination).filter((name) => !allowed.has(name))
  if (unexpected.length > 0) throw new Error(`refusing to overwrite unexpected staged files: ${unexpected.join(', ')}`)
  for (const name of GENERATED_FILES) copyFileSync(join(outputs[0], name), join(destination, name))

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'dag-ml-wasm',
    package: 'dag-ml-wasm',
    version: EXPECTED_SOURCE.version,
    source: {
      repository: 'https://github.com/GBeurier/dag-ml',
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
    },
    reproducibility: { independent_target_directories: 2, byte_identical: true },
    witnesses: { runtime_version: true, contract_manifest: true },
    files: GENERATED_FILES.map((name) => ({
      path: name,
      size: statSync(join(destination, name)).size,
      sha256: hashesA[name],
    })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged dag-ml WASM ${EXPECTED_SOURCE.version} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
