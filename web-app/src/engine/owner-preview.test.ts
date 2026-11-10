import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PlaygroundResult, PlaygroundRunRequest } from 'nirs4all-ui/playground'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { runOwnerPreview, type OwnerPreviewMessage } from './owner-preview'
import { loadDagMlWasm, loadMethodsWasm } from './nirs4all-core'
import { buildNativeFolds, expandFoldRows } from './grouped-cv'
import { hasTarget, missingTargetCount, trainRowsOf } from './partition'
import { physicalIdentity } from './relations'
import { PREVIEW_OPS } from '@/components/dataset/preview'
import type { Matrix, NativeEstimator, Transformer } from './wasm/methods/index.js'
import type { MaterializedDataset, PipelineDSL } from './types'

type Cv = NonNullable<PipelineDSL['cv']>

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
})

function dataset(): MaterializedDataset {
  const nSamples = 14
  const nFeatures = 4
  return {
    X: Float64Array.from(Array.from({ length: nSamples }, (_, row) => [row + 1, row * row + 2, row % 3 + 4, row * 3 + 7]).flat()),
    y: Float64Array.from({ length: nSamples }, (_, row) => 1.25 + row / 2),
    nSamples, nFeatures, axis: [1000, 1100, 1200, 1300], axisUnit: 'nm',
    targetName: 'Concentration', taskType: 'regression',
    sampleIds: Array.from({ length: nSamples }, (_, row) => `sample-${row}`),
    partitions: Array.from({ length: nSamples }, (_, row) => row < 12 ? 'train' : row === 12 ? 'test' : 'predict'),
  }
}

function request(ds: MaterializedDataset, settings: {
  operator?: string
  projection?: boolean
  cv?: Cv
} = {}): OwnerPreviewMessage {
  const needs: PlaygroundRunRequest['needs'] = {
    projection: settings.projection ? 'pca' : null, components: 4,
    loadings: false, outliers: false, folds: Boolean(settings.cv), repetitions: null,
  }
  const steps: PlaygroundRunRequest['steps'] = settings.operator
    ? [{ id: 'preview-step', operatorId: settings.operator, params: {}, enabled: true }]
    : []
  return { type: 'preview', id: 'preview-1', datasetKey: 'dataset-1', ds,
    request: { id: 'preview-1', datasetId: 'dataset-1', steps, cursorStepId: steps[0]?.id ?? null, needs },
    options: { profile: 'dataset-view', fitScope: 'train', folds: settings.cv } }
}

const runPreview = (msg: OwnerPreviewMessage) => runOwnerPreview(msg, new AbortController().signal)
const asMatrix = (ds: MaterializedDataset): Matrix => ({ data: ds.X, rows: ds.nSamples, cols: ds.nFeatures })
function outputRows(result: PlaygroundResult): number[][] {
  const input = result.spectra
  if ('data' in input) return Array.from({ length: input.rows }, (_, row) => Array.from(input.data.subarray(row * input.cols, (row + 1) * input.cols)))
  return input.map((row) => Array.from(row))
}

async function directMsc(ds: MaterializedDataset, rows: readonly number[]): Promise<number[][]> {
  const methods = await loadMethodsWasm()
  const operator = new (methods.methodClass('preprocessing.scatter.msc'))() as NativeEstimator & Transformer
  const fit = Float64Array.from(rows.flatMap((row) => Array.from(ds.X.subarray(row * ds.nFeatures, (row + 1) * ds.nFeatures))))
  try {
    operator.fit({ data: fit, rows: rows.length, cols: ds.nFeatures })
    const output = operator.transform(asMatrix(ds))
    return Array.from({ length: output.rows }, (_, row) => Array.from(output.data.subarray(row * output.cols, (row + 1) * output.cols)))
  } finally { operator.dispose() }
}

function mscDataset(noTrain: boolean): MaterializedDataset {
  const rows = [[1, 2, 4, 8], [2, 5, 7, 12], [50, 2, 10, 90], [4, 1, 100, 12], [11, 13, 20, 39], [7, 3, 5, 21]]
  return { ...dataset(), nSamples: rows.length, X: Float64Array.from(rows.flat()),
    y: Float64Array.from([0, 1, 0, NaN, 1, 0]), taskType: 'binary', classes: ['A', 'B', '', 'A', 'B', 'A'],
    sampleIds: rows.map((_, row) => `msc-${row}`),
    partitions: noTrain ? ['test', 'test', 'test', 'test', 'predict', 'predict'] : ['train', 'train', 'train', 'train', 'test', 'predict'],
  }
}

