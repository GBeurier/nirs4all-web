import { describe, expect, it } from 'vitest'
import type { FittedPipeline, MaterializedDataset } from '@/engine/types'
import { validateExplainRequest } from '@/engine/explain'
import { estimateEvaluations, rowSourceOptions } from './explainView'

describe('estimateEvaluations', () => {
  it('matches the native session plan (exact SHAP, 5 rows, 3 groups, 24 background rows = 749)', () => {
    expect(estimateEvaluations({ method: 'exact_shap', baseline: 'background', nRows: 5, nBackground: 24, nGroups: 3, nPermutations: 10 })).toBe(749)
  })

  it('counts antithetic permutation chains and the interpolate baseline', () => {
    // 10 x (1 + 20 x 2 x 10 x 34) + 20 shared empty-coalition rows
    expect(estimateEvaluations({ method: 'permutation_shap', baseline: 'background', nRows: 10, nBackground: 20, nGroups: 35, nPermutations: 10 })).toBe(136_030)
    // interpolate: no background, one extra (empty) coalition per row
    expect(estimateEvaluations({ method: 'permutation_shap', baseline: 'interpolate', nRows: 10, nBackground: 20, nGroups: 35, nPermutations: 10 })).toBe(10 * (1 + 681))
    expect(estimateEvaluations({ method: 'occlusion', baseline: 'mean', nRows: 4, nBackground: 50, nGroups: 700, nPermutations: 10 })).toBe(1 + 4 * 701)
  })
})

describe('row sources', () => {
  const model = { nFeatures: 2 } as FittedPipeline
  const dataset = {
    nSamples: 5, nFeatures: 2, X: Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    partitions: ['train', 'test', 'train', 'test', 'train'],
  } as unknown as MaterializedDataset

  it('offers test + train together, keeping dataset row indices as source indices', () => {
    const all = rowSourceOptions(model, null, dataset).find((o) => o.source === 'dataset_rows')
    expect(all?.label).toBe('Dataset test + train partitions (5)')
    expect(all?.rows.sourceIndices).toEqual([1, 3, 0, 2, 4])
    expect(Array.from(all!.rows.X.subarray(0, 4))).toEqual([2, 3, 6, 7])
  })

  it('accepts per-wavelength grouping for wide spectra', () => {
    const p = 700
    const rows = { X: new Float64Array(p), nRows: 1, sourceIndices: [0], source: 'predicted_rows' as const }
    const req = { model: { nFeatures: p, taskType: 'regression' } as FittedPipeline, nFeatures: p, rows, background: rows, grouping: { kind: 'per_feature' as const } }
    expect(validateExplainRequest(req).grouping).toEqual({ kind: 'per_feature' })
  })
})
