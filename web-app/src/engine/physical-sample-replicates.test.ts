// Physical-sample identity of repeated scans (profile P2) on a separate, small positive
// fixture whose scans of one Sample_ID share one reference value (the dag-ml-data target
// grain). The original replicate fixture stays a failure regression in
// missing-targets-replicates.test.ts. Assertions are structural: identity, folds, the
// DAG-ML ScoreSet/REFIT provenance and the absence of host metrics — no fitted oracle.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { RawFile } from '@/data/dataset'
import { mapAssembledToMaterialized, type AssembledFull } from '@/data/wasm-io'
import type { AssembledAxis, AssembledDataset } from './wasm/io/types/nirs4all-io'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from './wasm/datasets/nirs4all_datasets_wasm.js'
import * as dagml from './wasm/dagml/dag_ml_wasm.js'
import { DagMlEngine } from './dagml-engine'
import { MainEngine } from './main-engine'
import { buildNativeFolds } from './grouped-cv'
import { classificationMetrics, regressionMetrics } from './metrics'
import { trainRowsOf } from './partition'
import { tryRunPortableCore } from './portable-core'
import { datasetRelations, hasCvGroups, physicalIdentity } from './relations'
import type { FittedState } from './orchestrate'
import type { NativeRefitState } from './dagml-refit'
import type { PipelineDSL } from './types'

vi.mock('./metrics', async (original) => {
  const actual = await original<typeof import('./metrics')>()
  return { ...actual, regressionMetrics: vi.fn(actual.regressionMetrics), classificationMetrics: vi.fn(actual.classificationMetrics) }
})
vi.mock('./portable-core', async (original) => {
  const actual = await original<typeof import('./portable-core')>()
  return { ...actual, tryRunPortableCore: vi.fn(actual.tryRunPortableCore) }
})

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
})

const P = 6
const spectrum = (i: number) => Array.from({ length: P }, (_, j) => (Math.sin(i * 1.3 + j) + j * 0.1 + (i % 5) * 0.2).toFixed(4))
const reference = (sample: number) => (2 * Math.sin(sample * 1.7) + (sample % 4) * 0.4 + 10).toFixed(4)
const axis = Array.from({ length: P }, (_, j) => 1000 + 10 * j).join(';')
/** `rows` scans; scan `i` belongs to physical sample `sampleOf(i)` and carries its reference. */
function files(prefix: string, rows: number[], sampleOf: (i: number) => number, code: (sample: number) => string): RawFile[] {
  return [
    { name: `X${prefix}.csv`, text: [axis, ...rows.map((i) => spectrum(i).join(';'))].join('\n') },
    { name: `Y${prefix}.csv`, text: ['y', ...rows.map((i) => reference(sampleOf(i)))].join('\n') },
    { name: `M${prefix}.csv`, text: ['Sample_ID;Rep', ...rows.map((i, k) => `${code(sampleOf(i))};Scan_${k % 3}`)].join('\n') },
  ]
}
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k)
// 24 cal scans = 8 physical samples x 3; 8 val scans = 4 OTHER physical samples x 2.
// Retain the original CSV bytes as fixture provenance. The test-only CSV oracle
// cannot recognize the all-text metadata header; engine input uses IO's DTO seam.
const physicalCsvProvenance = [
  ...files('cal', range(0, 24), (i) => Math.floor(i / 3), (s) => `CAL${s}`),
  ...files('val', range(24, 32), (i) => 100 + Math.floor((i - 24) / 2), (s) => `VAL${s}`),
]

/** Owner float64 wire: selected little-endian bytes and the aligned validity mask. */
function numericWire(data: Float64Array, n_rows: number, n_cols: number) {
  const bytes = new DataView(new ArrayBuffer(data.length * 8))
  data.forEach((value, i) => bytes.setFloat64(i * 8, value, true))
  return {
    dtype: 'float64' as const, n_rows, n_cols,
    data_bytes_hex: Array.from(new Uint8Array(bytes.buffer), (b) => b.toString(16).padStart(2, '0')).join(''),
    validity: Array.from(data, () => true),
    precision: { dtype: 'float64' as const, origin: 'default' as const, source_dtype: null, requested_dtype: null, consumer: null },
  }
}

