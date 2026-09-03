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
  commit: '48ad1e5a50844f68c2b99e93b02ad6a3b491c07b',
  tree: 'f2eaa3c46629c26d11913a25bff723f9a9cefbc9',
  version: '1.0.15',
  runtimeVersion: '1.0.15+abi.2.5.0',
  abi: '2.5.0',
  emscripten: '3.1.74',
})
const PACKAGE_NAME = '@nirs4all/methods'
const GENERATED_FILES = Object.freeze([
  'config.d.ts',
  'config.js',
  'context.d.ts',
  'context.js',
  'ffi.d.ts',
  'ffi.js',
  'index.d.ts',
  'index.js',
  'methodResult.d.ts',
  'methodResult.js',
  'model.d.ts',
  'model.js',
  'n4m.js',
  'n4m.wasm',
  'preprocessing.d.ts',
  'preprocessing.js',
  'serialization.d.ts',
  'serialization.js',
  'types.d.ts',
  'types.js',
].sort())
const LEGAL_FILES = Object.freeze([
  'LICENSE',
  'LICENSING.md',
  'LICENSING_FR.md',
  'NOTICE.md',
  'THIRD_PARTY_LICENSES.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/AGPL-3.0-or-later.txt',
  'LICENSES/Apache-2.0.txt',
  'LICENSES/BSD-3-Clause.txt',
  'LICENSES/COMMERCIAL-LICENSE.md',
  'LICENSES/COMMERCIAL-LICENSE_FR.md',
  'LICENSES/CeCILL-2.1.txt',
  'LICENSES/MIT.txt',
].sort())
const STAGED_FILES = Object.freeze([...GENERATED_FILES, ...LEGAL_FILES].sort())

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const sourceRoot = resolve(process.env.NIRS4ALL_METHODS_ROOT ?? join(appRoot, '..', '..', 'nirs4all-methods'))
const bindingRoot = join(sourceRoot, 'bindings', 'js')
const destination = join(appRoot, 'src', 'engine', 'wasm', 'methods')
const emsdk = process.env.EMSDK
const tsc = join(appRoot, 'node_modules', 'typescript', 'bin', 'tsc')

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

async function assertRuntimeWitness(output) {
  const module = await import(`${pathToFileURL(join(output, 'index.js')).href}?verify=${Date.now()}-${Math.random()}`)
  await module.loadModule()
  if (module.version() !== EXPECTED_SOURCE.runtimeVersion) {
    throw new Error(`Methods runtime version ${module.version()} != ${EXPECTED_SOURCE.runtimeVersion}`)
  }
  if (module.abiVersion().join('.') !== EXPECTED_SOURCE.abi) {
    throw new Error(`Methods ABI ${module.abiVersion().join('.')} != ${EXPECTED_SOURCE.abi}`)
  }
  const X = { data: Float64Array.from([0, 0, 1, 0, 0, 1, 1, 1]), rows: 4, cols: 2 }
  const Y = { data: Float64Array.from([0, 1, 2, 3]), rows: 4, cols: 1 }
  const fitted = module.fitPls(X, Y, 1)
  const prediction = module.predictPls(fitted, X)
  const expected = [0, 1, 2, 3]
  const maxError = Math.max(...prediction.data.map((value, index) => Math.abs(value - expected[index])))
  if (prediction.rows !== 4 || prediction.cols !== 1 || !Number.isFinite(maxError) || maxError > 1e-10) {
    throw new Error(`Methods PLS fit/predict witness failed (max error ${maxError})`)
  }
}

if (!existsSync(bindingRoot)) throw new Error(`nirs4all-methods JS binding not found: ${bindingRoot}`)
if (!existsSync(tsc)) throw new Error(`TypeScript compiler not installed: ${tsc}`)
if (!emsdk) throw new Error('EMSDK must point to the qualified Emscripten SDK')
const toolchain = join(emsdk, 'upstream', 'emscripten', 'cmake', 'Modules', 'Platform', 'Emscripten.cmake')
if (!existsSync(toolchain)) throw new Error(`Emscripten CMake toolchain not found: ${toolchain}`)
if (git('status', '--porcelain') !== '') throw new Error(`nirs4all-methods source must be clean: ${sourceRoot}`)
const source = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  epoch: Number(git('log', '-1', '--format=%ct', 'HEAD')),
}
if (source.commit !== EXPECTED_SOURCE.commit || source.tree !== EXPECTED_SOURCE.tree) {
  throw new Error(`unexpected nirs4all-methods source ${source.commit}/${source.tree}; expected ${EXPECTED_SOURCE.commit}/${EXPECTED_SOURCE.tree}`)
}
const packageMetadata = JSON.parse(readFileSync(join(bindingRoot, 'package.json'), 'utf8'))
if (packageMetadata.name !== PACKAGE_NAME || packageMetadata.version !== EXPECTED_SOURCE.version) {
  throw new Error(`unexpected Methods package ${packageMetadata.name}@${packageMetadata.version}`)
}
const emccVersion = command('emcc', ['--version'], { capture: true })
if (!emccVersion.split('\n')[0].includes(` ${EXPECTED_SOURCE.emscripten} `)) {
  throw new Error(`unexpected Emscripten toolchain: ${emccVersion.split('\n')[0]}`)
}

