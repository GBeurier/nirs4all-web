// AOM fits through the real staged libn4m WASM keep the internal selection
// (named chain, ranked candidates) on the fitted native model state.
import { describe, expect, it } from 'vitest'
import type { Mat } from './algo/linalg'
import { loadLibn4mBackend } from './backends'
import type { NativeModelState } from './methods/n4m'

function spectra(rows: number, cols: number): { X: Mat; Y: Mat } {
  const X: Mat = { data: new Float64Array(rows * cols), rows, cols }
  const Y: Mat = { data: new Float64Array(rows), rows, cols: 1 }
  for (let i = 0; i < rows; i++) {
    const a = Math.sin(0.37 * i + 0.11), b = Math.cos(0.23 * ((i * i) % 17))
    for (let j = 0; j < cols; j++) {
      const t = j / cols
      X.data[i * cols + j] = 1 + 0.2 * i / rows + a * Math.exp(-8 * (t - 0.3) ** 2) + b * Math.exp(-10 * (t - 0.7) ** 2) + 0.02 * Math.sin(1.7 * i + j)
    }
    Y.data[i] = 2 * a - b + 0.05 * Math.sin(3.1 * i)
  }
  return { X, Y }
}

describe('AOM selection on native model states', () => {
  const { X, Y } = spectra(40, 60)

  it('names the calibration chain and ranks the screened chains', async () => {
    const backend = await loadLibn4mBackend()
    const full = backend.fit({ type: 'n4m:aom_pop.calibration', params: { max_components: 4, fast: false } }, X, Y, 4) as NativeModelState
    expect(full.aomSelection?.criterion).toBe('cv_rmse')
    expect(full.aomSelection?.candidates).toBe(30)
    expect(full.aomSelection?.ranking[0].label).toBe(full.aomSelection?.selected)
    expect(full.aomSelection?.selected).toMatch(/^(raw|SNV|MSC) › /)
    const fast = backend.fit({ type: 'n4m:aom_pop.calibration', params: { max_components: 4, fast: true } }, X, Y, 4) as NativeModelState
    expect(fast.aomSelection?.criterion).toBe('screening')
    expect(fast.aomSelection?.ranking[0].label).toBe(fast.aomSelection?.selected)
  })

  it('names the AOM-PLS operator and leaves other models without a selection', async () => {
    const backend = await loadLibn4mBackend()
    const aom = backend.fit({ type: 'n4m:aom_pop.aom_pls', params: {} }, X, Y, 3) as NativeModelState
    expect(aom.aomSelection?.candidates).toBe(9)
    expect(aom.aomSelection?.ranking[0].label).toBe(aom.aomSelection?.selected)
    const pls = backend.fit({ type: 'n4m:models.pls.pls_regression', params: { n_components: 3 } }, X, Y, 3) as NativeModelState
    expect(pls.aomSelection).toBeUndefined()
  })
})
