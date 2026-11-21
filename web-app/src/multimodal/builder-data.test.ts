import { describe, expect, it } from 'vitest'
import type { MultimodalBuilderDraft, MultimodalBuilderSource } from 'nirs4all-ui/datasetBuilder'
import { buildBuilderManifest } from './builder-data'
import { withSeriesColumns } from './data'
import type { LabDataset } from './types'

const source: MultimodalBuilderSource = {
  id: 'nir', file: 'measurements.csv', label: 'NIRS', role: 'combined', profile: 'numeric_csv', modality: 'spectroscopy',
  columns: [], rowCount: 2, sampleId: 'specimen', target: 'concentration', targetUnit: 'mg/g', group: 'material', partition: 'scope',
  features: ['1000', '1100'], axisMode: 'declared', axisKind: 'wavelength', axisUnit: 'nm',
  coordinates: { '1000': 1000.0000000001, '1100': 1100.0000000002 }, shape: [], warnings: [],
}
const draft: MultimodalBuilderDraft = { name: 'Teaching collection', sources: [source] }

describe('explicit Dataset Builder declaration transport', () => {
  it('preserves precise coordinate alignment when a feature is deselected', () => {
    const manifest = buildBuilderManifest({ ...draft, sources: [{ ...source, features: ['1100'] }] }, 'spectroscopy')
    expect(manifest.sources[0].axis?.values).toEqual([1100.0000000002])
    expect(manifest.metadata).toEqual({ file: 'measurements.csv', sampleId: 'specimen', target: 'concentration',
      targetUnit: 'mg/g', group: 'material', partition: 'scope' })
  })
  it.each(['concentration', 'specimen', 'material', 'scope'])('refuses a declared metadata column %s as an input feature', reserved => {
    expect(() => buildBuilderManifest({ ...draft, sources: [{ ...source, features: ['1000', reserved] }] }, 'spectroscopy'))
      .toThrow('cannot also be features')
  })
  it('requires an explicit metadata choice and refuses multiple target tables', () => {
    expect(() => buildBuilderManifest({ ...draft, sources: [{ ...source, role: 'source' }] }, 'spectroscopy')).toThrow('exactly one')
    expect(() => buildBuilderManifest({ ...draft, sources: [source, { ...source, id: 'other' }] }, 'spectroscopy')).toThrow('exactly one')
  })
  it('keeps a manifest class vocabulary only while its declared column stays the target', () => {
    const declared = { file: 'measurements.csv', target: 'concentration', targetKind: 'categorical' as const, classes: ['low', 'high'] }
    const kept = buildBuilderManifest(draft, 'spectroscopy', {}, declared)
    expect(kept.metadata).toMatchObject({ target: 'concentration', targetKind: 'categorical', classes: ['low', 'high'] })
    const changed = buildBuilderManifest({ ...draft, sources: [{ ...source, target: 'material', group: '' }] }, 'spectroscopy', {}, declared)
    expect(changed.metadata).not.toHaveProperty('targetKind')
    expect(changed.metadata).not.toHaveProperty('classes')
  })
  it('passes a manifest-declared time series to IO unchanged, under the edited label', () => {
    const series = { id: 'weather', label: 'Weather', modality: 'timeseries' as const, profile: 'timeseries_csv' as const, file: 'weather.csv',
      sampleId: 'sample_id', time: 'day', features: ['t_max', 'rain'], axis: { values: [-1, 0], unit: 'day', kind: 'time' } }
    const weather = { ...source, id: 'weather', file: 'weather.csv', label: 'Daily weather', role: 'source' as const, features: ['t_max', 'rain'] }
    const manifest = buildBuilderManifest({ ...draft, sources: [source, weather] }, 'timeseries', {}, undefined, [series])
    expect(manifest.sources[1]).toEqual({ ...series, label: 'Daily weather' })
  })
  it('names every stored column of a time series, time-major, and keeps its variables', () => {
    const dataset = { sources: [{ id: 'weather', representation: 'series_mv', shape: [2, 2], featureNames: ['t_max', 'rain'],
      axis: { values: [-1, 0], unit: 'day', kind: 'time' } }] } as unknown as LabDataset
    const [series] = withSeriesColumns(dataset).sources
    expect(series.variables).toEqual(['t_max', 'rain'])
    expect(series.featureNames).toEqual(['t_max@-1', 'rain@-1', 't_max@0', 'rain@0'])
  })
  it('refuses missing declared coordinates instead of inventing an index axis', () => {
    expect(() => buildBuilderManifest({ ...draft, sources: [{ ...source, features: ['new-column'] }] }, 'spectroscopy')).toThrow('finite explicit')
  })
})
