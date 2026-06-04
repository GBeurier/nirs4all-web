import { describe, expect, it } from 'vitest'
import { mulberry32 } from './algo/linalg'
import { StubEngine } from './stub-engine'
import type { MaterializedDataset, PipelineDSL } from './types'

function synthRegression(n: number, p: number, seed = 7): MaterializedDataset {
  const rng = mulberry32(seed)
  const beta = Array.from({ length: p }, (_, j) => (j % 7 === 0 ? 1.5 : j % 5 === 0 ? -0.8 : 0))
  const X = new Float64Array(n * p)
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let yi = 3
    for (let j = 0; j < p; j++) {
      const v = rng() * 2 - 1 + Math.sin((i + j) * 0.05)
      X[i * p + j] = v
      yi += v * beta[j]
    }
    y[i] = yi + (rng() - 0.5) * 0.3
  }
  const partitions = Array.from({ length: n }, (_, i) => (i < Math.floor(n * 0.75) ? 'train' : 'test')) as MaterializedDataset['partitions']
  return {
    X,
    nSamples: n,
    nFeatures: p,
    axis: Array.from({ length: p }, (_, j) => 1000 + j * 5),
    axisUnit: 'nm',
    y,
    targetName: 'synthetic',
    taskType: 'regression',
    sampleIds: Array.from({ length: n }, (_, i) => `s${i}`),
    partitions,
  }
}

function synthClassification(n: number, p: number, k = 3, seed = 11): MaterializedDataset {
  const rng = mulberry32(seed)
  const X = new Float64Array(n * p)
  const y = new Float64Array(n)
  const classes: string[] = []
  for (let i = 0; i < n; i++) {
    const cls = i % k
    for (let j = 0; j < p; j++) X[i * p + j] = (rng() - 0.5) + (j % k === cls ? 1.2 : 0) + Math.sin(j * 0.1)
    y[i] = cls
    classes.push(`C${cls}`)
  }
  const partitions = Array.from({ length: n }, (_, i) => (i < Math.floor(n * 0.75) ? 'train' : 'test')) as MaterializedDataset['partitions']
  return {
    X,
    nSamples: n,
    nFeatures: p,
    axis: Array.from({ length: p }, (_, j) => j),
    axisUnit: 'index',
    y,
    targetName: 'grade',
    taskType: 'multiclass',
    classes,
    sampleIds: Array.from({ length: n }, (_, i) => `s${i}`),
    partitions,
  }
}

describe('StubEngine', () => {
  it('learns a regression signal (SNV + PLS) with sane CV/refit', async () => {
    const ds = synthRegression(140, 60)
    const dsl: PipelineDSL = {
      name: 'SNV+PLS',
      steps: [{ id: '1', type: 'StandardNormalVariate', params: {} }],
      model: { id: 'm', type: 'PLS', params: { n_components: 8 } },
      cv: { folds: 5, seed: 42 },
    }
    const eng = new StubEngine()
    const res = await eng.run(ds, dsl)
    expect(res.folds.length).toBe(5)
    // OOF covers every train sample exactly once
    const trainN = ds.partitions.filter((p) => p === 'train').length
    expect(res.cv.predictions.length).toBe(trainN)
    expect(new Set(res.cv.predictions.map((r) => r.sampleId)).size).toBe(trainN)
    expect(Number.isFinite(res.cv.metrics.rmse!)).toBe(true)
    expect(res.refit.metrics.r2!).toBeGreaterThan(0.6)

    // predict() on new spectra returns one value per sample
    const out = await eng.predict(res.model, ds.X.slice(0, 5 * ds.nFeatures), 5, ds.nFeatures)
    expect(out.values.length).toBe(5)
    expect(Number.isFinite(out.values[0])).toBe(true)
  })

  it('classifies a separable multiclass signal (SNV + PLS-DA)', async () => {
    const ds = synthClassification(150, 45, 3)
    const dsl: PipelineDSL = {
      name: 'SNV+PLSDA',
      steps: [{ id: '1', type: 'StandardNormalVariate', params: {} }],
      model: { id: 'm', type: 'PLSDA', params: { n_components: 10 } },
      cv: { folds: 5, seed: 1 },
    }
    const res = await new StubEngine().run(ds, dsl)
    expect(res.refit.confusion?.labels.length).toBe(3)
    expect(res.refit.metrics.accuracy!).toBeGreaterThan(0.7)
  })

  it('refuses to train regression with no numeric targets', async () => {
    const ds = synthRegression(40, 20)
    ds.y = new Float64Array(ds.nSamples).fill(NaN)
    const dsl: PipelineDSL = {
      name: 'x',
      steps: [],
      model: { id: 'm', type: 'PLS', params: { n_components: 3 } },
      cv: { folds: 3, seed: 0 },
    }
    await expect(new StubEngine().run(ds, dsl)).rejects.toThrow(/no numeric targets/i)
  })

  it('honors cancellation', async () => {
    const ds = synthRegression(60, 30)
    const ctrl = new AbortController()
    ctrl.abort()
    const dsl: PipelineDSL = {
      name: 'x',
      steps: [],
      model: { id: 'm', type: 'PLS', params: { n_components: 3 } },
      cv: { folds: 3, seed: 0 },
    }
    await expect(new StubEngine().run(ds, dsl, { signal: ctrl.signal })).rejects.toThrow()
  })
})
