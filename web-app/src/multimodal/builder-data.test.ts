import { describe, expect, it } from 'vitest'
import type { MultimodalBuilderDraft, MultimodalBuilderSource } from 'nirs4all-ui/datasetBuilder'
import { buildBuilderManifest } from './builder-data'

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
  it('refuses missing declared coordinates instead of inventing an index axis', () => {
    expect(() => buildBuilderManifest({ ...draft, sources: [{ ...source, features: ['new-column'] }] }, 'spectroscopy')).toThrow('finite explicit')
  })
})
