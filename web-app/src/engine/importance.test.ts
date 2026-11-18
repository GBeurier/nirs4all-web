import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FittedPipeline, ImportanceRequest } from './types'

// Native pieces are faked: this adapter only routes rows/arrays and wraps envelopes.
const fake = vi.hoisted(() => ({
  stepsInfo: [{ affine: true, columnAligned: true }, { affine: true, columnAligned: true }] as { affine: boolean; columnAligned: boolean }[],
  modelCols: 4,
  rawAffine: true as boolean,
  latent: true as boolean,
  disposed: [] as string[],
}))

vi.mock('./methods/n4m', () => ({
  isNativeModelState: (m: unknown) => typeof m === 'object' && m !== null && (m as { n4me?: unknown }).n4me instanceof Uint8Array,
  rebuildRolePipeline: () => ({
    stepsInfo: () => fake.stepsInfo,
    transform: (X: { rows: number }) => ({ data: new Float64Array(X.rows * fake.modelCols).fill(1), rows: X.rows, cols: fake.modelCols }),
    inputAffineCoefficients: () => {
      if (!fake.rawAffine) throw new Error('step 0 (snv) is not affine')
      return { coefficients: { data: Float64Array.from([1, 2, 3, 4]), rows: 4, cols: 1 }, intercept: Float64Array.from([0.5]), nFeaturesIn: 4 }
    },
    dispose: () => fake.disposed.push('pipeline'),
  }),
  loadEstimator: () => ({
    affineCoefficients: () => ({ coefficients: { data: Float64Array.from([10, 20, 30, 40].slice(0, fake.modelCols)), rows: fake.modelCols, cols: 1 }, intercept: Float64Array.from([1]) }),
    latentStructure: () => {
      if (!fake.latent) throw new Error('no latent structure')
      return {
        nComponents: 2,
        xWeights: { data: Float64Array.from({ length: fake.modelCols * 2 }, (_, i) => i), rows: fake.modelCols, cols: 2 },
        xLoadings: { data: Float64Array.from({ length: fake.modelCols * 2 }, (_, i) => -i), rows: fake.modelCols, cols: 2 },
      }
    },
    dispose: () => fake.disposed.push('estimator'),
  }),
}))

const { compareImportanceProfiles, computeImportance, nativePipelineParts } = await import('./importance')

const binding = {
  version: () => '1.3.18+abi.2.24.0',
  modelImportance: vi.fn((_est: unknown, X: { cols: number }, opts: { kind: string }) => Float64Array.from({ length: X.cols }, (_, j) => (opts.kind === 'vip' ? 1 + j : j))),
  aggregateProfile: vi.fn((values: Float64Array, g: { nGroups: number }) => Float64Array.from({ length: g.nGroups }, (_, i) => values[i] ?? 0)),
  compareProfiles: vi.fn((m: { rows: number }) => ({
    spearman: { data: Float64Array.from({ length: m.rows * m.rows }, (_, i) => (i % (m.rows + 1) === 0 ? 1 : Number.NaN)), rows: m.rows, cols: m.rows },
    topKJaccard: { data: new Float64Array(m.rows * m.rows).fill(0.5), rows: m.rows, cols: m.rows },
  })),
  groupsFixedWidth: (n: number, w: number) => ({ featureGroup: Int32Array.from({ length: n }, (_, j) => Math.floor(j / w)), nGroups: Math.ceil(n / w) }),
  groupsFromRanges: () => {
    throw new Error('unused')
  },
  perturbRows: vi.fn(),
}

function model(over: Record<string, unknown> = {}): FittedPipeline {
  return {
    dsl: { name: 'p', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} } },
    taskType: 'regression',
    nFeatures: 4,
    state: {
      backendId: 'libn4m-wasm',
      chain: [
        { type: 'n4m:preprocessing.derivatives.savitzky_golay', params: {}, state: new Uint8Array([1]), containsTrainingRows: false },
        { type: 'n4m:augmentation.noise', params: {}, state: null, containsTrainingRows: false },
        { type: 'n4m:preprocessing.detrend', params: {}, state: new Uint8Array([2]), containsTrainingRows: false },
      ],
      model: { n4me: new Uint8Array([3]), containsTrainingRows: false, fitParams: { n_components: 2 } },
      ...over,
    },
  } as unknown as FittedPipeline
}

function request(m = model()): ImportanceRequest {
  return {
    model: m,
    nFeatures: 4,
    statRows: { X: new Float64Array(12), nRows: 3, sourceIndices: [0, 1, 2], source: 'dataset_train_partition' },
    outputLabel: 'protein',
    axis: { values: [1100, 1102, 1104, 1106], unit: 'nm' },
  }
}

beforeEach(() => {
  fake.stepsInfo = [{ affine: true, columnAligned: true }, { affine: true, columnAligned: true }]
  fake.modelCols = 4
  fake.rawAffine = true
  fake.latent = true
  fake.disposed = []
})

