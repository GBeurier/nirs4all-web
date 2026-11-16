import { describe, expect, it } from 'vitest'
import { loadLibn4mBackend } from './backends'
import { MainEngine } from './main-engine'
import { isRtErrorException } from './rt'
import type { FittedPipeline } from './types'

const X1 = new Float64Array([1, 2])

async function refusalOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    expect(isRtErrorException(e)).toBe(true)
    return (e as { rtError: { verb: string; cause: string; unsupported_capability?: string } }).rtError
  }
  throw new Error('expected a refusal')
}

describe('MainEngine.predictMatrix dispatch for Explain', () => {
  it('refuses historical portable Core coefficient states', async () => {
    const model = { dsl: { name: 'm', steps: [] }, taskType: 'regression', nFeatures: 2, state: { backendId: 'nirs4all-core-wasm' } } as unknown as FittedPipeline
    expect(await refusalOf(new MainEngine({ mainThread: true }).predictMatrix(model, X1, 1, 2)))
      .toMatchObject({ verb: 'explain', unsupported_capability: 'legacy_portable_core_coefficients' })
  })

  it('refuses retired JavaScript-backend models', async () => {
    const model = { dsl: { name: 'm', steps: [] }, taskType: 'regression', nFeatures: 2, state: { backendId: 'js-stub', chain: [] } } as unknown as FittedPipeline
    expect(await refusalOf(new MainEngine({ mainThread: true }).predictMatrix(model, X1, 1, 2)))
      .toMatchObject({ verb: 'explain', unsupported_capability: 'javascript_model_backend' })
  })

  it('refuses classifiers before loading the explainer', async () => {
    const model = { dsl: { name: 'm', steps: [] }, taskType: 'binary', nFeatures: 2, classes: ['a', 'b'], state: { backendId: 'libn4m-wasm', chain: [] } } as unknown as FittedPipeline
    const rows = { X: X1, nRows: 1, sourceIndices: [0], source: 'predicted_rows' as const }
    expect(await refusalOf(new MainEngine({ mainThread: true }).explain({ model, nFeatures: 2, rows, background: rows })))
      .toMatchObject({ verb: 'explain', cause: 'unsupported_capability', unsupported_capability: 'class_probability_output' })
  })
})

describe('MainEngine.explain against the staged Methods WASM', () => {
  // y = 1 + 2 x0 - x1 + 0.5 x2 on full-rank X: a 3-component PLS on 3 features is the exact
  // OLS fit, so interventional Shapley values are b_j (x_j - mean_background(x_j)). The
  // effective coefficients b_j are probed from the fitted model itself, so the check holds for
  // the function actually explained.
  it('explains a linear libn4m FittedState model exactly and additively', async () => {
    const n = 24
    const p = 3
    const coef = [2, -1, 0.5]
    // Distinct frequencies per column keep the centred design full rank (phase-shifted copies of
    // one sinusoid would span only two dimensions).
    const X = Float64Array.from({ length: n * p }, (_, k) => Math.sin((0.37 + 0.61 * (k % p)) * Math.floor(k / p) + k % p) * 3 + (k % p))
    const Y = Float64Array.from({ length: n }, (_, i) => 1 + coef.reduce((s, b, j) => s + b * X[i * p + j], 0))
    const backend = await loadLibn4mBackend()
    const type = 'n4m:models.pls.pls_regression'
    const fitted = backend.fit({ type, params: { n_components: p } }, { data: X, rows: n, cols: p }, { data: Y, rows: n, cols: 1 }, p)
    const model: FittedPipeline = {
      dsl: { name: 'linear', steps: [], model: { id: 'model', type, params: { n_components: p } } },
      taskType: 'regression',
      nFeatures: p,
      state: { chain: [], model: fitted, backendId: 'libn4m-wasm' },
    }
    const all = { X, nRows: n, sourceIndices: Array.from({ length: n }, (_, i) => i), source: 'dataset_train_partition' as const }
    const res = await new MainEngine({ mainThread: true }).explain({
      model, nFeatures: p, rows: all, background: all, method: 'exact_shap', grouping: { kind: 'per_feature' }, maxRows: 5, maxBackground: n, seed: 3,
    })
    const env = res.envelope
    expect(env.engine.name).toBe('nirs4all-methods')
    expect(env.additive).toBe(true)
    expect(env.rows.count).toBe(5)
    const engine = new MainEngine({ mainThread: true })
    const probe = (await engine.predictMatrix(model, Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), 4, p)).data
    const effective = coef.map((_, j) => probe[j + 1] - probe[0])
    effective.forEach((b, j) => expect(b).toBeCloseTo(coef[j], 6))
    const mean = coef.map((_, j) => Array.from({ length: n }, (_, i) => X[i * p + j]).reduce((s, v) => s + v, 0) / n)
    env.rows.sample_indices.forEach((src, r) => {
      effective.forEach((b, j) => expect(env.attributions[r][j][0]).toBeCloseTo(b * (X[src * p + j] - mean[j]), 6))
      const total = env.attributions[r].reduce((s, g) => s + g[0], 0)
      expect(env.expected_value[r][0] + total).toBeCloseTo(env.prediction[r][0], 8)
      expect(env.prediction[r][0]).toBeCloseTo(Y[src], 6)
    })
  })
})
