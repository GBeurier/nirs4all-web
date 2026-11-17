// A dataset with several target columns and missing values loads as nirs4all-io reports it, and a
// run honours the launch choices (target, missing-value option). The owner path is the real one:
// nirs4all-io WASM ingestion, then the DAG-ML engine on the run's view. Nothing is mocked.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { DagMlEngine } from '@/engine/dagml-engine'
import { hasTarget } from '@/engine/partition'
import { initSync as initDagMl } from '@/engine/wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from '@/engine/wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from '@/engine/wasm/datasets/nirs4all_datasets_wasm.js'
import type { DatasetTarget, MaterializedDataset, PipelineDSL } from '@/engine/types'
import { analyzeFiles, assembleDataset, ingestFiles, ioRetainedOf } from './wasm-io'
import {
  inferTargetTask, prepareRunDataset, projectTarget, renameTarget, runSelectionEffect, selectDatasetTarget,
  setTargetTask, textLabelsAmongNumbers,
} from './targets'

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('../engine/wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('../engine/wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('../engine/wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
})

// --- deterministic upload: X/Y train + test, three targets, missing cells in y and (optionally) X ---
const P = 12
const axis = Array.from({ length: P }, (_, j) => 1100 + 20 * j)
const spectrum = (i: number) => axis.map((_, j) => Math.sin(i * 0.7 + j * 0.3) * 0.2 + (i % 7) * 0.05 + j * 0.01 + 0.5)
const value = (i: number, t: number) => Math.sin(i * 0.7 + t) * 2 + (i % 7) * 0.5 + 10 + 3 * t
const TRAIN = Array.from({ length: 40 }, (_, i) => i)
const TEST = Array.from({ length: 12 }, (_, i) => 40 + i)
const NAMES = ['dry_matter', 'sugars', 'fibre']
/** rows without a value, per target (written as NA, an empty cell or NaN) */
const MISSING: ReadonlySet<number>[] = [new Set([3]), new Set([1, 5, 9, 14, 22, 41, 47]), new Set([...TEST, 0, 2, 4, 6, 8])]
const NA = ['NA', '', 'NaN']
const encoder = new TextEncoder()
const csv = (name: string, lines: string[]) => ({ name, bytes: encoder.encode(lines.join('\n') + '\n') })
/** `holes`: [row, column] spectral cells left empty; `only`: keep one target column and its valued rows. */
function upload(options: { holes?: [number, number][]; only?: number } = {}) {
  const holes = new Set((options.holes ?? []).map(([i, j]) => `${i}:${j}`))
  const targets = options.only === undefined ? NAMES.map((_, t) => t) : [options.only]
  const rowsOf = (rows: number[]) => (options.only === undefined ? rows : rows.filter((i) => !MISSING[options.only!].has(i)))
  const part = (name: string, rows: number[]) => [
    csv(`X_${name}.csv`, [axis.join(','), ...rowsOf(rows).map((i) => spectrum(i).map((v, j) => (holes.has(`${i}:${j}`) ? '' : v.toFixed(5))).join(','))]),
    csv(`Y_${name}.csv`, [targets.map((t) => NAMES[t]).join(','), ...rowsOf(rows).map((i) => targets.map((t) => (MISSING[t].has(i) ? NA[i % NA.length] : value(i, t).toFixed(4))).join(','))]),
  ]
  return [...part('train', TRAIN), ...part('test', TEST)]
}
const ingest = async (files: { name: string; bytes: Uint8Array }[]) => (await ingestFiles(files, 'upload')).dataset
/** Dataset row of written sample `i` (io orders the partitions itself; rows keep their order within one). */
const rowOf = (ds: MaterializedDataset, i: number): number => {
  const [name, k] = i < TRAIN.length ? ['train', i] : ['test', i - TRAIN.length]
  return ds.partitionNames!.flatMap((partition, row) => (partition === name ? [row] : []))[k]
}
const ridge: PipelineDSL = { name: 'ridge', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 0.1 } }, cv: { folds: 4, seed: 7 } }
const run = (ds: MaterializedDataset) => new DagMlEngine({ profile: 'strict-wasm' }).run(structuredClone(ds), ridge)