function physicalBlock(rows: number[], sampleOf: (i: number) => number, code: (sample: number) => string) {
  const X = Float64Array.from(rows.flatMap((i) => spectrum(i).map(Number)))
  const y = Float64Array.from(rows, (i) => Number(reference(sampleOf(i))))
  const coordinates = Float64Array.from({ length: P }, (_, j) => 1000 + 10 * j)
  const featureAxis: AssembledAxis = {
    name: 'wavelength', unit: 'nm',
    coordinates: { kind: 'numeric', count: P, data_bytes_hex: numericWire(coordinates, 1, P).data_bytes_hex },
  }
  const block = {
    n_samples: rows.length, source_ids: ['x'],
    x: [{ ...numericWire(X, rows.length, P), data: X }],
    feature_headers: [Array.from(coordinates, String)], feature_names: [null],
    feature_axes: [[featureAxis]],
    representation_ids: ['signal_1d'], header_units: ['nm'], signal_types: ['absorbance'],
    y: { columns: [{ name: 'y', kind: 'numeric' as const, block: numericWire(y, rows.length, 1) }], data: y },
    y_headers: ['y'], y_categorical: {},
    metadata: { n_rows: rows.length, columns: [
      { name: 'Sample_ID', values: rows.map((i) => code(sampleOf(i))) },
      { name: 'Rep', values: rows.map((_, k) => `Scan_${k % 3}`) },
    ] },
    weights: null, weights_header: null, processings: [[]],
  } satisfies AssembledDataset['blocks'][string] & AssembledFull['blocks'][string]
  return block
}

function physical() {
  const record = {
    assembled_schema_version: 3, name: 'Physical sample fixture', task_type: 'regression', signal_type: 'absorbance', n_sources: 1,
    partition_order: ['cal', 'val'],
    blocks: {
      cal: physicalBlock(range(0, 24), (i) => Math.floor(i / 3), (s) => `CAL${s}`),
      val: physicalBlock(range(24, 32), (i) => 100 + Math.floor((i - 24) / 2), (s) => `VAL${s}`),
    },
    identity: { provenance: { source_ids: ['x'], sample_id: 'Sample_ID', observation_id: 'Rep', repetition_id: null, group_id: null } },
    folds: [], fold_provenance: [], repetition: null, aggregate: null, warnings: [], audits: [],
  } satisfies AssembledDataset & AssembledFull
  const ds = mapAssembledToMaterialized(record)
  expect(ds.identity).toEqual({ basis: 'declared', sampleIdColumn: 'Sample_ID', observationIdColumn: 'Rep' })
  expect(ds.sampleIdColumn).toBe('Sample_ID')
  expect(ds.observationIds).toEqual([...range(0, 24), ...range(0, 8)].map((k) => `Scan_${k % 3}`))
  expect(new Set(ds.sampleIds.map((id, i) => JSON.stringify([ds.partitionNames![i], id, ds.observationIds![i]]))).size).toBe(32)
  const identity = physicalIdentity(ds)
  expect(identity.repeated).toBe(true)
  expect(identity.handles).toHaveLength(12)
  expect(new Set(identity.sampleHandle.filter((_, i) => ds.partitions[i] === 'train')).size).toBe(8)
  expect(new Set(identity.sampleHandle.filter((_, i) => ds.partitions[i] === 'test')).size).toBe(4)
  return ds
}
const ridge: PipelineDSL = { name: 'ridge', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 0.1 } }, cv: { folds: 4, seed: 7 } }

