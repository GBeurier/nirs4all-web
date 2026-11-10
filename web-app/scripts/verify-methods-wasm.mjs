import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { verifyPackage } from './public-package.mjs'
const { pin, root } = verifyPackage('methods')
const EXPECTED = { ...pin, runtimeVersion: `${pin.version}+abi.${pin.abi}`, abi: pin.abi }
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

await assertRuntimeWitness()
