import { describe, expect, it, vi } from 'vitest'
import { IO_RECORD } from '@/engine/types'
import {
  type AssembledFull,
  assembleDataset,
  classifyIoPartition,
  datasetSpecInputName,
  ingestFiles,
  IoIngestionRefusal,
  ioRetainedOf,
  mapAssembledToMaterialized,
  resumeIngestion,
} from './wasm-io'

// nirs4all-io assembles X/y (roles, joins, partitions, identity) in Rust → WASM; Web only
// maps its AssembledDataset.to_full_value() onto MaterializedDataset. The fixtures below use
// the real wire of the WASM binding: every matrix carries `data` (logical Float64Array, row-major)
// plus the owner `validity` mask, `y` is `{ columns: [{ name, kind, block }], data }` and every
// feature axis carries its exact coordinates as an owner `numeric` packet.
const io = vi.hoisted(() => ({
  specs: [] as string[],
  plan: { warnings: ['io says no'], resolved_spec: null } as unknown,
  record: null as unknown,
}))
vi.mock('@/engine/nirs4all-core', () => ({
  loadDataIoWasm: async () => ({ formats: {}, io: {
    assembleDataset: (_files: unknown, _records: unknown, spec: string) => {
      io.specs.push(spec)
      return io.record
    },
    inferDataset: () => io.plan,
  } }),
}))

/** The owner numeric-coordinate packet: little-endian binary64, lowercase hex. */
const packet = (values: number[]) => {
  const view = new DataView(new ArrayBuffer(values.length * 8))
  values.forEach((v, i) => view.setFloat64(i * 8, v, true))
  return { kind: 'numeric' as const, count: values.length, data_bytes_hex: Array.from(new Uint8Array(view.buffer), (b) => b.toString(16).padStart(2, '0')).join('') }
}
const axes = (values: number[], unit: string | null = 'nm') => [[{ name: 'wavelength', unit, coordinates: packet(values) }]]
const mat = (data: number[], n_rows: number, n_cols: number, validity: boolean[] = data.map(() => true)) =>
  ({ data: Float64Array.from(data), n_rows, n_cols, validity })
type Column = { name: string; kind?: 'numeric' | 'classification_integer' | 'classification_string'; values: number[]; valid?: boolean[] }
/** Owner target table: per-column `block` masks, row-major `data`. */
const targets = (columns: Column[]) => {
  const rows = columns[0].values.length
  return {
    columns: columns.map((c) => ({ name: c.name, kind: c.kind ?? 'numeric', block: { n_rows: rows, n_cols: 1, validity: c.valid ?? c.values.map(() => true) } })),
    data: Float64Array.from(Array.from({ length: rows }, (_, r) => columns.map((c) => c.values[r])).flat()),
  }
}
const block = (b: Partial<AssembledFull['blocks'][string]>): AssembledFull['blocks'][string] => ({
  n_samples: 0,
  x: [],
  feature_headers: [],
  header_units: [],
  signal_types: [],
  y: null,
  y_headers: [],
  metadata: null,
  weights: null,
  weights_header: null,
  ...b,
})
const full = (blocks: AssembledFull['blocks'], extra: Partial<AssembledFull> = {}): AssembledFull =>
  ({ name: 'd', task_type: 'regression', signal_type: 'absorbance', n_sources: 1, blocks, folds: [], ...extra })
const part = (rows: number, b: Partial<AssembledFull['blocks'][string]> = {}) =>
  block({ n_samples: rows, x: [mat(Array.from({ length: rows * 2 }, (_, i) => i + 1), rows, 2)], feature_headers: [['1', '2']], feature_axes: axes([1, 2]), header_units: ['nm'], y: targets([{ name: 'y', values: Array.from({ length: rows }, (_, i) => (i + 1) * 1.5) }]), y_headers: ['y'], ...b })

