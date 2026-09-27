// Column identity of fitted models (re-audit R09 / F03): a model trained on a
// dataset with a spectral axis or header names records them, predict refuses an
// input whose named columns are permuted / renamed / resized, the libn4m native
// pipeline enforces the same check, the .n4a bundle keeps the identity, and an
// input without names (or an older bundle) stays explicitly positional.
import { beforeAll, describe, expect, it } from 'vitest'
import { n4mToken } from '@/catalog/native'
import { loadSampleDataset } from '@/data/samples'
import { buildN4aBundle, parseN4a, serializeTyped } from '@/lib/n4a'
import { loadLibn4mBackend } from './backends'
import { checkInputColumns, columnMismatch, columnName, datasetFeatureIdentity, parseFeatureIdentity } from './feature-identity'
import { type FittedState, type ModelBackend, predictPipeline, runPipeline } from './orchestrate'
import type { MaterializedDataset, PipelineDSL, RunResult } from './types'

let backend: ModelBackend
beforeAll(async () => {
  backend = await loadLibn4mBackend()
})

/** Every row of `ds` with its columns reversed (a same-width permutation). */
const reversedRows = (ds: MaterializedDataset): Float64Array =>
  Float64Array.from({ length: ds.X.length }, (_, k) => {
    const r = Math.floor(k / ds.nFeatures)
    const j = k % ds.nFeatures
    return ds.X[r * ds.nFeatures + (ds.nFeatures - 1 - j)]
  })

const ridge: PipelineDSL = { name: 'ridge', steps: [], model: { id: 'm', type: n4mToken('models.regularized.ridge'), params: { alpha: 1 } } }
const snvPls: PipelineDSL = {
  name: 'snv pls',
  steps: [{ id: 'snv', type: n4mToken('preprocessing.scatter.snv'), params: {} }],
  model: { id: 'm', type: n4mToken('models.pls.pls_regression'), params: { n_components: 6 } },
}

describe('column names', () => {
  it('names numeric header cells by their number', () => {
    expect(columnName(' 1000.0 ')).toBe('1000')
    expect(columnName('1798,2103')).toBe('1798.2103')
    expect(columnName('wl_1000')).toBe('wl_1000')
  })

  it('records the spectral axis, header names, or nothing for an index axis', () => {
    const base = { X: new Float64Array(6), nSamples: 2, nFeatures: 3, y: new Float64Array(2), targetName: 'y', taskType: 'regression' as const, sampleIds: ['a', 'b'], partitions: ['train' as const, 'train' as const] }
    expect(datasetFeatureIdentity({ ...base, axis: [1000, 1002.5, 1005], axisUnit: 'nm' })).toEqual({ names: ['1000', '1002.5', '1005'], axis: [1000, 1002.5, 1005], unit: 'nm' })
    expect(datasetFeatureIdentity({ ...base, axis: [0, 1, 2], axisUnit: 'index', featureNames: ['a', 'b', 'c'] })).toEqual({ names: ['a', 'b', 'c'] })
    expect(datasetFeatureIdentity({ ...base, axis: [0, 1, 2], axisUnit: 'index' })).toBeUndefined()
    // duplicate names do not identify a column: positional
    expect(datasetFeatureIdentity({ ...base, axis: [0, 1, 2], axisUnit: 'index', featureNames: ['a', 'a', 'c'] })).toBeUndefined()
    expect(() => datasetFeatureIdentity({ ...base, axis: [0, 1, 2], axisUnit: 'index', featureNames: ['a', 'b\0x', 'c'] })).toThrow(/NUL/)
  })

  it('refuses names that differ in order, content or count, and accepts unnamed input', () => {
    const model = { nFeatures: 3, features: { names: ['1000', '1010', '1020'] } }
    expect(() => checkInputColumns(model, 3, ['1000', '1010', '1020'])).not.toThrow()
    expect(() => checkInputColumns(model, 3, undefined)).not.toThrow()
    expect(() => checkInputColumns(model, 3, ['1020', '1010', '1000'])).toThrow(/different order: column 1 is "1020" where the model has "1000"/)
    expect(() => checkInputColumns(model, 3, ['1000', '1010', '1030'])).toThrow(/1 not in the model \("1030"\); 1 missing \("1020"\)/)
    expect(() => checkInputColumns(model, 2, ['1000', '1010'])).toThrow(/2 columns but the model was fitted on 3/)
    expect(() => checkInputColumns(model, 3, ['1000', '1010\0', '1020'])).toThrow(/NUL/)
    expect(columnMismatch(['a', 'b'], ['a', 'b'])).toBeNull()
  })
})

