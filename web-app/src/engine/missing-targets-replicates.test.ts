// Non-regression for calibration-breaking data bugs:
// - a missing target was served as 0 by the dag-ml-data provider (JSON NaN -> null
//   -> Number(null)) and fitted / scored as y=0; a missing class label became a class;
// - duplicate Sample_IDs (replicate scans) were refused since 326b996, while v0.3.1
//   loaded them; replicates group only through an explicit repetition column.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDataset, type RawFile } from '@/data/dataset'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from './wasm/datasets/nirs4all_datasets_wasm.js'
import { materializeViaProvider } from './dagml-data'
import { DagMlEngine } from './dagml-engine'
import { buildNativeFolds } from './grouped-cv'
import * as dagml from './wasm/dagml/dag_ml_wasm.js'
import { trainRowsOf } from './partition'
import { datasetRelations } from './relations'
import type { MaterializedDataset, PipelineDSL, RunResult } from './types'

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
})

const P = 6
const spectrum = (i: number) => Array.from({ length: P }, (_, j) => (Math.sin(i * 1.3 + j) + j * 0.1 + (i % 5) * 0.2).toFixed(4))
const target = (i: number) => (2 * Math.sin(i * 1.3) + (i % 5) * 0.4 + 10).toFixed(4)
const axis = Array.from({ length: P }, (_, j) => 1000 + 10 * j).join(';')
/** CSV files for `rows` (row indices), optionally with a Sample_ID metadata file. */
function csv(prefix: string, rows: number[], y: (i: number) => string, ids?: (i: number) => string): RawFile[] {
  return [
    { name: `X${prefix}.csv`, text: [axis, ...rows.map((i) => spectrum(i).join(';'))].join('\n') },
    { name: `Y${prefix}.csv`, text: ['y', ...rows.map(y)].join('\n') },
    ...(ids ? [{ name: `M${prefix}.csv`, text: ['Sample_ID;Rep;Year', ...rows.map((i, k) => `${ids(i)};Mesure_${k};${prefix === 'cal' ? 2022 : 2023}`)].join('\n') }] : []),
  ]
}
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k)
const ridge: PipelineDSL = { name: 'ridge', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 0.1 } }, cv: { folds: 4, seed: 7 } }
const MISSING = new Set([3, 11, 33])
const withMissing = () => buildDataset([...csv('cal', range(0, 30), (i) => (MISSING.has(i) ? 'NA' : target(i))), ...csv('val', range(30, 40), (i) => (MISSING.has(i) ? 'NA' : target(i)))])
const labeledOnly = () => buildDataset([...csv('cal', range(0, 30).filter((i) => !MISSING.has(i)), target), ...csv('val', range(30, 40).filter((i) => !MISSING.has(i)), target)])
const ids = (run: RunResult, scope: 'cv' | 'refit') => (scope === 'cv' ? run.cv! : run.refit).predictions.map((r) => r.sampleId)

describe('missing targets never become 0 and never enter FIT or scoring', () => {
  it('keeps a missing regression target out of the provider target table and serves NaN, not 0', async () => {
    const ds = withMissing()
    expect(ds.taskType).toBe('regression')
    expect(Number.isNaN(ds.y[3])).toBe(true)
    const served = await materializeViaProvider(ds)
    expect(Number.isNaN(served.y[3])).toBe(true)
    expect(Number.isNaN(served.y[33])).toBe(true)
    expect(served.y[0]).toBeCloseTo(Number(target(0)))
    expect(datasetRelations(ds).filter((r) => r.excluded).map((r) => r.sample_id)).toEqual(['p3', 'p11', 'p33'])
    expect(datasetRelations(ds).filter((r) => r.excluded).map((r) => r.observation_id)).toEqual(['s3', 's11', 's33'])
  })

  it('excludes missing-target rows from dag-ml CV and REFIT, counts them, and fits as if they were absent', async () => {
    const run = await new DagMlEngine({ profile: 'strict-wasm' }).run(withMissing(), ridge)
    const reference = await new DagMlEngine({ profile: 'strict-wasm' }).run(labeledOnly(), ridge)
    expect(run.missingTargets).toBe(3)
    expect(reference.missingTargets).toBeUndefined()
    expect(run.cv!.predictions).toHaveLength(28)
    expect(run.cv!.predictions.every((r) => Number.isFinite(r.actual))).toBe(true)
    expect(ids(run, 'cv')).not.toContain('train-3')
    expect(run.refit.predictions).toHaveLength(9)
    // REFIT sees exactly the labeled training rows: identical held-out predictions.
    run.refit.predictions.forEach((r, k) => expect(r.predicted).toBeCloseTo(reference.refit.predictions[k].predicted, 10))
    expect(run.refit.metrics.rmse).toBeCloseTo(reference.refit.metrics.rmse!, 10)
  })

  it('does not turn a missing class label into a class', async () => {
    const labels = (i: number) => (i === 4 || i === 31 ? 'NA' : i % 2 ? 'pear' : 'apple')
    const files = [...csv('cal', range(0, 30), labels), ...csv('val', range(30, 40), labels)]
    // the class file has a header the numeric heuristic cannot see; drop it
    for (const f of files) if (f.name.startsWith('Y')) f.text = f.text.split('\n').slice(1).join('\n')
    const ds = buildDataset(files)
    expect(ds.taskType).toBe('binary')
    expect(Number.isNaN(ds.y[4])).toBe(true)
    expect(ds.classes![4]).toBe('')
    const served = await materializeViaProvider(ds)
    expect(Number.isNaN(served.y[4])).toBe(true)
    const run = await new DagMlEngine({ profile: 'strict-wasm' }).run(ds, { ...ridge, cv: { folds: 3, seed: 7 } })
    expect(run.model.classes).toEqual(['apple', 'pear'])
    expect(run.missingTargets).toBe(2)
    expect(run.cv!.predictions).toHaveLength(29)
    expect(run.refit.predictions).toHaveLength(9)
    expect(run.cv!.confusion!.labels).toEqual(['apple', 'pear'])
  })
})