describe('datasetSpecInputName', () => {
  it('uses the resolved feature role when metadata and targets are listed first', () => {
    expect(datasetSpecInputName({ resolved_spec: { sources: [
      { id: 'm', role: 'metadata', input: 'Mtrain.csv' },
      { id: 'y', role: 'targets', input: 'Ytrain.csv' },
      { id: 'x', role: 'features', input: ['spectra.spc', 'more-spectra.spc'] },
    ] } })).toBe('spectra.spc')
  })

  it('accepts a scalar feature input and leaves missing inference unnamed', () => {
    expect(datasetSpecInputName({ resolved_spec: { sources: [{ id: 'x', role: 'features', input: 'spectra.spc' }] } })).toBe('spectra.spc')
    expect(datasetSpecInputName(null)).toBeUndefined()
  })
})

describe('mapAssembledToMaterialized', () => {
  it('maps a single-partition regression block (X + numeric y + owner axis)', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: block({
          n_samples: 2,
          x: [mat([0.1, 0.2, 0.3, 0.2, 0.3, 0.4], 2, 3)],
          feature_headers: [['1000', '1010', '1020']],
          feature_axes: axes([1000, 1010, 1020]),
          header_units: ['nm'],
          y: targets([{ name: 'protein', values: [11.2, 9.8] }]),
          y_headers: ['protein'],
        }),
      }),
    )
    expect(ds.nFeatures).toBe(3)
    expect(ds.nSamples).toBe(2)
    expect(ds.taskType).toBe('regression')
    expect(Array.from(ds.y)).toEqual([11.2, 9.8])
    expect(ds.axis).toEqual([1000, 1010, 1020])
    expect(ds.axisUnit).toBe('nm')
    expect(ds.featureNames).toBeUndefined() // a physical axis identifies the columns, not text labels
    expect(ds.targetName).toBe('protein')
    expect(ds.partitions).toEqual(['train', 'train'])
  })

  it('reads the axis from the owner packet bit for bit, never from header text', () => {
    const exact = [900.1, 905.25, 1e-3]
    const ds = mapAssembledToMaterialized(full({ train: part(1, {
      x: [mat([1, 2, 3], 1, 3)],
      feature_headers: [['not', 'the', 'axis']], // misleading header text is only a label
      feature_axes: axes(exact, 'cm-1'),
    }) }))
    expect(ds.axis).toEqual(exact)
    expect(ds.axisUnit).toBe('cm-1')
  })

  it('shows an unset owner unit as unspecified instead of inventing nm', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(1, { feature_axes: axes([1, 2], null), header_units: ['text'] }) }))
    expect(ds.axis).toEqual([1, 2])
    expect(ds.axisUnit).toBe('unspecified')
  })

  it('treats a header-less table as an index axis with no column names', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(1, { feature_headers: [['0', '1']], feature_axes: axes([0, 1], null), header_units: ['index'] }) }))
    expect(ds.axisUnit).toBe('index')
    expect(ds.featureNames).toBeUndefined()
  })

  it('refuses a numeric packet that disagrees with the owner column count', () => {
    expect(() => mapAssembledToMaterialized(full({ train: part(1, { feature_axes: axes([1, 2, 3]) }) }))).toThrow(TypeError)
  })

  it('concatenates train + test partitions, tags each row and keeps the io partition names', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(2), test: part(1) }))
    expect(ds.nSamples).toBe(3)
    expect(ds.partitions).toEqual(['train', 'train', 'test'])
    expect(ds.partitionNames).toEqual(['train', 'train', 'test'])
    expect(ds.heldOutName).toBe('test')
    expect(Array.from(ds.y)).toEqual([1.5, 3, 1.5])
  })

  it('recovers class labels from y_categorical (classification_string)', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: part(3, {
          y: targets([{ name: 'grade', kind: 'classification_string', values: [0, 1, 0] }]),
          y_headers: ['grade'],
          y_categorical: { grade: { categories: ['A', 'B'] } },
        }),
      }),
    )
    expect(ds.taskType).not.toBe('regression')
    expect([...new Set(ds.classes ?? [])].sort()).toEqual(['A', 'B']) // vocabulary
    expect(ds.labelsRaw).toEqual(['A', 'B', 'A'])
  })

  it('takes classification_integer labels from the codes themselves', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(3, { y: targets([{ name: 'k', kind: 'classification_integer', values: [3, 7, 3] }]) }) }))
    expect(ds.labelsRaw).toEqual(['3', '7', '3'])
  })

  it('builds a targetless dataset (NaN y) when no y block is present', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(2, { y: null, y_headers: [], header_units: ['index'] }) }))
    expect(ds.nSamples).toBe(2)
    expect(Array.from(ds.y).every((v) => Number.isNaN(v))).toBe(true)
  })

  it('keeps non-numeric header text as logical column labels on an index axis', () => {
    const ds = mapAssembledToMaterialized(
      full({ train: block({
        n_samples: 1, x: [mat([1, 2, 3], 1, 3)], feature_headers: [['a', 'b', 'c']], header_units: ['text'], y: null,
        feature_axes: [[{ name: 'feature', unit: null, coordinates: { kind: 'string', values: ['a', 'b', 'c'] } as never }]],
      }) }),
    )
    expect(ds.axis).toEqual([0, 1, 2])
    expect(ds.axisUnit).toBe('index')
    expect(ds.featureNames).toEqual(['a', 'b', 'c'])
  })
})