describe('libn4m predict with a known spectral axis', () => {
  let ds: MaterializedDataset
  let run: RunResult
  beforeAll(async () => {
    ds = await loadSampleDataset('corn')
    run = await runPipeline(ds, ridge, {}, backend)
  })

  it('records the axis in the fitted pipeline', () => {
    expect(run.model.features?.names).toEqual(ds.axis.map(String))
    expect(run.model.features?.axis).toEqual(ds.axis)
    expect(run.model.features?.unit).toBe(ds.axisUnit)
  })

  it('refuses permuted columns and accepts the matching header', () => {
    const names = ds.axis.map(String)
    expect(() => predictPipeline(run.model, reversedRows(ds), ds.nSamples, ds.nFeatures, backend, [...names].reverse())).toThrow(/different order/)
    const named = predictPipeline(run.model, ds.X, ds.nSamples, ds.nFeatures, backend, names)
    const anonymous = predictPipeline(run.model, ds.X, ds.nSamples, ds.nFeatures, backend)
    expect(Array.from(named.values)).toEqual(Array.from(anonymous.values))
  })

  it('takes unnamed input by position (the UI states it)', () => {
    const permuted = predictPipeline(run.model, reversedRows(ds), ds.nSamples, ds.nFeatures, backend)
    expect(permuted.values).toHaveLength(ds.nSamples)
  })

  it('has libn4m check the names itself through the native role pipeline', () => {
    const names = ds.axis.map(String)
    const st = run.model.state as FittedState
    const X = { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
    expect(() => backend.predictNamed!(st, ridge.model!.type, X, names, [...names].reverse())).toThrow(/reordered/)
    const renamed = [...names.slice(0, -1), 'x']
    expect(() => backend.predictNamed!(st, ridge.model!.type, X, names, renamed)).toThrow()
  })

  it.each([
    ['corn', snvPls],
    ['meat', { ...snvPls, model: { id: 'm', type: n4mToken('models.classification.pls_lda'), params: { n_components: 6 } } }],
  ] as const)('%s: the native named pipeline predicts exactly like the per-step replay', async (sample, dsl) => {
    const data = await loadSampleDataset(sample)
    const fitted = await runPipeline(data, dsl, {}, backend)
    expect(fitted.model.features).toBeDefined()
    const named = predictPipeline(fitted.model, data.X, data.nSamples, data.nFeatures, backend, fitted.model.features!.names)
    const positional = predictPipeline({ ...fitted.model, features: undefined }, data.X, data.nSamples, data.nFeatures, backend)
    expect(Array.from(named.values)).toEqual(Array.from(positional.values))
    expect(named.labels).toEqual(positional.labels)
  })
})

describe('.n4a bundle column identity', () => {
  let ds: MaterializedDataset
  let run: RunResult
  beforeAll(async () => {
    ds = await loadSampleDataset('corn')
    run = await runPipeline(ds, snvPls, {}, backend)
  })

  it('round-trips the identity and still refuses permuted columns', () => {
    const loaded = parseN4a(serializeTyped(buildN4aBundle(run)))
    expect(loaded.model.features).toEqual(run.model.features)
    const names = ds.axis.map(String)
    expect(() => predictPipeline(loaded.model, reversedRows(ds), ds.nSamples, ds.nFeatures, backend, [...names].reverse())).toThrow(/different order/)
    const replay = predictPipeline(loaded.model, ds.X, ds.nSamples, ds.nFeatures, backend, names)
    expect(Array.from(replay.values)).toEqual(Array.from(predictPipeline(run.model, ds.X, ds.nSamples, ds.nFeatures, backend).values))
  })

  it('loads an older bundle without identity as positional', () => {
    const bundle = JSON.parse(serializeTyped(buildN4aBundle(run)))
    delete bundle.model.features
    const loaded = parseN4a(JSON.stringify(bundle))
    expect(loaded.model.features).toBeUndefined()
    const names = ds.axis.map(String)
    // no fitted names: a header cannot be checked, the input is positional
    const values = predictPipeline(loaded.model, ds.X, ds.nSamples, ds.nFeatures, backend, names).values
    expect(Array.from(values)).toEqual(Array.from(predictPipeline(run.model, ds.X, ds.nSamples, ds.nFeatures, backend).values))
  })

  it('refuses a malformed identity', () => {
    const bundle = JSON.parse(serializeTyped(buildN4aBundle(run)))
    bundle.model.features.names = bundle.model.features.names.slice(1)
    expect(() => parseN4a(JSON.stringify(bundle))).toThrow(/column identity is invalid/)
    expect(() => parseFeatureIdentity({ names: ['1', '2'], axis: [1, 3] }, 2)).toThrow(/axis does not match/)
    expect(() => parseFeatureIdentity({ names: ['a', 'a'] }, 2)).toThrow(/duplicate/)
  })
})