describe('a multi-target dataset with missing values loads as nirs4all-io reports it', () => {
  it('keeps every target with its missing count, every row, and shows the first target by default', async () => {
    const ds = await ingest(upload())
    expect(ds.nSamples).toBe(52) // no row dropped at load
    expect(ds.targets!.map((t) => [t.name, t.kind, t.missing])).toEqual(NAMES.map((name, t) => [name, 'numeric', MISSING[t].size]))
    expect(ds.targetName).toBe('dry_matter')
    expect(ds.taskType).toBe('regression')
    expect(Number.isNaN(ds.y[rowOf(ds, 3)])).toBe(true)
    expect(ds.y[rowOf(ds, 4)]).toBeCloseTo(value(4, 0), 4)
    expect(ds.y[rowOf(ds, 45)]).toBeCloseTo(value(45, 0), 4)
    expect(ds.missingFeatures).toBeUndefined()
    expect(ioRetainedOf(ds)!.record.blocks.train.y!.columns).toHaveLength(3) // the owner record is retained whole
  })

  it('projects another target without touching the rows, the spectra or the other targets', async () => {
    const ds = await ingest(upload())
    const sugars = selectDatasetTarget(ds, 'sugars')
    expect(sugars.targetName).toBe('sugars')
    expect(sugars.X).toBe(ds.X)
    expect(sugars.targets).toBe(ds.targets)
    expect(ioRetainedOf(sugars)).toBe(ioRetainedOf(ds))
    expect(Array.from(sugars.y).filter((v) => !Number.isFinite(v))).toHaveLength(MISSING[1].size)
    expect(sugars.y[rowOf(ds, 0)]).toBeCloseTo(value(0, 1), 4)
    expect(Number.isNaN(sugars.y[rowOf(ds, 41)])).toBe(true)
    expect(ds.targetName).toBe('dry_matter') // the source projection is not mutated
    expect(() => selectDatasetTarget(ds, 'protein')).toThrow(/"protein" is not a target of this dataset \(dry_matter, sugars, fibre\)/)
  })

  it('keeps missing spectral values under the owner mask and counts them (io NA policy ignore, nothing dropped)', async () => {
    const ds = await ingest(upload({ holes: [[2, 4], [2, 5], [17, 4], [44, 0]] }))
    expect(ds.nSamples).toBe(52)
    expect(ds.nFeatures).toBe(P)
    expect(ds.missingFeatures).toEqual({ cells: 4, rows: 3, columns: 3 })
    expect(Number.isNaN(ds.X[rowOf(ds, 2) * P + 4])).toBe(true)
    expect(ds.X[rowOf(ds, 2) * P + 3]).toBeCloseTo(spectrum(2)[3], 5)
    expect(Number.isNaN(ds.X[rowOf(ds, 44) * P])).toBe(true)
  })

  // "missing" is not an NA token of nirs4all-io, so io reads a column holding it as text labels
  const withTextCell = (names: string[]) => upload().map((file) => (names.includes(file.name)
    ? csv(file.name, new TextDecoder().decode(file.bytes).trimEnd().split('\n').map((line, i) => (i === 6 ? `missing,${line.split(',').slice(1).join(',')}` : line)))
    : file))

  it('follows the owner column kind for a text-label column whose labels look numeric: never a regression on class codes', async () => {
    const ds = await ingest(withTextCell(['Y_train.csv', 'Y_test.csv']))
    const target = ds.targets![0]
    expect(target.kind).toBe('classification_string')
    expect(ds.taskType).toBe('multiclass')
    expect(textLabelsAmongNumbers(target)).toEqual(['missing'])
    expect(Array.from(ds.yRaw!).every(Number.isNaN)).toBe(true)
    expect(ds.targets![1].kind).toBe('numeric') // the other targets are unaffected
    // asked as a regression target it has no numeric value at all, and the engine refuses to train on it
    const regression = setTargetTask(ds, 'regression')
    expect(Array.from(regression.y).every(Number.isNaN)).toBe(true)
    await expect(run(prepareRunDataset(regression, { target: 'dry_matter', missingValues: 'exclude_samples' }).dataset)).rejects.toThrow()
  })

  it('loads a dataset whose target is read differently across partitions: that target is flagged, the others stay usable', async () => {
    const ds = await ingest(withTextCell(['Y_train.csv'])) // text cell in the train file only
    expect(ds.nSamples).toBe(52)
    expect(ds.targets!.map((t) => t.name)).toEqual(NAMES)
    expect(ds.targets![0].issue).toMatch(/read it as (numbers|text labels) in partition "(train|test)" and as (numbers|text labels) in "(train|test)"/)
    expect(ds.targets![0].missing).toBe(52) // no value is read from an inconsistent column
    expect(ds.targets![1].issue).toBeUndefined()
    expect(selectDatasetTarget(ds, 'sugars').y[rowOf(ds, 0)]).toBeCloseTo(value(0, 1), 4)
  })
})

