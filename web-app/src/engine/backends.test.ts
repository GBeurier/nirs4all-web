import { describe, expect, it } from 'vitest'
import { defaultParams } from '@/catalog/nodes'
import { loadSampleDataset } from '@/data/samples'
import { loadLibn4mBackend } from './backends'
import { trainAndPredict } from './orchestrate'
import { RtErrorException } from './rt'

describe('catalog model defaults against staged WASM', () => {
  it.each(['corn', 'beer'] as const)('fits the previously failing regression models on %s', async (sample) => {
    const ds = await loadSampleDataset(sample)
    const backend = await loadLibn4mBackend()
    const train = ds.partitions.flatMap((part, i) => part === 'train' ? [i] : [])
    const test = ds.partitions.flatMap((part, i) => part === 'test' ? [i] : [])
    for (const type of ['PLSCanonical', 'PLSSVD', 'n4m:models.regularized.ridge_pls']) {
      // Older saved Canonical/SVD pipelines requested ten components for one
      // target. They must still fit through the target-aware component bound.
      const params = type === 'n4m:models.regularized.ridge_pls' ? defaultParams(type) : { n_components: 10 }
      const result = trainAndPredict(ds, {
        name: type, steps: [], model: { id: 'model', type, params },
      }, backend, train, test)
      expect(result.pred.rows).toBe(test.length)
      expect(result.pred.cols).toBe(1)
      expect(Array.from(result.pred.data).every(Number.isFinite)).toBe(true)
      expect(new Set(result.pred.data).size).toBeGreaterThan(1)
    }
  })

  it('explains a numerical failure without silently changing the requested Ridge PLS fit', async () => {
    const ds = await loadSampleDataset('corn')
    const backend = await loadLibn4mBackend()
    const train = ds.partitions.flatMap((part, i) => part === 'train' ? [i] : [])
    try {
      trainAndPredict(ds, {
        name: 'too many components', steps: [],
        model: { id: 'model', type: 'n4m:models.regularized.ridge_pls', params: { n_components: 10, ridge_lambda: 1 } },
      }, backend, train, [0])
      expect.fail('expected the native numerical refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(RtErrorException)
      const diagnostic = (error as RtErrorException).rtError
      expect(diagnostic.message).toContain('Ridge PLS')
      expect(diagnostic.message).toContain('10 components')
      expect(diagnostic.mitigation).toContain('fewer components')
    }
  })

  it('fits ECR after the classification preset’s SNV and second derivative', async () => {
    const ds = await loadSampleDataset('meat')
    const backend = await loadLibn4mBackend()
    const train = ds.partitions.flatMap((part, i) => part === 'train' ? [i] : [])
    const test = ds.partitions.flatMap((part, i) => part === 'test' ? [i] : [])
    const result = trainAndPredict(ds, {
      name: 'ECR classification',
      steps: [
        { id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {} },
        { id: 'sg', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 17, polyorder: 2, deriv: 2 } },
      ],
      model: { id: 'model', type: 'n4m:models.specialized.ecr', params: defaultParams('n4m:models.specialized.ecr') },
    }, backend, train, test)
    expect(result.pred.rows).toBe(test.length)
    expect(result.pred.cols).toBe(3)
    expect(Array.from(result.pred.data).every(Number.isFinite)).toBe(true)
  })
})