describe('owner logical fields: values, masks and targets', () => {
  it('uses the validity mask, not the placeholder: masked cells become NaN, observed -0 and subnormals survive', () => {
    const ds = mapAssembledToMaterialized(full({ train: block({
      n_samples: 2,
      x: [mat([1, 12345, -0, 5e-324], 2, 2, [true, false, true, true])],
      feature_headers: [['1', '2']],
      header_units: ['nm'],
      y: null,
    }) }))
    expect(ds.X[0]).toBe(1)
    expect(Number.isNaN(ds.X[1])).toBe(true)
    expect(Object.is(ds.X[2], -0)).toBe(true)
    expect(ds.X[3]).toBe(5e-324)
  })

  it('refuses a feature matrix delivered without its logical data and validity mask', () => {
    const noMask = { data: Float64Array.from([1, 2]), n_rows: 1, n_cols: 2 } as unknown as ReturnType<typeof mat>
    expect(() => mapAssembledToMaterialized(full({ train: block({ n_samples: 1, x: [noMask], feature_headers: [['1', '2']], y: null }) }))).toThrow(/validity mask/)
  })

  it('excludes a masked target (NaN, no class) without inventing a class', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(4, {
      x: [mat([1, 1, 2, 2, 3, 3, 4, 4], 4, 2)],
      y: targets([{ name: 'label', kind: 'classification_string', values: [0, 0, 1, 0], valid: [true, false, true, true] }]),
      y_headers: ['label'],
      y_categorical: { label: { categories: ['apple', 'pear'] } },
    }) }))
    expect(Number.isNaN(ds.y[1])).toBe(true)
    expect(ds.labelsRaw).toEqual(['apple', '', 'pear', 'apple'])
    expect(ds.classes).toEqual(['apple', '', 'pear', 'apple'])
  })

  it('refuses several targets without a user choice, then reads the chosen column of the row-major table', () => {
    const two = () => full({ train: part(3, { y: targets([{ name: 'a', values: [1, 2, 3] }, { name: 'b', values: [10, 20, 30], valid: [true, false, true] }]), y_headers: ['a', 'b'] }) })
    expect(() => mapAssembledToMaterialized(two())).toThrow(/2 targets \(a, b\).*choose/)
    expect(() => mapAssembledToMaterialized(two(), { target: 'zzz' })).toThrow(/not among them/)
    const ds = mapAssembledToMaterialized(two(), { target: 'b' })
    expect(ds.targetName).toBe('b')
    expect(ds.yRaw![0]).toBe(10)
    expect(Number.isNaN(ds.yRaw![1])).toBe(true)
    expect(ds.yRaw![2]).toBe(30)
    expect(Array.from(mapAssembledToMaterialized(two(), { target: 'a' }).yRaw!)).toEqual([1, 2, 3])
  })

  it('refuses a target table that does not match the partition rows', () => {
    const bad = part(2, { y: { ...targets([{ name: 'y', values: [1, 2] }]), data: Float64Array.from([1]) } })
    expect(() => mapAssembledToMaterialized(full({ train: bad }))).toThrow(/does not match its 2 rows/)
  })

  it('refuses several feature sources instead of keeping the first', () => {
    const multi = part(2, { x: [mat([1, 2, 3, 4], 2, 2), mat([9, 9, 9, 9, 9, 9], 2, 3)], feature_headers: [['1', '2'], ['a', 'b', 'c']], header_units: ['nm', 'nm'] })
    expect(() => mapAssembledToMaterialized(full({ train: multi }))).toThrow(/2 feature sources/)
  })

  it('projects partition-specific sources in declared owner order and retains their complete evidence', async () => {
    const metadata = (ids: string[], scans: string[], groups: string[]) => ({ n_rows: ids.length, columns: [
      { name: 'Sample_ID', values: ids }, { name: 'Scan', values: scans }, { name: 'group_id', values: groups },
    ] })
    const record = { ...full({
      train: part(2, { source_ids: ['train_x'], representation_ids: ['signal_1d'], x: [mat([21, 22, 31, 32], 2, 2)],
        y: targets([{ name: 'y', values: [1.5, 2.5], valid: [true, false] }]), metadata: metadata(['A', 'B'], ['a', 'b'], ['Gtrain', 'Gtrain']) }),
      test: part(1, { source_ids: ['test_x'], representation_ids: ['signal_1d'], x: [mat([11, 999], 1, 2, [true, false])],
        y: targets([{ name: 'y', values: [8.5] }]), metadata: metadata(['C'], ['c'], ['Gtest']) }),
    }, { n_sources: 2, partition_order: ['test', 'train'], identity: { provenance: {
      source_ids: ['train_x', 'test_x'], sample_id: 'Sample_ID', observation_id: 'Scan', group_id: 'group_id',
    } } }), assembled_schema_version: 3 }
    const before = structuredClone(record)
    io.record = record
    const ds = await assembleDataset([], { resolved_spec: { sources: [] } }, [])
    expect(ds.partitionNames).toEqual(['test', 'train', 'train'])
    expect(ds.partitions).toEqual(['test', 'train', 'train'])
    expect(Array.from(ds.X)).toEqual([11, NaN, 21, 22, 31, 32])
    expect(Array.from(ds.yRaw!)).toEqual([8.5, 1.5, NaN])
    expect(ds.sampleIds).toEqual(['C', 'A', 'B'])
    expect(ds.observationIds).toEqual(['c', 'a', 'b'])
    expect(ds.groupIds).toEqual(['Gtest', 'Gtrain', 'Gtrain'])
    expect(ds.metadata?.find((c) => c.name === 'Scan')?.values).toEqual(['c', 'a', 'b'])
    expect(ioRetainedOf(ds)!.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('refuses a participating partition without a feature matrix', () => {
    expect(() => mapAssembledToMaterialized(full({ train: part(1), test: part(1, { x: [] }) }))).toThrow(/requires exactly one feature matrix/)
  })

  it.each([
    { feature_headers: [['2', '1']] },
    { feature_axes: axes([2, 1]) },
    { feature_axes: axes([1, 2], 'cm-1') },
    { header_units: ['cm-1'] },
    { representation_ids: ['tabular_numeric'] },
  ])('refuses incompatible cross-partition feature layout %j', (different) => {
    expect(() => mapAssembledToMaterialized(full({
      train: part(1, { representation_ids: ['signal_1d'] }),
      test: part(1, { representation_ids: ['signal_1d'], ...different }),
    }, { n_sources: 2 }))).toThrow(/incompatible ordered feature/)
  })

  it.each<Column>([
    { name: 'other', values: [1.5] },
    { name: 'y', kind: 'classification_integer', values: [1] },
  ])('refuses incompatible target name/kind %j', (column) => {
    expect(() => mapAssembledToMaterialized(full({ train: part(1), test: part(1, { y: targets([column]) }) }))).toThrow(/different target columns/)
  })
})

describe('partition roles and held-out sets', () => {
  it.each([['train'], ['train', 'train'], ['train', 'other']])('refuses an incomplete or invalid declared partition order %j', (...partition_order) => {
    expect(() => mapAssembledToMaterialized(full({ train: part(1), test: part(1) }, { partition_order }))).toThrow(/partition_order/)
  })
  it.each([
    ['train', 'train'], ['cal', 'train'], ['Calibration', 'train'],
    ['test', 'test'], ['holdout', 'test'], ['val', 'test'], ['validation', 'test'],
    ['predict', 'predict'], ['pred', 'predict'], ['infer', 'predict'], ['unknown', 'predict'],
  ])('maps io partition %s to %s', (name, role) => {
    expect(classifyIoPartition(name)).toBe(role)
  })

  it('keeps the io name of a validation hold-out and never calls it a training partition', () => {
    const ds = mapAssembledToMaterialized(full({ cal: part(2), val: part(1) }))
    expect(ds.partitions).toEqual(['train', 'train', 'test'])
    expect(ds.partitionNames).toEqual(['cal', 'cal', 'val'])
    expect(ds.heldOutName).toBe('val')
  })

  it.each(['ext', 'calibration2', 'train2', ''])('refuses the unknown partition name %j instead of training on it', (name) => {
    expect(() => mapAssembledToMaterialized(full({ train: part(2), [name]: part(1) }))).toThrow(/no known role/)
  })

  it('refuses two distinct held-out partitions rather than pooling their score', () => {
    expect(() => mapAssembledToMaterialized(full({ train: part(2), test: part(1), val: part(1) }))).toThrow(/2 held-out partitions.*pool/)
  })

  it('keeps a prediction partition apart from the held-out one', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(2), val: part(1), predict: part(1, { y: null, y_headers: [] }) }))
    expect(ds.partitions).toEqual(['train', 'train', 'test', 'predict'])
  })
})

