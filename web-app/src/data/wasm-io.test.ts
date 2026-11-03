import { describe, expect, it, vi } from 'vitest'
import { type AssembledFull, assembleDataset, datasetSpecInputName, mapAssembledToMaterialized } from './wasm-io'

// nirs4all-io now assembles X/y (roles, joins, partitions) in Rust → WASM; studio
// only maps its AssembledDataset.to_full_value() onto MaterializedDataset. These
// test that mapping (pure data shaping) — the assembly semantics themselves are
// covered by io's own Rust goldens + the io-assemble browser/node path.
const assembled = vi.hoisted(() => ({ specs: [] as string[] }))
vi.mock('@/engine/nirs4all-core', () => ({
  loadDataIoWasm: async () => ({ formats: {}, io: { assembleDataset: (_files: unknown, _records: unknown, spec: string) => {
    assembled.specs.push(spec)
    return { name: 'd', task_type: 'regression', signal_type: 'absorbance', n_sources: 1, folds: [], blocks: {
      cal: { n_samples: 2, x: [{ data: Float64Array.from([1, 2, 3, 4]), n_rows: 2, n_cols: 2 }], feature_headers: [['1000', '1010']], header_units: ['nm'], signal_types: [], y: { data: Float64Array.from([1, NaN]), n_rows: 2, n_cols: 1 }, y_headers: ['y'], metadata: { n_rows: 2, columns: [{ name: 'Sample_ID', values: ['A', 'A'] }, { name: 'Rep', values: ['r1', 'r2'] }] }, weights: null, weights_header: null },
      val: { n_samples: 1, x: [{ data: Float64Array.from([5, 6]), n_rows: 1, n_cols: 2 }], feature_headers: [['1000', '1010']], header_units: ['nm'], signal_types: [], y: { data: Float64Array.from([3]), n_rows: 1, n_cols: 1 }, y_headers: ['y'], metadata: { n_rows: 1, columns: [{ name: 'Sample_ID', values: ['A'] }, { name: 'Rep', values: ['r1'] }] }, weights: null, weights_header: null },
    } }
  } } }),
}))

