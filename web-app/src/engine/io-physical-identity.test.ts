// Production-path regression of the served replicates failure (browser r3): real Formats + IO
// ingestion of the replicates-smoke upload layout (positional X/Y with Sample_ID only in a
// metadata file), the structured clone the engine worker receives, and the engine identity,
// refusal and score grain. Inputs are the smoke's own generators; no data is altered.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ingestFiles } from '@/data/wasm-io'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from './wasm/datasets/nirs4all_datasets_wasm.js'
import { DagMlEngine } from './dagml-engine'
import { MainEngine } from './main-engine'
import { classificationMetrics, regressionMetrics } from './metrics'
import { datasetRelations, physicalIdentity } from './relations'
import { IO_RECORD, type MaterializedDataset, type PipelineDSL } from './types'

vi.mock('./metrics', async (original) => {
  const actual = await original<typeof import('./metrics')>()
  return { ...actual, regressionMetrics: vi.fn(actual.regressionMetrics), classificationMetrics: vi.fn(actual.classificationMetrics) }
})

beforeAll(() => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
})

// --- tests/replicates-smoke.mjs generators, verbatim semantics ---
const P = 24
const axis = Array.from({ length: P }, (_, j) => 1100 + 20 * j).join(',')
const spectrum = (i: number) => Array.from({ length: P }, (_, j) => (Math.sin(i * 0.7 + j * 0.3) * 0.2 + (i % 7) * 0.05 + j * 0.01 + 0.5).toFixed(5)).join(',')
const target = (i: number) => (Math.sin(i * 0.7) * 2 + (i % 7) * 0.5 + 10).toFixed(3)
const MISSING = new Set([5, 47])
const encoder = new TextEncoder()
const csv = (name: string, lines: string[]) => ({ name, bytes: encoder.encode(lines.join('\r\n') + '\r\n') })
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k)
function files(part: string, rows: number[], idOf: (i: number) => string, year: number) {
  return [
    csv(`X${part}.csv`, [axis, ...rows.map(spectrum)]),
    csv(`Y${part}.csv`, ['Prot', ...rows.map((i) => (MISSING.has(i) ? 'NA' : target(i)))]),
    csv(`M${part}.csv`, ['Year,Sample_ID,Rep', ...rows.map((i, k) => `${year},${idOf(i)},Mesure_${k % 3 + 1}`)]),
  ]
}
const original = () => [
  ...files('val', range(42, 54), (i) => `BGE${Math.floor((i - 42) / 2)}`, 2023),
  ...files('cal', range(0, 42), (i) => `BGE${Math.floor(i / 3)}`, 2022),
]
const NA_SAMPLES = new Set(['CAL1', 'VAL3'])
const calId = (i: number) => `CAL${Math.floor(i / 3)}`
const valId = (i: number) => `VAL${Math.floor((i - 42) / 2)}`
// `blank`: scans whose Sample_ID metadata cell is left empty (spectra and targets unchanged).
function consistentFiles(part: string, rows: number[], idOf: (i: number) => string, year: number, blank: ReadonlySet<number>) {
  return [
    csv(`X${part}.csv`, [axis, ...rows.map(spectrum)]),
    csv(`Y${part}.csv`, ['Prot', ...rows.map((i) => (NA_SAMPLES.has(idOf(i)) ? 'NA' : target(Number(idOf(i).slice(3)) + (part === 'val' ? 100 : 0))))]),
    csv(`M${part}.csv`, ['Year,Sample_ID,Rep', ...rows.map((i, k) => `${year},${blank.has(i) ? '' : idOf(i)},Mesure_${k % 3 + 1}`)]),
  ]
}
const consistent = (blank: ReadonlySet<number> = new Set()) => [...consistentFiles('val', range(42, 54), valId, 2023, blank), ...consistentFiles('cal', range(0, 42), calId, 2022, blank)]

const ingest = async (inputs: { name: string; bytes: Uint8Array }[]) => (await ingestFiles(inputs, 'replicates')).dataset
const ridge: PipelineDSL = { name: 'ridge', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 0.1 } }, cv: { folds: 4, seed: 7 } }
// The worker receives the dataset through postMessage, i.e. the HTML structured clone.
const throughWorker = (ds: MaterializedDataset): MaterializedDataset => structuredClone(ds)