describe('nativePipelineParts', () => {
  it('keeps replayed native steps and skips train-only row operators', () => {
    const parts = nativePipelineParts(model())
    expect(parts.ok && parts.steps.map((s) => s.type)).toEqual(['n4m:preprocessing.derivatives.savitzky_golay', 'n4m:preprocessing.detrend'])
  })
  it('refuses JavaScript backends and feature unions in the user\'s terms', () => {
    const js = nativePipelineParts(model({ backendId: 'mljs-classic' }))
    expect(!js.ok && js.reason).toMatch(/native libn4m backend/)
    const union = nativePipelineParts(model({ branch: [[], []] }))
    expect(!union.ok && union.reason).toMatch(/feature-union/)
  })
})

describe('computeImportance', () => {
  it('reports both spaces of an affine, column-aligned pipeline on the raw axis', () => {
    const r = computeImportance(request(), binding)
    const keys = r.profiles.map((p) => `${p.kind}:${p.space}:${p.component ?? '-'}`)
    expect(keys).toEqual([
      'regression_coefficients:model_input:-',
      'standardized_coefficients:model_input:-',
      'regression_coefficients:raw_input:-',
      'vip:model_input:-',
      'selectivity_ratio:model_input:-',
      'x_weights:model_input:0', 'x_loadings:model_input:0',
      'x_weights:model_input:1', 'x_loadings:model_input:1',
    ])
    const raw = r.profiles[2]
    expect(raw.values).toEqual([1, 2, 3, 4])
    expect(raw.axis).toEqual({ values: [1100, 1102, 1104, 1106], unit: 'nm', kind: 'wavelength' })
    expect(raw.exactness).toBe('exact')
    expect(r.profiles[0].axis.kind).toBe('wavelength')
    expect(r.profiles[3].rows).toEqual({ count: 3, source: 'dataset_train_partition' })
    expect(r.profiles[5].values).toEqual([0, 2, 4, 6])
    expect(r.pipeline).toMatchObject({ affine: true, columnAligned: true, firstNonAffineStep: null })
    expect(r.refusals).toEqual([])
    expect(fake.disposed.sort()).toEqual(['estimator', 'pipeline'])
  })

  it('refuses the exact raw view after a non-affine step and keeps model-space profiles', () => {
    fake.stepsInfo = [{ affine: false, columnAligned: true }, { affine: true, columnAligned: true }]
    fake.rawAffine = false
    const r = computeImportance(request(), binding)
    expect(r.profiles.some((p) => p.space === 'raw_input')).toBe(false)
    expect(r.pipeline.firstNonAffineStep).toBe('n4m:preprocessing.derivatives.savitzky_golay')
    expect(r.refusals).toEqual([expect.objectContaining({ kind: 'regression_coefficients', space: 'raw_input' })])
    expect(r.refusals[0].reason).toMatch(/local gradient/)
  })

  it('draws model-space profiles on model feature indices when preprocessing changes the variables', () => {
    fake.stepsInfo = [{ affine: true, columnAligned: false }, { affine: true, columnAligned: true }]
    fake.modelCols = 3
    fake.latent = false
    const r = computeImportance(request(), binding)
    expect(r.profiles[0].axis).toEqual({ values: [0, 1, 2], unit: null, kind: 'model_feature' })
    expect(r.profiles.find((p) => p.space === 'raw_input')?.axis.kind).toBe('wavelength')
    expect(r.refusals.map((x) => x.kind)).toEqual(['vip'])
  })

  it('refuses classifiers and models without a native state', () => {
    expect(() => computeImportance(request({ ...model(), taskType: 'classification' } as unknown as FittedPipeline), binding)).toThrow(/regression models only/)
    expect(() => computeImportance(request(model({ backendId: 'mljs-classic' })), binding)).toThrow(/native libn4m backend/)
  })
})

describe('compareImportanceProfiles', () => {
  it('aggregates wavelength profiles onto the grouping and maps NaN agreement to null', () => {
    const r = compareImportanceProfiles({
      nFeatures: 4,
      grouping: { kind: 'fixed_width', width: 2 },
      axis: { values: [1100, 1102, 1104, 1106], unit: 'nm' },
      profiles: [
        { id: 'a', label: 'SHAP', resolution: 'group', values: [0.2, 0.8] },
        { id: 'b', label: 'β', resolution: 'feature', values: [1, 2, 3, 4], rule: 'mean_abs' },
      ],
    }, binding)
    expect(binding.aggregateProfile).toHaveBeenCalledWith(Float64Array.from([1, 2, 3, 4]), expect.objectContaining({ nGroups: 2 }), 'mean_abs')
    expect(r.aggregated).toEqual([[0.2, 0.8], [1, 2]])
    expect(r.spearman).toEqual([[1, null], [null, 1]])
    expect(r.topK).toBe(2)
  })

  it('refuses group profiles computed on another grouping', () => {
    expect(() => compareImportanceProfiles({
      nFeatures: 4,
      grouping: { kind: 'fixed_width', width: 2 },
      profiles: [
        { id: 'a', label: 'SHAP', resolution: 'group', values: [1, 2, 3] },
        { id: 'b', label: 'VIP', resolution: 'feature', values: [1, 2, 3, 4] },
      ],
    }, binding)).toThrow(/3 groups, not the 2 groups/)
  })
})