describe('sample identity', () => {
  const meta = (name: string, values: (string | number | null)[]) => ({ n_rows: values.length, columns: [{ name, values }] })

  it('uses the sample id column io declared, keeping the column name', () => {
    const ds = mapAssembledToMaterialized(full(
      { train: part(2, { metadata: meta('Spl', ['S1', 'S2']) }) },
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))
    expect(ds.sampleIds).toEqual(['S1', 'S2'])
    expect(ds.sampleIdColumn).toBe('Spl')
    expect(ds.identity).toEqual({ basis: 'declared', sampleIdColumn: 'Spl' })
    expect(ds.metadata).toBeUndefined() // the key column is the identity, not a feature of the sample
  })

  it('does not guess an identity from a column name io did not declare: rows are positional and labelled so', () => {
    const ds = mapAssembledToMaterialized(full({ train: part(2, { metadata: meta('sample_id', ['S1', 'S2']) }) }))
    expect(ds.sampleIds).toEqual(['train#0', 'train#1'])
    expect(ds.sampleIdColumn).toBeUndefined()
    expect(ds.identity).toMatchObject({ basis: 'positional', reason: expect.stringMatching(/no sample-id key/) })
    expect(ds.metadata?.map((c) => c.name)).toEqual(['sample_id'])
  })

  it('refuses a declared key that a partition does not carry, instead of downgrading to positions', () => {
    expect(() => mapAssembledToMaterialized(full(
      { train: part(1, { metadata: meta('Spl', ['S1']) }), test: part(1) },
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))).toThrow(/declared the sample-id key "Spl" but partition "test" does not carry it.*fall back to row positions/)
    expect(() => mapAssembledToMaterialized(full(
      { train: part(2, { metadata: meta('Spl', ['S1']) }) }, // misaligned: 1 value for 2 rows
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))).toThrow(/does not carry it aligned/)
  })

  it('refuses an empty cell in the declared sample id column', () => {
    expect(() => mapAssembledToMaterialized(full(
      { train: part(2, { metadata: meta('Spl', ['S1', null]) }) },
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))).toThrow(/empty at row 2/)
  })

  it('refuses a repeated sample id when io declared no observation id, synthesising nothing', () => {
    expect(() => mapAssembledToMaterialized(full(
      { train: part(2, { metadata: meta('Spl', ['S1', 'S1']) }) },
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))).toThrow(/"S1" in "train".*no observation id.*will not invent one/)
  })

  it('refuses a repeated sample id whose declared observation id is empty or duplicated', () => {
    const columns = (obs: (string | null)[]) => ({ n_rows: 2, columns: [{ name: 'Spl', values: ['S1', 'S1'] }, { name: 'Scan', values: obs }] })
    const identity = { identity: { provenance: { sample_id: 'Spl', observation_id: 'Scan' } } }
    expect(() => mapAssembledToMaterialized(full({ train: part(2, { metadata: columns(['a', null]) }) }, identity))).toThrow(/empty observation id/)
    expect(() => mapAssembledToMaterialized(full({ train: part(2, { metadata: columns(['a', 'a']) }) }, identity))).toThrow(/declared twice for sample "S1"/)
  })

  it('keeps repeated sample ids with their declared observation ids, and projects the group column', () => {
    const ds = mapAssembledToMaterialized(full(
      { train: part(2, { metadata: { n_rows: 2, columns: [{ name: 'Spl', values: ['S1', 'S1'] }, { name: 'Scan', values: ['a', 'b'] }, { name: 'Lot', values: ['L1', 'L1'] }] } }) },
      { identity: { provenance: { sample_id: 'Spl', observation_id: 'Scan', group_id: 'Lot' } } },
    ))
    expect(ds.sampleIds).toEqual(['S1', 'S1'])
    expect(ds.observationIds).toEqual(['a', 'b'])
    expect(ds.groupIds).toEqual(['L1', 'L1'])
    expect(ds.identity).toEqual({ basis: 'declared', sampleIdColumn: 'Spl', observationIdColumn: 'Scan', groupColumn: 'Lot' })
  })

  it('treats a code reused by another partition as another sample, not a repeat', () => {
    const ds = mapAssembledToMaterialized(full(
      { cal: part(1, { metadata: meta('Spl', ['S1']) }), val: part(1, { metadata: meta('Spl', ['S1']) }) },
      { identity: { provenance: { sample_id: 'Spl' } } },
    ))
    expect(ds.sampleIds).toEqual(['S1', 'S1'])
    expect(ds.partitionNames).toEqual(['cal', 'val'])
  })
})