describe('a run honours its launch target and missing-value option', () => {
  it('models the launch target; rows without it are excluded by the owner and counted, as if they were absent', async () => {
    const ds = await ingest(upload())
    const { dataset: view, effect } = prepareRunDataset(ds, { target: 'sugars', missingValues: 'exclude_samples' })
    expect(effect).toMatchObject({ target: 'sugars', missingTargets: 7, train: 35, test: 10, excludedSamples: 0, excludedFeatures: 0 })
    expect(view.nSamples).toBe(52) // rows without the target stay in the view: the engine excludes them natively
    expect(view.targets).toBeUndefined() // single-target projection sent to the engine worker
    expect(ds.targets).toHaveLength(3) // the loaded dataset is untouched
    const result = await run(view)
    const reference = await run(await ingest(upload({ only: 1 })))
    expect(result.targetName).toBe('sugars')
    expect(result.missingTargets).toBe(7)
    expect(reference.missingTargets).toBeUndefined()
    expect(result.cv!.predictions).toHaveLength(35)
    expect(result.refit.predictions).toHaveLength(10)
    result.refit.predictions.forEach((row, k) => {
      expect(row.actual).toBeCloseTo(reference.refit.predictions[k].actual, 10)
      expect(row.predicted).toBeCloseTo(reference.refit.predictions[k].predicted, 10)
    })
    expect(result.refit.metrics.rmse).toBeCloseTo(reference.refit.metrics.rmse!, 10)
  })

  it('stops before running when the option is to stop on missing values', async () => {
    const ds = await ingest(upload({ holes: [[2, 4]] }))
    expect(() => prepareRunDataset(ds, { target: 'sugars', missingValues: 'refuse' })).toThrow(/stop on missing values: 7 train\/test samples have no value for "sugars" and 1 sample has missing spectral values/)
    const complete = await ingest(upload())
    expect(() => prepareRunDataset(complete, { target: 'dry_matter', missingValues: 'refuse' })).toThrow(/stop on missing values: 1 train\/test sample has no value for "dry_matter"\./)
    expect(prepareRunDataset(await ingest(upload({ only: 0 })), { target: 'dry_matter', missingValues: 'refuse' }).effect.missingTargets).toBe(0) // complete data runs
  })

  it('leaves incomplete samples out of the run exactly as io `remove_sample` assembles them', async () => {
    const files = upload({ holes: [[2, 4], [2, 5], [17, 4], [44, 0]], only: 0 })
    const ds = await ingest(files)
    const { dataset: view, effect } = prepareRunDataset(ds, { target: 'dry_matter', missingValues: 'exclude_samples' })
    expect(effect).toMatchObject({ incompleteSamples: 3, excludedSamples: 3, excludedFeatures: 0 })
    expect(ds.nSamples).toBe(51) // `only` wrote the 51 rows with a dry_matter value; the dataset keeps them all
    const owner = await withNaPolicy(files, 'remove_sample')
    expect(view.nSamples).toBe(owner.nSamples)
    expect(Array.from(view.X)).toEqual(Array.from(owner.X))
    expect(Array.from(view.y)).toEqual(Array.from(owner.y))
    expect(view.partitions).toEqual(owner.partitions)
    expect(view.missingFeatures).toBeUndefined()
    const result = await run(view)
    expect(result.cv!.predictions).toHaveLength(37) // 39 labelled train rows minus rows 2 and 17
    expect(result.refit.predictions).toHaveLength(11) // 12 test rows minus row 44
  })

  it('leaves incomplete wavelengths out of the run exactly as io `remove_feature` assembles them', async () => {
    // the same holes in both partitions: io removes features per source, so the columns stay aligned
    const files = upload({ holes: [[2, 4], [17, 4], [44, 4], [45, 9], [5, 9]], only: 0 })
    const ds = await ingest(files)
    const { dataset: view, effect } = prepareRunDataset(ds, { target: 'dry_matter', missingValues: 'exclude_features' })
    expect(effect).toMatchObject({ incompleteFeatures: 2, excludedFeatures: 2, excludedSamples: 0 })
    const owner = await withNaPolicy(files, 'remove_feature')
    expect(view.nFeatures).toBe(P - 2)
    expect(view.axis).toEqual(owner.axis)
    expect(Array.from(view.X)).toEqual(Array.from(owner.X))
    expect(view.nSamples).toBe(ds.nSamples) // every sample stays
    const result = await run(view)
    expect(result.model.nFeatures).toBe(P - 2)
    expect(result.refit.predictions).toHaveLength(12)
  })
})

/** The same files assembled by nirs4all-io under an explicit NA policy on the feature sources. */
async function withNaPolicy(files: { name: string; bytes: Uint8Array }[], policy: 'remove_sample' | 'remove_feature'): Promise<MaterializedDataset> {
  const analysis = await analyzeFiles(files)
  const spec = structuredClone(analysis.plan!.resolved_spec!)
  spec.params = { ...(spec.params as object), na: { policy } }
  for (const source of spec.sources!) source.params = { ...source.params, na: { policy } }
  return assembleDataset(analysis.decoded, { ...analysis.plan, resolved_spec: spec }, files)
}

