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
  commit: '1f60b920d34acda7c0fbc044b593bb6af1fab4c1',
  tree: 'f2144d861642e81758dcef4f6ee76ec32c0961ff',
  version: '0.2.10',
})
const GENERATED_FILES = Object.freeze([
  'LICENSE',
  'README.md',
  'dag_ml_data_wasm.d.ts',
  'dag_ml_data_wasm.js',
  'dag_ml_data_wasm_bg.wasm',
  'dag_ml_data_wasm_bg.wasm.d.ts',
  'package.json',
])
const LICENSE_FILES = Object.freeze([
  'LICENSING.md',
  'LICENSING_FR.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
])
const STAGED_FILES = Object.freeze([...GENERATED_FILES, ...LICENSE_FILES].sort())

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(
  process.env.NIRS4ALL_DAG_ML_DATA_ROOT ?? join(appRoot, '..', '..', 'dag-ml-data'),
)
const crateRoot = join(sourceRoot, 'crates', 'dag-ml-data-wasm')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'dagml-data')
const wasmPack = process.env.WASM_PACK_BIN ?? 'wasm-pack'

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

function filesRecursively(root, current = root) {
  if (!existsSync(current)) return []
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? filesRecursively(root, path) : [relative(root, path).split(sep).join('/')]
    })
    .sort()
}

if (!existsSync(crateRoot)) {
  throw new Error(`dag-ml-data WASM crate not found: ${crateRoot}`)
}
if (git('status', '--porcelain') !== '') {
  throw new Error(`dag-ml-data source must be clean: ${sourceRoot}`)
}
for (const name of LICENSE_FILES) {
  if (!existsSync(join(sourceRoot, name))) throw new Error(`dag-ml-data license payload is incomplete: ${name}`)
}
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(
    `unexpected dag-ml-data source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`,
  )
}

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-dagml-data-'))
const outputs = []
try {
  for (const leg of ['a', 'b']) {
    const output = join(proofRoot, `out-${leg}`)
    const target = join(proofRoot, `target-${leg}`)
    command(
      wasmPack,
      [
        'build',
        crateRoot,
        '--target',
        'web',
        '--release',
        '--out-dir',
        output,
        '--',
        '--locked',
        '--features',
        'provider',
      ],
      {
        env: {
          ...process.env,
          CARGO_TARGET_DIR: target,
          SOURCE_DATE_EPOCH: String(source.epoch),
        },
      },
    )
    // wasm-pack also emits an output-local `.gitignore`; it is build tooling,
    // not part of the staged runtime and would hide newly generated evidence.
    const actualFiles = readdirSync(output).filter((name) => name !== '.gitignore').sort()
    if (JSON.stringify(actualFiles) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected wasm-pack output: ${actualFiles.join(', ')}`)
    }
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) {
    throw new Error('dag-ml-data WASM A/B builds are not byte-identical')
  }

  const builtPackage = JSON.parse(readFileSync(join(outputs[0], 'package.json'), 'utf8'))
  if (
    builtPackage.version !== EXPECTED_SOURCE.version ||
    builtPackage.license !== 'CECILL-2.1 OR AGPL-3.0-or-later'
  ) {
    throw new Error(`built package version ${builtPackage.version} != ${EXPECTED_SOURCE.version}`)
  }
  const module = await import(`${pathToFileURL(join(outputs[0], 'dag_ml_data_wasm.js')).href}?verify=${Date.now()}`)
  await module.default({ module_or_path: readFileSync(join(outputs[0], 'dag_ml_data_wasm_bg.wasm')) })
  if (module.dag_ml_data_version() !== EXPECTED_SOURCE.version) {
    throw new Error(`WASM runtime version ${module.dag_ml_data_version()} != ${EXPECTED_SOURCE.version}`)
  }
  if (typeof module.WasmInMemoryProvider !== 'function') {
    throw new Error('provider feature is missing WasmInMemoryProvider')
  }

  mkdirSync(destination, { recursive: true })
  const allowedDestinationFiles = new Set([...STAGED_FILES, 'PROVENANCE.json'])
  const unexpectedDestinationFiles = filesRecursively(destination).filter((name) => !allowedDestinationFiles.has(name))
  if (unexpectedDestinationFiles.length > 0) {
    throw new Error(`refusing to overwrite unexpected staged files: ${unexpectedDestinationFiles.join(', ')}`)
  }
  for (const name of GENERATED_FILES) {
    copyFileSync(join(outputs[0], name), join(destination, name))
  }
  for (const name of LICENSE_FILES) {
    const target = join(destination, name)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(sourceRoot, name), target)
  }

  const stagedHashes = Object.fromEntries(STAGED_FILES.map((name) => [name, sha256(join(destination, name))]))

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'dag-ml-data-wasm',
    version: EXPECTED_SOURCE.version,
    source: {
      repository: 'https://github.com/GBeurier/dag-ml-data',
      commit: source.commit,
      tree: source.tree,
      clean: true,
    },
    build: {
      target: 'web',
      profile: 'release',
      cargo_locked: true,
      features: ['provider'],
      source_date_epoch: source.epoch,
      tools: {
        wasm_pack: command(wasmPack, ['--version'], { capture: true }),
        cargo: command('cargo', ['--version'], { capture: true }),
        rustc: command('rustc', ['--version'], { capture: true }),
      },
    },
    reproducibility: {
      independent_target_directories: 2,
      byte_identical: true,
    },
    licensing: {
      expression: builtPackage.license,
      payload_source: 'qualified source tree',
      files: ['LICENSE', ...LICENSE_FILES],
    },
    files: STAGED_FILES.map((name) => ({
      path: name,
      size: statSync(join(destination, name)).size,
      sha256: stagedHashes[name],
    })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged dag-ml-data WASM ${EXPECTED_SOURCE.version} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
