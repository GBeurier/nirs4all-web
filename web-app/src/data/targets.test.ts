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
import { analyzeFiles, assembleDataset, ingestFiles, ioRetainedOf, replaceMissingSpectra } from './wasm-io'
import {
  inferTargetTask, keptMissingSpectraNotice, prepareRunDataset, projectTarget, renameTarget, runSelectionEffect, selectDatasetTarget,
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
    expect(effect).toMatchObject({ target: 'sugars', missingTargets: 7, train: 35, test: 10, excludedSamples: 0, missingCells: 0 })
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

  it('stops before running when the missing-target strategy is to stop', async () => {
    const ds = await ingest(upload())
    expect(() => prepareRunDataset(ds, { target: 'sugars', missingValues: 'refuse' })).toThrow(/stop on missing target values: 7 train\/test samples have no value for "sugars"\./)
    expect(() => prepareRunDataset(ds, { target: 'dry_matter', missingValues: 'refuse' })).toThrow(/stop on missing target values: 1 train\/test sample has no value for "dry_matter"\./)
    expect(prepareRunDataset(await ingest(upload({ only: 0 })), { target: 'dry_matter', missingValues: 'refuse' }).effect.missingTargets).toBe(0) // complete data runs
  })
})

describe('missing spectral values are an explicit launch choice', () => {
  const HOLES: [number, number][] = [[2, 4], [2, 5], [17, 4], [44, 0]]
  const selection = { target: 'dry_matter', missingValues: 'exclude_samples' as const }

  it('does not start a run, and applies nothing, until a choice is made', async () => {
    const ds = await ingest(upload({ holes: HOLES, only: 0 }))
    expect(() => prepareRunDataset(ds, selection)).toThrow(/4 missing values in 3 samples\. Choose in the run settings what this run does with them: remove the affected samples, replace the missing values, or leave them as they are\./)
    expect(() => prepareRunDataset(ds, { ...selection, missingSpectra: null })).toThrow(/Choose in the run settings/)
    expect(runSelectionEffect(ds, selection)).toMatchObject({ missingCells: 4, incompleteSamples: 3, excludedSamples: 0, replacedCells: 0 })
    // complete spectra: nothing is asked
    expect(prepareRunDataset(await ingest(upload({ only: 0 })), selection).effect).toMatchObject({ missingCells: 0, incompleteSamples: 0 })
  })

  it('remove: the affected samples leave the run exactly as io `remove_sample` assembles them', async () => {
    const files = upload({ holes: HOLES, only: 0 })
    const ds = await ingest(files)
    const { dataset: view, effect } = prepareRunDataset(ds, { ...selection, missingSpectra: { action: 'remove_samples' } })
    expect(effect).toMatchObject({ missingCells: 4, incompleteSamples: 3, excludedSamples: 3, replacedCells: 0 })
    expect(ds.nSamples).toBe(51) // `only` wrote the 51 rows with a dry_matter value; the dataset keeps them all
    const owner = await withFeatureNa(files, { policy: 'remove_sample' })
    expect(view.nSamples).toBe(owner.nSamples)
    expect(Array.from(view.X)).toEqual(Array.from(owner.X))
    expect(Array.from(view.y)).toEqual(Array.from(owner.y))
    expect(view.partitions).toEqual(owner.partitions)
    expect(view.missingFeatures).toBeUndefined()
    const result = await run(view)
    expect(result.cv!.predictions).toHaveLength(37) // 39 labelled train rows minus rows 2 and 17
    expect(result.refit.predictions).toHaveLength(11) // 12 test rows minus row 44
  })

  it('replace: the values come from io `replace` on the feature sources only, and every sample runs', async () => {
    const files = upload({ holes: [[2, 4], [2, 5], [17, 4], [44, 3]] })
    const ds = await ingest(files)
    const choice = { action: 'replace', method: 'forward_fill' } as const
    const replaced = await replaceMissingSpectra(ds, choice)
    const { dataset: view, effect } = prepareRunDataset(ds, { ...selection, missingSpectra: choice }, replaced)
    expect(effect).toMatchObject({ missingCells: 4, replacedCells: 4, excludedSamples: 0 })
    expect(view.nSamples).toBe(ds.nSamples)
    expect(Array.from(view.X).every(Number.isFinite)).toBe(true)
    // forward fill within the spectrum: the previous wavelength of the same row
    const [r2, r17] = [rowOf(ds, 2), rowOf(ds, 17)]
    expect(view.X[r2 * P + 4]).toBe(ds.X[r2 * P + 3])
    expect(view.X[r2 * P + 5]).toBe(ds.X[r2 * P + 3])
    expect(view.X[r17 * P + 4]).toBe(ds.X[r17 * P + 3])
    // every other cell is the loaded value, and the missing targets are still missing (never filled)
    expect(Array.from(view.X).filter((v, i) => !Object.is(v, ds.X[i]))).toHaveLength(4)
    expect(ds.targets!.map((target) => target.missing)).toEqual([1, 7, 17])
    expect(Number.isNaN(ds.X[r2 * P + 4])).toBe(true) // the loaded dataset keeps its missing values
    const result = await run(view)
    expect(result.missingTargets).toBe(1)
    expect(result.cv!.predictions.length + result.refit.predictions.length).toBe(51)
    // a constant, also from io
    const constant = await replaceMissingSpectra(ds, { method: 'value', value: 0.25 })
    expect([constant[r2 * P + 4], constant[r2 * P + 5], constant[r17 * P + 4]]).toEqual([0.25, 0.25, 0.25])
    await expect(replaceMissingSpectra(ds, { method: 'value' })).rejects.toThrow(/Enter the number/)
  })

  it('replace: a value io cannot replace within its spectrum is reported, never guessed', async () => {
    const ds = await ingest(upload({ holes: [[44, 0], [2, 4]], only: 0 }))
    const choice = { action: 'replace', method: 'forward_fill' } as const
    const replaced = await replaceMissingSpectra(ds, choice)
    expect(() => prepareRunDataset(ds, { ...selection, missingSpectra: choice }, replaced)).toThrow(/1 of the 2 missing spectral values could not be replaced by nirs4all-io \(no earlier value in their spectrum\)\. Choose another replacement method, or remove the affected samples\./)
    const backward = await replaceMissingSpectra(ds, { method: 'backward_fill' })
    expect(prepareRunDataset(ds, { ...selection, missingSpectra: { action: 'replace', method: 'backward_fill' } }, backward).effect.replacedCells).toBe(2)
  })

  it('replace: a single table holding spectra and targets (io `mixed` source) gets its values replaced too', async () => {
    const rows = TRAIN.slice(0, 30)
    const files = [csv('data.csv', [[...axis, 'dry_matter'].join(','), ...rows.map((i) => [...spectrum(i).map((v, j) => (i === 2 && j === 4 ? '' : v.toFixed(5))), value(i, 0).toFixed(4)].join(','))])]
    const ds = await ingest(files)
    expect(ioRetainedOf(ds)!.spec.sources!.map((source) => source.role)).toEqual(['mixed'])
    expect(ds.missingFeatures).toEqual({ cells: 1, rows: 1, columns: 1 })
    const choice = { action: 'replace', method: 'forward_fill' } as const
    const { dataset: view, effect } = prepareRunDataset(ds, { ...selection, missingSpectra: choice }, await replaceMissingSpectra(ds, choice))
    expect(effect.replacedCells).toBe(1)
    const r2 = ds.sampleIds.findIndex((_, row) => Number.isNaN(ds.X[row * P + 4]))
    expect(view.X[r2 * P + 4]).toBe(ds.X[r2 * P + 3])
    expect(Array.from(view.y)).toEqual(Array.from(selectDatasetTarget(ds, 'dry_matter').y)) // the target column is not touched
  })

  it('remove: a run left with held-out test samples only is refused, never fitted on the test samples', async () => {
    const ds = await ingest(upload({ holes: TRAIN.map((i) => [i, 4] as [number, number]), only: 0 }))
    const { dataset: view, effect } = prepareRunDataset(ds, { ...selection, missingSpectra: { action: 'remove_samples' } })
    expect(effect).toMatchObject({ train: 0, test: 12 })
    expect(view.partitions.every((partition) => partition === 'test')).toBe(true)
    await expect(run(view)).rejects.toThrow(/no train sample left, only held-out test samples/)
  })

  it('leave as is: the pipeline receives the missing values and the refusal says so', async () => {
    const ds = await ingest(upload({ holes: HOLES, only: 0 }))
    const { dataset: view, effect } = prepareRunDataset(ds, { ...selection, missingSpectra: { action: 'keep' } })
    expect(effect).toMatchObject({ missingCells: 4, excludedSamples: 0, replacedCells: 0 })
    expect(view.nSamples).toBe(ds.nSamples)
    expect(Array.from(view.X).filter(Number.isNaN)).toHaveLength(4)
    // the WASM execution path has no NaN-tolerant route: dag-ml-data refuses the first non-finite cell
    const refusal = await run(view).then(() => null, (error: unknown) => error as { rtError?: { detail?: string } })
    expect(refusal?.rtError?.detail).toMatch(/f64 feature matrix `X` value \d+ is not finite/)
    expect(keptMissingSpectraNotice(effect)).toMatch(/left the 4 missing spectral values as they are .* accepts only finite spectral values .* Choose “Remove” or “Replace”/)
    expect(keptMissingSpectraNotice(prepareRunDataset(ds, { ...selection, missingSpectra: { action: 'remove_samples' } }).effect)).toBeNull()
  })
})

/** The same files assembled by nirs4all-io under an explicit NA policy on the feature sources only. */
async function withFeatureNa(files: { name: string; bytes: Uint8Array }[], na: Record<string, unknown>): Promise<MaterializedDataset> {
  const analysis = await analyzeFiles(files)
  const spec = structuredClone(analysis.plan!.resolved_spec!)
  for (const source of spec.sources!) if (source.role === 'features') source.params = { ...source.params, na }
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
    const remove = { action: 'remove_samples' } as const
    expect(runSelectionEffect(withIds, { target: 'p', missingValues: 'exclude_samples', missingSpectra: remove })).toMatchObject({ train: 1, test: 1, missingTargets: 0, incompleteSamples: 1, missingCells: 1, excludedSamples: 1 })
    const { dataset: view } = prepareRunDataset(withIds, { target: 'g', missingValues: 'exclude_samples', missingSpectra: remove })
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
  })
})