describe('DatasetView native owner preview contracts (conditions 2–5)', () => {
  it.each([false, true])('MSC uses the run training cohort, including missing labels and no-train fallback=%s', async (noTrain) => {
    const ds = mscDataset(noTrain)
    expect(hasTarget(ds, 2)).toBe(false) // finite encoded y with an explicitly missing class label
    expect(hasTarget(ds, 3)).toBe(false)
    expect(trainRowsOf(ds)).toEqual([0, 1])
    expect(missingTargetCount(ds)).toBe(2)
    const result = await runPreview(request(ds, { operator: 'n4m:preprocessing.scatter.msc' }))
    const expected = await directMsc(ds, [0, 1])
    expect(outputRows(result)).toEqual(expected)
    const contaminated = await directMsc(ds, [0, 1, 2, 3, 4, 5])
    expect(contaminated.flat().some((value, index) => Math.abs(value - expected.flat()[index]) > 1e-8)).toBe(true)
    expect(result.warnings?.join(' ')).toContain('all labelled non-predict rows when no train partition exists')
    expect(ds.X[0]).toBe(1) // owner fit/transform must not detach or replace live input
  })

  it('refuses preprocessing when the shared training cohort has no usable targets', async () => {
    const ds = mscDataset(false)
    ds.classes = ds.sampleIds.map(() => '')
    await expect(runPreview(request(ds, { operator: 'n4m:preprocessing.scatter.msc' }))).rejects.toThrow(/requires labelled rows/)
  })

  // These witnesses require the actual RowL2Normalize owner artifact and its
  // manifest. Do not skip or replace the missing role with column Normalize.
  it('routes Normalize (L2) through the generic row role, preserving zero and extreme finite rows', async () => {
    const op = PREVIEW_OPS.find((candidate) => candidate.id === 'norm')!
    expect(op.type).toBe('n4m:preprocessing.scaling.row_l2_normalize')
    const rows = [[3, 4, 0, 0], [1, -2, 2, 0], [-1, -1, -1, -1], [0, 0, 0, 0],
      [1e300, -1e300, 0, 0], [3e-300, 4e-300, 0, 0]]
    const ds = { ...dataset(), nSamples: rows.length, X: Float64Array.from(rows.flat()),
      y: Float64Array.from({ length: rows.length }, (_, row) => row + 1), sampleIds: rows.map((_, row) => `l2-${row}`),
      partitions: rows.map(() => 'train' as const) }
    const original = ds.X.slice()
    const result = await runPreview(request(ds, { operator: op.type }))
    const output = outputRows(result)
    for (const index of [0, 1, 2, 4, 5]) expect(Math.hypot(...output[index])).toBeCloseTo(1, 12)
    expect(output[3]).toEqual([0, 0, 0, 0])
    for (const index of [0, 5]) {
      expect(output[index][0]).toBeCloseTo(0.6, 12)
      expect(output[index][1]).toBeCloseTo(0.8, 12)
    }
    expect(output[4][0]).toBeCloseTo(Math.SQRT1_2, 12)
    expect(output[4][1]).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(ds.X).toEqual(original)
  })

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite row L2 preview input (%s) without a raw fallback', async (value) => {
    const ds = dataset()
    // A held-out transform row must be checked even though fit only sees train.
    ds.X[12 * ds.nFeatures] = value
    await expect(runPreview(request(ds, { operator: 'n4m:preprocessing.scaling.row_l2_normalize' }))).rejects.toThrow()
  })

  it('projects raw X even when a DatasetView request accidentally contains preprocessing steps', async () => {
    const ds = dataset()
    const methods = await loadMethodsWasm()
    const expected = methods.preflightPca(asMatrix(ds), 4)
    const result = await runPreview(request(ds, { operator: 'n4m:preprocessing.scatter.snv', projection: true }))
    expect(outputRows(result)[0]).not.toEqual(Array.from(ds.X.subarray(0, ds.nFeatures)))
    expect(result.projection?.coordinates.map((row) => Array.from(row)).flat()).toEqual(Array.from(expected.scores.data))
    const fractions = Array.from(expected.eigenvalues, (value, index) => expected.unresolved[index] ? NaN : value / expected.fullMoments[0])
    expect(result.projection?.explained).toEqual(fractions)
  })

  it('identifies unresolved native PCA components instead of displaying zero explained variance', async () => {
    const ds = dataset()
    ds.X = Float64Array.from(Array.from({ length: ds.nSamples }, (_, row) => [row, row * 2, row * 3, row * 4]).flat())
    const methods = await loadMethodsWasm()
    const expected = methods.preflightPca(asMatrix(ds), 4)
    const unresolved = Array.from(expected.unresolved).flatMap((flag, index) => flag ? [index] : [])
    expect(unresolved.length).toBeGreaterThan(0)
    const result = await runPreview(request(ds, { projection: true }))
    for (const index of unresolved) {
      expect(Number.isNaN(result.projection?.explained?.[index])).toBe(true)
      expect(result.warnings?.join(' ')).toContain(`PC${index + 1}`)
    }
    expect(result.warnings?.join(' ')).toContain('explained variance is unavailable')
  })

  it.each(['regression', 'classification', 'groups', 'repeated-scans', 'no-train', 'missing-target', 'missing-label'] as const)('matches the run native CV path for %s', async (profile) => {
    const ds = dataset()
    const cv: Cv = { folds: 3, seed: 97, strategy: 'auto' }
    if (profile === 'classification' || profile === 'missing-label') {
      ds.taskType = 'binary'
      ds.y = Float64Array.from(ds.y, (_, row) => row % 2)
      ds.classes = ds.sampleIds.map((_, row) => row % 2 ? 'B' : 'A')
      if (profile === 'missing-label') ds.classes[2] = ''
    }
    if (profile === 'groups') {
      cv.strategy = 'group'
      ds.groupIds = ds.sampleIds.map((_, row) => row < 12 ? `train-group-${Math.floor(row / 3)}` : `heldout-${row}`)
    }
    if (profile === 'repeated-scans') {
      ds.sampleIds = ds.sampleIds.map((id, row) => row < 12 ? `physical-${Math.floor(row / 2)}` : id)
      ds.y = Float64Array.from(ds.y, (value, row) => row < 12 ? Math.floor(row / 2) + 1 : value)
    }
    if (profile === 'no-train') ds.partitions = ds.partitions.map((partition) => partition === 'train' ? 'test' : partition)
    if (profile === 'missing-target') ds.y[2] = NaN
    const dagml = await loadDagMlWasm()
    const identity = physicalIdentity(ds)
    const cohort = trainRowsOf(ds)
    const runFolds = buildNativeFolds(dagml, ds, cv, cohort)
    const expected = runFolds.folds.map((fold, index) => ({ label: `Fold ${index + 1}`,
      train: expandFoldRows(identity, fold.train_sample_ids, 'train', ds),
      test: expandFoldRows(identity, fold.validation_sample_ids, 'validation', ds) }))
    const result = await runPreview(request(ds, { cv }))
    expect(result.folds?.folds).toEqual(expected)
    const assigned = result.folds!.folds.flatMap((fold) => fold.test)
    expect(assigned.sort((a, b) => a - b)).toEqual([...cohort].sort((a, b) => a - b))
    if (profile !== 'no-train') expect(assigned).not.toContain(12)
    expect(assigned).not.toContain(13)
    if (profile === 'missing-target' || profile === 'missing-label') expect(assigned).not.toContain(2)
    for (const fold of result.folds!.folds) {
      expect(fold.test.some((row) => fold.train.includes(row))).toBe(false)
      if (profile === 'classification') expect(new Set(fold.test.map((row) => ds.classes![row])).size).toBe(2)
      if (profile === 'repeated-scans') {
        for (let first = 0; first < 12; first += 2) expect(fold.test.includes(first)).toBe(fold.test.includes(first + 1))
      }
      if (profile === 'groups') {
        const testGroups = new Set(fold.test.map((row) => ds.groupIds![row]))
        expect(fold.train.some((row) => testGroups.has(ds.groupIds![row]))).toBe(false)
      }
    }
    expect(result.warnings?.join(' ')).toContain('seed 97')
    expect(result.warnings?.join(' ')).toContain(`strategy ${cv.strategy}`)
  })

  it('retains an explicit native refusal instead of inventing folds for an impossible group protocol', async () => {
    const ds = dataset()
    ds.groupIds = ds.sampleIds.map((_, row) => row < 12 ? `group-${Math.floor(row / 4)}` : `heldout-${row}`)
    const result = await runPreview(request(ds, { cv: { folds: 5, seed: 97, strategy: 'group' } }))
    expect(result.folds).toBeNull()
    expect(result.warnings?.join(' ')).toContain('DAG-ML preview folds refused:')
  })

  it('warns that dataset-declared folds are not the folds used by Web CV', async () => {
    const ds = dataset()
    ds.folds = [{ foldId: 91, valSampleIds: [ds.sampleIds[0]] }]
    const result = await runPreview(request(ds, { cv: { folds: 3, seed: 17, strategy: 'sample' } }))
    expect(result.folds?.folds).toHaveLength(3)
    expect(result.warnings?.join(' ')).toContain('Dataset-declared folds are not used by Web CV')
  })
})