/** A record shaped like the owner's for the assembleDataset / ingestFiles tests. */
const replicateRecord = (): AssembledFull => full({
  cal: part(2, { y: targets([{ name: 'y', values: [1, 0], valid: [true, false] }]), metadata: { n_rows: 2, columns: [{ name: 'Sample_ID', values: ['A', 'A'] }, { name: 'Rep', values: ['r1', 'r2'] }] } }),
  val: part(1, { y: targets([{ name: 'y', values: [3] }]), metadata: { n_rows: 1, columns: [{ name: 'Sample_ID', values: ['A'] }, { name: 'Rep', values: ['r1'] }] } }),
}, { identity: { provenance: { source_ids: ['x'], sample_id: 'Sample_ID', observation_id: 'Rep', repetition_id: 'Rep', group_id: null } } })
const resolvedPlan = { resolved_spec: { sources: [], repetition: 'Rep', sample_index: { by: 'id', key: 'Sample_ID', observation_id: 'Rep', repetition_id: 'Rep' } } }

describe('assembleDataset and the retained owner record', () => {
  it('never lets an io-inferred per-scan repetition reach assembly; repeated ids carry the declared observation ids and the val hold-out', async () => {
    io.record = replicateRecord()
    const ds = await assembleDataset([], resolvedPlan, [])
    const spec = JSON.parse(io.specs[io.specs.length - 1])
    expect(spec.repetition).toBeUndefined()
    expect(spec.sample_index).toEqual({ by: 'id', key: 'Sample_ID', observation_id: 'Rep' })
    expect(ds.repetition).toBeUndefined()
    expect(ds.sampleIds).toEqual(['A', 'A', 'A'])
    expect(ds.observationIds).toEqual(['r1', 'r2', 'r1'])
    expect(ds.sampleIdColumn).toBe('Sample_ID')
    expect(ds.partitions).toEqual(['train', 'train', 'test'])
    expect(ds.partitionNames).toEqual(['cal', 'cal', 'val'])
    expect(Number.isNaN(ds.y[1])).toBe(true)
  })

  it('keeps the complete original record by reference, through a spread, and out of the worker clone', async () => {
    const record = replicateRecord()
    io.record = record
    const ds = await assembleDataset([], resolvedPlan, [])
    expect(ioRetainedOf(ds)!.record).toBe(record) // same object: no copy
    expect(ioRetainedOf({ ...ds })!.record).toBe(record)
    expect(ioRetainedOf(structuredClone(ds))).toBeUndefined()
    expect(Object.keys(ds)).not.toContain(String(IO_RECORD))
    expect(record.blocks.cal.x[0].validity).toEqual([true, true, true, true]) // masks untouched
  })

  it('refuses a blocked or missing spec without assembling locally, keeping the input bytes', async () => {
    await expect(assembleDataset([], { resolved_spec: { sources: [] }, blocked: true, warnings: ['ambiguous roles'] }, [])).rejects.toThrow(/blocked.*ambiguous roles/)
    io.plan = { warnings: ['io says no'], resolved_spec: null }
    const inputs = [{ name: 'Xtrain.csv', bytes: Uint8Array.from([49, 10]) }]
    const refusal = await ingestFiles(inputs, 'Xtrain.csv').catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(IoIngestionRefusal)
    expect((refusal as IoIngestionRefusal).inputs).toBe(inputs)
    expect((refusal as IoIngestionRefusal).retained).toBeUndefined() // io produced no record
    expect((refusal as IoIngestionRefusal).message).toMatch(/io says no.*kept unchanged.*not assemble them locally/)
  })

  it('keeps the owner record and input bytes in a refusal that needs a user decision, and resumes from them', async () => {
    const record = full({ train: part(3, { y: targets([{ name: 'a', values: [1.5, 2.5, 3.5] }, { name: 'b', values: [10, 20, 30] }]), y_headers: ['a', 'b'] }) })
    io.plan = resolvedPlan
    io.record = record
    const inputs = [{ name: 'Xtrain.csv', bytes: Uint8Array.from([1, 2, 3]) }, { name: 'Ytrain.csv', bytes: Uint8Array.from([4]) }]
    const refusal = await ingestFiles(inputs, 'Xtrain.csv').catch((e: unknown) => e) as IoIngestionRefusal
    expect(refusal).toBeInstanceOf(IoIngestionRefusal)
    expect(refusal.inputs).toBe(inputs)
    expect(refusal.retained!.record).toBe(record) // both targets stay in the owner record
    expect(refusal.decision).toEqual({ target: ['a', 'b'] })
    expect(refusal.message).toMatch(/2 targets \(a, b\)/)

    const calls = io.specs.length
    const resumed = resumeIngestion(refusal, { target: 'b' })
    expect(io.specs.length).toBe(calls) // resumed from the retained record: no second assembly
    expect(resumed.dataset.targetName).toBe('b')
    expect(Array.from(resumed.dataset.yRaw!)).toEqual([10, 20, 30])
    expect(ioRetainedOf(resumed.dataset)!.record).toBe(record)
  })

  it('refuses a multi-source record while still handing the host its complete evidence', async () => {
    const record = full({ train: part(2, { x: [mat([1, 2, 3, 4], 2, 2), mat([9, 9, 9, 9], 2, 2)], feature_headers: [['1', '2'], ['a', 'b']], header_units: ['nm', 'nm'] }) })
    io.plan = resolvedPlan
    io.record = record
    const refusal = await ingestFiles([{ name: 'X.csv', bytes: Uint8Array.from([1]) }], 'X.csv').catch((e: unknown) => e) as IoIngestionRefusal
    expect(refusal.message).toMatch(/2 feature sources/)
    expect(refusal.retained!.record).toBe(record)
    expect(refusal.decision).toBeUndefined()
  })
})