const mat = (data: number[], n_rows: number, n_cols: number) => ({ data: Float64Array.from(data), n_rows, n_cols })
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
const full = (blocks: AssembledFull['blocks']): AssembledFull => ({ name: 'd', task_type: 'regression', signal_type: 'absorbance', n_sources: 1, blocks, folds: [] })

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
  it('maps a single-partition regression block (X + numeric y + axis)', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: block({
          n_samples: 2,
          x: [mat([0.1, 0.2, 0.3, 0.2, 0.3, 0.4], 2, 3)],
          feature_headers: [['1000', '1010', '1020']],
          header_units: ['nm'],
          y: mat([11.2, 9.8], 2, 1),
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
    expect(ds.targetName).toBe('protein')
    expect(ds.partitions).toEqual(['train', 'train'])
  })

  it('concatenates train + test partitions and tags each row', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: block({ n_samples: 2, x: [mat([1, 2, 3, 4], 2, 2)], feature_headers: [['1', '2']], header_units: ['nm'], y: mat([1, 2], 2, 1), y_headers: ['y'] }),
        test: block({ n_samples: 1, x: [mat([5, 6], 1, 2)], feature_headers: [['1', '2']], header_units: ['nm'], y: mat([3], 1, 1), y_headers: ['y'] }),
      }),
    )
    expect(ds.nSamples).toBe(3)
    expect(ds.partitions).toEqual(['train', 'train', 'test'])
    expect(Array.from(ds.y)).toEqual([1, 2, 3])
  })

  it('recovers class labels from y_categorical (classification)', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: block({
          n_samples: 3,
          x: [mat([1, 1, 2, 2, 3, 3], 3, 2)],
          feature_headers: [['1', '2']],
          header_units: ['nm'],
          y: mat([0, 1, 0], 3, 1),
          y_headers: ['grade'],
          y_categorical: { grade: { categories: ['A', 'B'] } },
        }),
      }),
    )
    expect(ds.taskType).not.toBe('regression')
    expect([...new Set(ds.classes ?? [])].sort()).toEqual(['A', 'B']) // vocabulary
    expect(ds.labelsRaw).toEqual(['A', 'B', 'A'])
  })

  it('builds a targetless dataset (NaN y) when no y block is present', () => {
    const ds = mapAssembledToMaterialized(
      full({ train: block({ n_samples: 2, x: [mat([0.1, 0.2, 0.3, 0.4], 2, 2)], feature_headers: [['1', '2']], header_units: ['index'], y: null }) }),
    )
    expect(ds.nSamples).toBe(2)
    expect(Array.from(ds.y).every((v) => Number.isNaN(v))).toBe(true)
  })

  it('uses a metadata sample_id column when present, else synthesizes ids', () => {
    const ds = mapAssembledToMaterialized(
      full({
        train: block({
          n_samples: 2,
          x: [mat([1, 2, 3, 4], 2, 2)],
          feature_headers: [['1', '2']],
          header_units: ['nm'],
          y: mat([1, 2], 2, 1),
          y_headers: ['y'],
          metadata: { n_rows: 2, columns: [{ name: 'sample_id', values: ['S1', 'S2'] }] },
        }),
      }),
    )
    expect(ds.sampleIds).toEqual(['S1', 'S2'])
  })

  it('falls back to an index axis when feature headers are non-numeric', () => {
    const ds = mapAssembledToMaterialized(
      full({ train: block({ n_samples: 1, x: [mat([1, 2, 3], 1, 3)], feature_headers: [['a', 'b', 'c']], header_units: [''], y: null }) }),
    )
    expect(ds.axis).toEqual([0, 1, 2])
  })

  it('uses the first feature source for a multi-source block (v1 single-source)', () => {
    // io can emit multiple feature matrices (x[]); studio v1 models the first.
    const ds = mapAssembledToMaterialized(
      full({
        train: block({
          n_samples: 2,
          x: [mat([1, 2, 3, 4], 2, 2), mat([9, 9, 9, 9, 9, 9], 2, 3)],
          feature_headers: [
            ['1', '2'],
            ['a', 'b', 'c'],
          ],
          header_units: ['nm', 'nm'],
          y: mat([1, 2], 2, 1),
          y_headers: ['y'],
        }),
      }),
    )
    expect(ds.nFeatures).toBe(2) // first source
    expect(Array.from(ds.X)).toEqual([1, 2, 3, 4])
  })
})

describe('assembleDataset', () => {
  it('never lets an io-inferred per-scan repetition reach assembly, keeps repeated ids and a val test partition', async () => {
    const ds = await assembleDataset([], { resolved_spec: { sources: [], repetition: 'Rep', sample_index: { by: 'id', key: 'Sample_ID', repetition_id: 'Rep' } } }, [])
    const spec = JSON.parse(assembled.specs[0])
    expect(spec.repetition).toBeUndefined()
    expect(spec.sample_index).toEqual({ by: 'id', key: 'Sample_ID' })
    expect(ds.repetition).toBeUndefined()
    expect(ds.sampleIds).toEqual(['A', 'A', 'A'])
    expect(ds.sampleIdColumn).toBe('Sample_ID')
    expect(ds.partitions).toEqual(['train', 'train', 'test'])
    expect(Number.isNaN(ds.y[1])).toBe(true)
  })
})


describe('typed IO matrices', () => {
  it('preserves NaN features and missing categorical targets without inventing a class', () => {
    const ds = mapAssembledToMaterialized(full({ train: block({
      n_samples: 4,
      x: [{ data: Float64Array.from([1, NaN, 3, 4]), n_rows: 4, n_cols: 1 }],
      y: { data: Float64Array.from([0, NaN, 1, 0]), n_rows: 4, n_cols: 1 },
      y_categorical: { label: { categories: ['apple', 'pear'] } },
    }) }))
    expect(ds.nSamples).toBe(4)
    expect(Number.isNaN(ds.X[1])).toBe(true)
    expect(Number.isNaN(ds.y[1])).toBe(true)
    expect(ds.labelsRaw).toEqual(['apple', '', 'pear', 'apple'])
    expect(ds.classes).toEqual(['apple', '', 'pear', 'apple'])
  })
})
