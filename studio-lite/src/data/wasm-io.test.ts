import { describe, expect, it } from 'vitest'
import { materialize, type DecodedFile } from './wasm-io'

// records as nirs4all-formats would return them (first signal carries the spectrum)
const spectrum = (vals: number[], row: number, partition: string, sampleId?: string) => ({
  signals: { s: { axis: { values: [1000, 1010, 1020], unit: 'nm' }, values: vals } },
  metadata: { row_index: row, partition, ...(sampleId ? { sample_id: sampleId } : {}) },
})
const scalar = (v: number, row: number, partition: string, sampleId?: string) => ({
  signals: { y: { values: [v] } },
  metadata: { row_index: row, partition, ...(sampleId ? { sample_id: sampleId } : {}) },
})

describe('wasm-io materialize', () => {
  it('assembles X spectra + a scalar y file, aligned by partition+row', () => {
    const decoded: DecodedFile[] = [
      { ok: true, file: 'X_train.csv', records: [spectrum([0.1, 0.2, 0.3], 0, 'train'), spectrum([0.2, 0.3, 0.4], 1, 'train')] },
      { ok: true, file: 'y_train.csv', records: [scalar(11.2, 0, 'train'), scalar(9.8, 1, 'train')] },
    ]
    const ds = materialize(decoded, 'd')
    expect(ds.nFeatures).toBe(3)
    expect(ds.nSamples).toBe(2)
    expect(ds.taskType).toBe('regression')
    expect(Array.from(ds.y)).toEqual([11.2, 9.8])
    expect(ds.axis).toEqual([1000, 1010, 1020])
  })

  it('does not treat a metadata scalar file as the target', () => {
    const decoded: DecodedFile[] = [
      { ok: true, file: 'X_train.csv', records: [spectrum([0.1, 0.2, 0.3], 0, 'train'), spectrum([0.2, 0.3, 0.4], 1, 'train')] },
      { ok: true, file: 'metadata_train.csv', records: [scalar(7, 0, 'train'), scalar(8, 1, 'train')] },
      { ok: true, file: 'y_train.csv', records: [scalar(11.2, 0, 'train'), scalar(9.8, 1, 'train')] },
    ]
    const ds = materialize(decoded, 'd')
    expect(Array.from(ds.y)).toEqual([11.2, 9.8]) // y file, not the metadata scalar
  })

  it('prefers a real shared sample_id over row position when y rows are shuffled', () => {
    const decoded: DecodedFile[] = [
      { ok: true, file: 'X.csv', records: [spectrum([0.1, 0.2, 0.3], 0, 'train', 'A'), spectrum([0.9, 0.8, 0.7], 1, 'train', 'B')] },
      { ok: true, file: 'y.csv', records: [scalar(22.5, 5, 'train', 'B'), scalar(11.5, 9, 'train', 'A')] },
    ]
    const ds = materialize(decoded, 'd')
    expect(ds.taskType).toBe('regression')
    // A must get 11.5 and B must get 22.5 despite the y file being in a different order
    const bySid = Object.fromEntries(ds.sampleIds.map((s, i) => [s, ds.y[i]]))
    expect(bySid.A).toBe(11.5)
    expect(bySid.B).toBe(22.5)
  })

  it('builds a targetless dataset (NaN y) for explore / predict-only use', () => {
    const decoded: DecodedFile[] = [
      { ok: true, file: 'a.spc', records: [spectrum([0.1, 0.2, 0.3], 0, 'train')] },
      { ok: true, file: 'b.spc', records: [spectrum([0.2, 0.3, 0.4], 1, 'train')] },
    ]
    const ds = materialize(decoded, 'd')
    expect(ds.nSamples).toBe(2)
    expect(Array.from(ds.y).every((v) => Number.isNaN(v))).toBe(true) // engine refuses to train on this
  })
})