describe('target projection (pure)', () => {
  const numeric = (name: string, values: number[]): DatasetTarget => ({ name, kind: 'numeric', values: Float64Array.from(values), missing: values.filter((v) => !Number.isFinite(v)).length })
  const text = (name: string, labels: string[]): DatasetTarget => ({ name, kind: 'classification_string', values: new Float64Array(labels.length).fill(NaN), labels, missing: labels.filter((l) => l === '').length })
  const base = (targets: DatasetTarget[]): MaterializedDataset => selectDatasetTarget({
    X: Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]), nSamples: 4, nFeatures: 2, axis: [1, 2], axisUnit: 'nm',
    y: new Float64Array(4), targetName: '', taskType: 'regression', sampleIds: ['a', 'b', 'c', 'd'],
    partitions: ['train', 'train', 'test', 'predict'], targets,
    metadata: [{ name: 'site', kind: 'categorical', values: ['x', 'y', null, 'x'] }],
  }, targets[0].name)

  it('infers the task from the owner kind and encodes classes without turning a missing value into one', () => {
    const grade = text('grade', ['b', '', 'a', 'b'])
    expect(inferTargetTask(grade)).toBe('binary')
    const projected = projectTarget(grade, 'binary')
    expect(projected.classes).toEqual(['b', '', 'a', 'b'])
    expect(Array.from(projected.y)).toEqual([1, NaN, 0, 1])
    expect(inferTargetTask(numeric('p', [1.5, 2.25, NaN, 9.75]))).toBe('regression')
    expect(Array.from(projectTarget(numeric('k', [0, 1, NaN, 1]), 'binary').y)).toEqual([0, 1, NaN, 1])
    expect(textLabelsAmongNumbers(text('p', ['1.5', 'na', '2', '']))).toEqual(['na'])
    expect(textLabelsAmongNumbers(grade)).toEqual([]) // a real class column gets no hint
  })

  it('remembers the task chosen for a target across target switches, and renames without collisions', () => {
    const ds = base([numeric('p', [1, 2, 3, 4]), numeric('k', [0, 1, 0, NaN])])
    const asClasses = setTargetTask(selectDatasetTarget(ds, 'p'), 'multiclass')
    expect(asClasses.taskType).toBe('multiclass')
    expect(selectDatasetTarget(selectDatasetTarget(asClasses, 'k'), 'p').taskType).toBe('multiclass')
    expect(() => renameTarget(ds, 'k')).toThrow(/already named "k"/)
    const renamed = renameTarget(ds, 'protein')
    expect(renamed.targetName).toBe('protein')
    expect(renamed.targets!.map((t) => t.name)).toEqual(['protein', 'k'])
    expect(selectDatasetTarget(renamed, 'k').targetName).toBe('k')
  })

  it('subsets every row-aligned field together when a run leaves incomplete samples out', () => {
    const ds = base([numeric('p', [1, 2, 3, 4]), text('g', ['u', 'v', '', 'u'])])
    ds.X[2] = NaN // row 1
    const withIds: MaterializedDataset = { ...ds, groupIds: ['g1', 'g2', 'g3', null], observationIds: ['o1', 'o2', 'o3', 'o4'], partitionNames: ['cal', 'cal', 'val', 'new'] }
    expect(runSelectionEffect(withIds, { target: 'p', missingValues: 'exclude_samples' })).toMatchObject({ train: 1, test: 1, missingTargets: 0, incompleteSamples: 1, incompleteFeatures: 1, excludedSamples: 1 })
    const { dataset: view } = prepareRunDataset(withIds, { target: 'g', missingValues: 'exclude_samples' })
    expect(view.nSamples).toBe(3)
    expect(Array.from(view.X)).toEqual([1, 2, 5, 6, 7, 8])
    expect(view.sampleIds).toEqual(['a', 'c', 'd'])
    expect(view.partitions).toEqual(['train', 'test', 'predict'])
    expect(view.partitionNames).toEqual(['cal', 'val', 'new'])
    expect(view.groupIds).toEqual(['g1', 'g3', null])
    expect(view.observationIds).toEqual(['o1', 'o3', 'o4'])
    expect(view.metadata![0].values).toEqual(['x', null, 'x'])
    expect(view.classes).toEqual(['u', '', 'u']) // re-projected on the kept rows: class "v" is gone with its row
    expect([0, 1, 2].map((row) => hasTarget(view, row))).toEqual([true, false, true])
    expect(withIds.nSamples).toBe(4) // the loaded dataset is not modified
    expect(() => prepareRunDataset({ ...withIds, X: withIds.X.map(() => NaN) }, { target: 'p', missingValues: 'exclude_features' })).toThrow(/no spectral column would remain/)
  })
})