const proofRoot = mkdtempSync(join(tmpdir(), 'nirs4all-web-methods-'))
const outputs = []
try {
  for (const leg of ['a', 'b']) {
    const build = join(proofRoot, `build-${leg}`)
    const output = join(proofRoot, `out-${leg}`)
    mkdirSync(output, { recursive: true })
    const buildEnv = {
      ...process.env,
      SOURCE_DATE_EPOCH: String(source.epoch),
    }
    command('cmake', [
      '-S', sourceRoot,
      '-B', build,
      '-G', 'Ninja',
      `-DCMAKE_TOOLCHAIN_FILE=${toolchain}`,
      '-DCMAKE_BUILD_TYPE=Release',
      '-DN4M_BUILD_BINDINGS_JS=ON',
      '-DN4M_BUILD_SHARED=OFF',
      '-DN4M_BUILD_STATIC=ON',
      '-DN4M_BUILD_TESTS=OFF',
      '-DN4M_BUILD_CLI=OFF',
    ], { env: buildEnv })
    command('cmake', ['--build', build, '--target', 'n4m_wasm', '--parallel'], { env: buildEnv })
    command(process.execPath, [tsc, '-p', join(bindingRoot, 'tsconfig.json'), '--outDir', output], { env: buildEnv })
    copyFileSync(join(build, 'bindings', 'js', 'n4m.js'), join(output, 'n4m.js'))
    copyFileSync(join(build, 'bindings', 'js', 'n4m.wasm'), join(output, 'n4m.wasm'))
    const actual = inventory(output)
    if (JSON.stringify(actual) !== JSON.stringify(GENERATED_FILES)) {
      throw new Error(`unexpected Methods build output: ${actual.join(', ')}`)
    }
    await assertRuntimeWitness(output)
    outputs.push(output)
  }

  const hashesA = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[0], name))]))
  const hashesB = Object.fromEntries(GENERATED_FILES.map((name) => [name, sha256(join(outputs[1], name))]))
  if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) {
    throw new Error('nirs4all-methods WASM A/B builds are not byte-identical')
  }

  mkdirSync(destination, { recursive: true })
  const allowed = new Set([...STAGED_FILES, 'PROVENANCE.json'])
  const unexpected = inventory(destination).filter((name) => !allowed.has(name))
  if (unexpected.length > 0) throw new Error(`refusing to overwrite unexpected staged files: ${unexpected.join(', ')}`)
  for (const name of GENERATED_FILES) copyRelative(outputs[0], destination, name)
  for (const name of LEGAL_FILES) copyRelative(sourceRoot, destination, name)

  const provenance = {
    schema: 'nirs4all-web.wasm-provenance.v1',
    component: 'nirs4all-methods-wasm',
    package: PACKAGE_NAME,
    version: EXPECTED_SOURCE.version,
    runtime_version: EXPECTED_SOURCE.runtimeVersion,
    abi: EXPECTED_SOURCE.abi,
    source: {
      repository: 'https://github.com/GBeurier/nirs4all-methods',
      commit: source.commit,
      tree: source.tree,
      clean: true,
    },
    build: {
      target: 'web',
      profile: 'release',
      source_date_epoch: source.epoch,
      emscripten: EXPECTED_SOURCE.emscripten,
      cmake: command('cmake', ['--version'], { capture: true }).split('\n')[0],
      ninja: command('ninja', ['--version'], { capture: true }),
      typescript: command(process.execPath, [tsc, '--version'], { capture: true }),
    },
    reproducibility: { independent_build_directories: 2, byte_identical: true },
    witnesses: { runtime_version: true, abi_version: true, pls_fit_predict: true },
    legal_payload: { included: true, files: LEGAL_FILES },
    files: STAGED_FILES.map((name) => ({
      path: name,
      size: statSync(join(destination, name)).size,
      sha256: sha256(join(destination, name)),
    })),
  }
  writeFileSync(join(destination, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  console.log(`staged nirs4all-methods WASM ${EXPECTED_SOURCE.runtimeVersion} from ${source.commit}`)
} finally {
  rmSync(proofRoot, { recursive: true, force: true })
}