describe('repeated scans are one physical sample in DAG-ML relations, folds and scores', () => {
  it('maps scans to observation handles s{i} and physical samples to p{k}, keeping the original ids', () => {
    const ds = physical()
    const identity = physicalIdentity(ds)
    expect(identity.repeated).toBe(true)
    expect(identity.handles).toHaveLength(12)
    expect(hasCvGroups(ds)).toBe(false)
    const relations = datasetRelations(ds)
    expect(relations.map((r) => r.observation_id)).toEqual(range(0, 32).map((i) => `s${i}`))
    expect(relations.slice(0, 3).map((r) => r.sample_id)).toEqual(['p0', 'p0', 'p0'])
    expect(relations.slice(0, 3).map((r) => r.metadata.original_sample_id)).toEqual(['CAL0', 'CAL0', 'CAL0'])
    expect(relations.every((r) => r.group_id === null)).toBe(true)
  })

  it('builds native folds over physical samples, so no fold separates the scans of one sample', () => {
    const ds = physical()
    const folds = buildNativeFolds(dagml, ds, { folds: 4, seed: 7 }, trainRowsOf(ds))
    expect(folds.sample_ids).toHaveLength(8)
    expect(new Set(folds.folds.flatMap((fold) => fold.validation_sample_ids)).size).toBe(8)
    for (const fold of folds.folds) expect(fold.train_sample_ids.some((id) => fold.validation_sample_ids.includes(id))).toBe(false)
  })

  it('refuses a row-wise split of repeated scans', async () => {
    const ds = physical()
    ds.partitions = ds.partitions.map(() => 'train' as const)
    ds.partitionNames = ds.partitions.map(() => 'train')
    ds.heldOutName = undefined
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, { ...ridge, split: { id: 's', type: 'n4m:splitters.kennard_stone', params: {} } }))
      .rejects.toThrow(/cannot separate the repeated scans/)
  })

  it('runs FIT_CV, SELECT, REFIT and held-out scoring natively at the physical-sample level', async () => {
    vi.mocked(regressionMetrics).mockClear()
    vi.mocked(classificationMetrics).mockClear()
    vi.mocked(tryRunPortableCore).mockClear()
    const ds = physical()
    const run = await new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(ds, ridge)
    expect(tryRunPortableCore).not.toHaveBeenCalled()
    expect(regressionMetrics).not.toHaveBeenCalled()
    expect(classificationMetrics).not.toHaveBeenCalled()
    // Counts are scoped to the scored cohort: 8 cal samples x 3 scans in CV, 4 val samples x 2 scans held out.
    expect(run.cv!.scoreContext).toMatchObject({ unit: 'sample', aggregation: 'dag:sample:mean', nPhysicalSamples: 8, nObservations: 24, rawObservationMetrics: 'not-computed' })
    expect(run.refit.scoreContext).toMatchObject({ nPhysicalSamples: 4, nObservations: 8, rawObservationMetrics: 'not-computed' })
    // Raw parallel metric reports are not requested (no owner runtime scorer): only sample-level owner scores exist.
    expect((run.lineage as { aggregationPolicy: { emit_parallel_metrics: boolean } }).aggregationPolicy.emit_parallel_metrics).toBe(false)
    expect(run.cv!.metrics.n).toBe(8)
    expect(new Set(run.cv!.predictions.map((r) => r.sampleId))).toEqual(new Set(range(0, 8).map((s) => `CAL${s}`)))
    const foldOf = new Map<string, number>()
    run.folds.forEach((fold, k) => fold.predictions.forEach((r) => {
      expect(foldOf.has(r.sampleId)).toBe(false)
      foldOf.set(r.sampleId, k)
    }))
    expect(foldOf.size).toBe(8)
    expect(run.refit.name).toBe('Refit · test')
    expect(run.refit.metrics.n).toBe(4)
    expect(run.refit.predictions.map((r) => r.sampleId)).toEqual(range(100, 104).map((s) => `VAL${s}`))
    const lineage = run.lineage as { executed: boolean; scoreSet: { reports: { level: string; partition: string; fold_id: string; row_count: number }[] } }
    expect(lineage.executed).toBe(true)
    expect(lineage.scoreSet.reports.some((r) => r.level === 'sample' && r.partition === 'validation' && r.fold_id === 'avg' && r.row_count === 8)).toBe(true)
    const pkg = JSON.parse((run.model.state as FittedState & { nativeRefit: NativeRefitState }).nativeRefit.packageJson)
    expect(pkg.training_sample_ids).toEqual(range(0, 8).map((k) => `p${k}`))

    // Raw per-scan predictions are retained as data (no metric on them), with the exact
    // execution-handle -> original id mapping (declared observation ids, when the loader declared any).
    const raw = run.rawObservationPredictions!
    expect(raw.cv).toHaveLength(run.folds.length)
    expect(raw.cv.flatMap((block) => block.observation_ids).sort()).toEqual(range(0, 24).map((i) => `s${i}`).sort())
    expect(raw.cv.every((block) => block.partition === 'validation' && block.values.length === block.observation_ids.length && block.values.every((row) => row.length === 1))).toBe(true)
    // fold provenance: each fold's raw scans belong exactly to that fold's physical samples
    expect(new Set(raw.cv.map((block) => block.fold_id)).size).toBe(run.folds.length)
    for (const block of raw.cv) {
      const samples = new Set(block.observation_ids.map((id) => raw.identity[id].sampleId))
      const fold = run.folds.find((node) => new Set(node.predictions.map((r) => r.sampleId)).has([...samples][0]))!
      expect(samples).toEqual(new Set(fold.predictions.map((r) => r.sampleId)))
      expect(block.observation_ids.length).toBe(3 * samples.size)
    }
    // held-out replay: exact predict:s{j} -> s{dataset row}, dataset order preserved
    expect(raw.heldout.partition).toBe('test')
    expect(raw.heldout.observation_ids).toEqual(range(24, 32).map((i) => `s${i}`))
    expect(raw.heldout.values).toHaveLength(8)
    expect(raw.heldout.observation_ids.map((id) => raw.identity[id].sampleId)).toEqual(['VAL100', 'VAL100', 'VAL101', 'VAL101', 'VAL102', 'VAL102', 'VAL103', 'VAL103'])
    expect(raw.identity.s0).toEqual({ sampleId: 'CAL0', observationId: ds.observationIds?.[0] ?? null })
    expect(raw.identity.s25).toEqual({ sampleId: 'VAL100', observationId: ds.observationIds?.[25] ?? null })
    expect(Object.keys(raw.identity)).toHaveLength(32)
    // still no host metric on the raw rows
    expect(regressionMetrics).not.toHaveBeenCalled()
  })
})