// The original replicate fixture is kept byte-for-byte: its scans of one Sample_ID carry
// DIFFERENT targets and its val file reuses cal Sample_IDs. Both violate the declared owner
// identity contract (one target per physical sample; one physical sample never both trained
// on and held out), so they are failure regressions now, never relabelled into rows.
describe('replicate scans (duplicate Sample_IDs)', () => {
  // 30 cal rows = 10 physical samples x 3 scans; val reuses codes for other samples.
  const replicates = (): MaterializedDataset => buildDataset([
    ...csv('cal', range(0, 30), target, (i) => `BGE${Math.floor(i / 3)}`),
    ...csv('val', range(30, 40), target, (i) => `BGE${i - 30}`),
  ])

  it('loads Xcal/Xval with repeated ids and refuses to run a sample shared by cal and val (regression of 326b996)', async () => {
    const ds = replicates()
    expect(ds.partitions.filter((p) => p === 'train')).toHaveLength(30)
    expect(ds.partitions.filter((p) => p === 'test')).toHaveLength(10)
    expect(ds.sampleIds.slice(0, 3)).toEqual(['BGE0', 'BGE0', 'BGE0'])
    expect(ds.sampleIdColumn).toBe('Sample_ID')
    expect(ds.repetition).toBeUndefined()
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, ridge)).rejects.toThrow(/Physical sample "BGE0" has scans in Train .* held-out Test partition/)
  })

  it('refuses the same shared sample when the repetition column is declared', async () => {
    const ds = { ...replicates(), repetition: 'Sample_ID' }
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, ridge)).rejects.toThrow(/held-out Test partition/)
  })

  it('refuses scans of one physical sample with different targets even without a held-out reuse', () => {
    const ds = replicates()
    ds.partitions = ds.partitions.map(() => 'train' as const)
    expect(() => datasetRelations(ds)).toThrow(/Physical sample "BGE0" has different targets on its scans/)
  })

  it('never detaches cal/val code reuse with a partition prefix, and still names a missing repetition column', () => {
    const ds = { ...replicates(), repetition: 'Sample_ID' }
    expect(() => datasetRelations(ds)).toThrow(/held-out Test partition/)
    expect(() => datasetRelations({ ...withMissing(), repetition: 'Batch' })).toThrow('Repetition column not found in the dataset metadata: Batch')
  })

  it('refuses the shared sample before relations even with an augmentation', () => {
    const base = replicates()
    const ds = {
      ...base,
      repetition: 'Rep',
      sampleIds: base.sampleIds.map((id, i) => (i === 0 ? 'ORIGIN' : i === 29 ? 'AUG' : id)),
      originIds: base.sampleIds.map((_, i) => (i === 29 ? 'ORIGIN' : null)),
      augmented: base.sampleIds.map((_, i) => i === 29),
    }
    expect(() => datasetRelations(ds)).toThrow(/held-out Test partition/)
  })
})


it('records missing training targets in the native FoldSet and keeps them predictable', async () => {
  const ds = withMissing()
  const folds = buildNativeFolds(dagml, ds, { folds: 3, seed: 42 }, trainRowsOf(ds))
  expect(folds.target_missing_sample_ids).toEqual(['p11', 'p3'])
  for (const fold of folds.folds) {
    expect([...fold.train_sample_ids, ...fold.validation_sample_ids]).not.toContain('p3')
    expect([...fold.train_sample_ids, ...fold.validation_sample_ids]).not.toContain('p11')
  }
  const engine = new DagMlEngine({ profile: 'strict-wasm' })
  const run = await engine.run(ds, ridge)
  const prediction = await engine.predict(run.model, ds.X, ds.nSamples, ds.nFeatures)
  expect(prediction.values.length).toBe(ds.nSamples)
  expect(Number.isFinite(prediction.values[3])).toBe(true)
})
