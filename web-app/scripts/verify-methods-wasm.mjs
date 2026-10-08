import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const EXPECTED = JSON.parse(readFileSync(join(scriptDir, 'methods-public-package.v1.json'), 'utf8'))
const EXPECTED_FILES = EXPECTED.staged_files
const root = resolve(scriptDir, '..', 'src', 'engine', 'wasm', 'methods')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
function inventory(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? inventory(path) : [relative(root, path).split(sep).join('/')]
  }).sort()
}

async function assertRuntimeWitness() {
  const module = await import(`${pathToFileURL(join(root, 'index.js')).href}?verify=${Date.now()}`)
  await module.loadModule()
  if (module.version() !== EXPECTED.runtimeVersion) throw new Error(`Methods runtime version ${module.version()} != ${EXPECTED.runtimeVersion}`)
  if (module.abiVersion().join('.') !== EXPECTED.abi) throw new Error(`Methods ABI ${module.abiVersion().join('.')} != ${EXPECTED.abi}`)
  const X = { data: Float64Array.from([0, 0, 1, 0, 0, 1, 1, 1]), rows: 4, cols: 2 }
  const Y = { data: Float64Array.from([0, 1, 2, 3]), rows: 4, cols: 1 }
  const prediction = module.predictPls(module.fitPls(X, Y, 1), X)
  const expected = [0, 1, 2, 3]
  const maxError = Math.max(...prediction.data.map((value, index) => Math.abs(value - expected[index])))
  if (prediction.rows !== 4 || prediction.cols !== 1 || !Number.isFinite(maxError) || maxError > 1e-10) {
    throw new Error(`Methods PLS fit/predict witness failed (max error ${maxError})`)
  }
  const estimator = new (module.methodClass('models.pls.pls_regression'))()
  estimator.params = { n_components: 1 }
  estimator.fit(X, Y)
  const restored = module.NativeEstimator.fromN4me(estimator.toN4me())
  const direct = estimator.predict(X).data
  const replayed = restored.predict(X).data
  estimator.dispose()
  restored.dispose()
  if (restored.methodId !== 'models.pls.pls_regression' || direct.some((value, index) => value !== replayed[index])) {
    throw new Error('Methods estimator-role N4ME round-trip witness failed')
  }
  // A state that embeds training rows (kernel PLS) exports only with the explicit opt-in.
  const kernel = new (module.methodClass('models.pls.kernel'))()
  kernel.params = { n_components: 1 }
  kernel.fit(X, Y)
  let refused = false
  try {
    kernel.toN4me()
  } catch {
    refused = true
  }
  const shared = module.NativeEstimator.fromN4me(kernel.toN4me({ allowTrainingRows: true }))
  const optIn = refused && kernel.containsTrainingRows() && shared.containsTrainingRows()
  kernel.dispose()
  shared.dispose()
  if (!optIn) throw new Error('Methods training-row export opt-in witness failed')
}

const receipt = JSON.parse(readFileSync(join(root, 'PROVENANCE.json'), 'utf8'))
if (receipt.schema !== 'nirs4all-web.wasm-public-acquisition.v1'
  || receipt.component !== EXPECTED.component || receipt.package !== EXPECTED.package
  || receipt.version !== EXPECTED.version || receipt.runtime_version !== EXPECTED.runtimeVersion
  || receipt.abi !== EXPECTED.abi || receipt.source?.commit !== EXPECTED.commit
  || receipt.source?.tree !== EXPECTED.tree || receipt.source?.npm_git_head !== EXPECTED.commit
  || receipt.acquisition?.registry_metadata_url !== EXPECTED.registry_metadata_url
  || receipt.acquisition?.tarball_url !== EXPECTED.tarball_url
  || receipt.acquisition?.tarball_sha256 !== EXPECTED.tarball_sha256
  || receipt.acquisition?.tarball_sha1 !== EXPECTED.tarball_sha1
  || receipt.acquisition?.tarball_sri !== EXPECTED.tarball_sri
  || receipt.acquisition?.tarball_bytes !== EXPECTED.tarball_size
  || !/^[0-9a-f]{64}$/.test(receipt.acquisition?.metadata_sha256 ?? '')
  || receipt.acquisition?.sha256_sha1_sri_verified !== true
  || receipt.reproducibility?.performed_by_web !== false
  || receipt.reproducibility?.independent_rebuild_claimed !== false
  || JSON.stringify(receipt.source_extra_files) !== JSON.stringify(EXPECTED.source_extra_files)) {
  throw new Error('Methods public acquisition provenance mismatch')
}
const names = Object.keys(EXPECTED_FILES).sort()
if (JSON.stringify(receipt.files?.map(({ path }) => path).sort()) !== JSON.stringify(names)
  || JSON.stringify(inventory(root).filter((name) => name !== 'PROVENANCE.json')) !== JSON.stringify(names)) {
  throw new Error('Methods staged inventory differs from the authenticated public projection')
}
for (const row of receipt.files) {
  const pin = EXPECTED_FILES[row.path]
  const path = join(root, row.path)
  if (row.size !== pin.size || row.sha256 !== pin.sha256
    || statSync(path).size !== pin.size || sha256(path) !== pin.sha256) {
    throw new Error(`Methods file differs from authenticated bytes: ${row.path}`)
  }
}
await assertRuntimeWitness()
console.log(`Methods ${EXPECTED.runtimeVersion} authenticated public bytes and existing runtime witnesses verified`)