describe('served replicates layout through real nirs4all-io and the worker clone', () => {
  it('keeps the io projection across the worker clone; only the retained io record is dropped', async () => {
    const ds = await ingest(original())
    expect(ds.nSamples).toBe(54)
    // io keeps rows positional when Sample_ID lives only in the metadata file (owner behaviour)
    expect(ds.identity?.basis).toBe('positional')
    expect(ds.metadata?.some((c) => c.name.endsWith('Sample_ID'))).toBe(true)
    const cloned = throughWorker({ ...ds, repetition: 'Sample_ID' })
    expect(cloned[IO_RECORD]).toBeUndefined()
    expect(cloned.sampleIds).toEqual(ds.sampleIds)
    expect(cloned.identity).toEqual(ds.identity)
    expect(cloned.repetition).toBe('Sample_ID')
  })

  it('refuses, before any fit, a declared physical Sample_ID shared by cal (Train) and val (held-out Test)', async () => {
    const ds = throughWorker({ ...(await ingest(original())), repetition: 'Sample_ID' })
    expect(() => physicalIdentity(ds)).toThrow(/Physical sample "BGE0" has scans in Train .* held-out Test partition/)
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, ridge)).rejects.toThrow(/held-out Test partition/)
  })

  it('without a declaration the rows stay the explicit positional independent-row profile, labelled as such', async () => {
    const ds = throughWorker(await ingest(consistent()))
    const identity = physicalIdentity(ds)
    expect(identity.physicalKey).toBe('row')
    expect(identity.repeated).toBe(false)
    // host-row scores over scans: no physical-sample count is claimed
    const run = await new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(ds, ridge)
    for (const node of [run.cv!, run.refit, ...run.folds]) {
      expect(node.scoreContext).toMatchObject({ physicalKey: 'row', unit: 'observation', aggregation: 'host-rows', nPhysicalSamples: null })
    }
    expect(run.cv!.scoreContext!.nObservations).toBe(run.cv!.predictions.length)
  })

  it('refuses before fit an empty declared Sample_ID on a fitted/scored scan (no fallback to the row)', async () => {
    const ds = throughWorker({ ...(await ingest(consistent(new Set([0])))), repetition: 'Sample_ID' })
    expect(() => physicalIdentity(ds)).toThrow(/declared repetition column "Sample_ID" is empty on 1 scan\(s\) that are fitted or scored/)
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, ridge)).rejects.toThrow(/is empty on 1 scan/)
  })

  it('keeps an empty declared Sample_ID on a target-missing scan as its own unit, without changing the scored samples', async () => {
    // row 3 is a scan of CAL1, whose reference is NA: never fitted or scored
    const ds = throughWorker({ ...(await ingest(consistent(new Set([3])))), repetition: 'Sample_ID' })
    const identity = physicalIdentity(ds)
    expect(identity.physicalKey).toBe('repetition')
    // locate the blank scan by identity, not by position (io owns the partition row order)
    const blankRows = identity.physicalLabel.flatMap((label, i) => (label === null ? [i] : []))
    expect(blankRows).toHaveLength(1)
    expect(Number.isNaN(ds.y[blankRows[0]])).toBe(true)
    expect(identity.handles).toHaveLength(21) // 20 physical samples + the unlabelled inactive scan
    expect(datasetRelations(ds)[blankRows[0]].metadata.physical_key).toBe('row')
    const run = await new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(ds, ridge)
    expect(run.cv!.scoreContext).toMatchObject({ physicalKey: 'repetition', aggregation: 'dag:sample:mean', nPhysicalSamples: 13 })
    expect(run.refit.scoreContext).toMatchObject({ nPhysicalSamples: 5 })
  })

  it('keys the declared Sample_ID as the physical sample in DMD relations and scores it at the physical-sample level', async () => {
    vi.mocked(regressionMetrics).mockClear()
    vi.mocked(classificationMetrics).mockClear()
    const ds = throughWorker({ ...(await ingest(consistent())), repetition: 'Sample_ID' })
    const identity = physicalIdentity(ds)
    expect(identity.physicalKey).toBe('repetition')
    expect(identity.repeated).toBe(true)
    expect(identity.handles).toHaveLength(20) // 14 cal + 6 val physical samples
    const relations = datasetRelations(ds)
    expect(new Set(relations.map((r) => r.observation_id)).size).toBe(54)
    const cal0 = relations.filter((r) => r.metadata.original_repetition === 'CAL0')
    expect(cal0).toHaveLength(3)
    expect(new Set(cal0.map((r) => r.sample_id)).size).toBe(1)
    const run = await new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(ds, ridge)
    expect(regressionMetrics).not.toHaveBeenCalled()
    expect(classificationMetrics).not.toHaveBeenCalled()
    expect(run.cv!.scoreContext).toMatchObject({ physicalKey: 'repetition', unit: 'sample', aggregation: 'dag:sample:mean', nPhysicalSamples: 13 })
    expect(run.refit.scoreContext).toMatchObject({ physicalKey: 'repetition', aggregation: 'dag:sample:mean', nPhysicalSamples: 5 })
    const foldOf = new Map<string, number>()
    run.folds.forEach((fold, k) => fold.predictions.forEach((r) => {
      expect(foldOf.has(r.sampleId)).toBe(false)
      foldOf.set(r.sampleId, k)
    }))
    expect([...foldOf.keys()].every((id) => /^CAL\d+$/.test(id))).toBe(true)
    expect(foldOf.size).toBe(13)
  })
})
