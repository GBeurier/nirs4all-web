import { describe, expect, it } from 'vitest'
import { defaultLabConfig, describeRecipe } from './recipes'
import { fusionLevel, fusionPresets, toLabDocument } from './fusion'
import type { LabCase, LabDataset, LabSource } from './types'

function dataset(caseId: LabCase): LabDataset {
  const sampleIds = ['a', 'b', 'c', 'd', 'e', 'f']
  const source = (id: string, modality: LabSource['modality'], shape: number[]): LabSource => {
    const width = shape.reduce((n, size) => n * size, 1)
    return { id, label: id, modality, representation: modality === 'image' ? 'gray_image' : modality === 'genetics' ? 'tabular_numeric' : 'signal_1d',
      shape, sampleIds, data: new Float64Array(sampleIds.length * width), featureNames: Array.from({ length: width }, (_, i) => `f${i}`), provenance: {} }
  }
  const sources = caseId === 'spectroscopy' ? [source('raman', 'spectroscopy', [8]), source('nirs', 'spectroscopy', [8]), source('mir', 'spectroscopy', [8])] :
    [source('nirs', 'spectroscopy', [8]), caseId === 'genetics' ? source('markers', 'genetics', [6]) : source('image', 'image', [4, 4, 1])]
  return { caseId, name: caseId, fingerprint: 'fixture', sampleIds, sources,
    target: { name: 'y', unit: '', values: new Float64Array(sampleIds.length) },
    alignment: sources.map(source => ({ sourceId: source.id, matched: sampleIds.length, missing: 0, refused: 0 })), provenance: {} }
}

const LEGACY: Record<string, 'single' | 'early' | 'mbpls' | 'mid' | 'late' | 'stacking'> = {
  early: 'early', mbpls: 'mbpls', 'late-mean': 'late', 'late-stacking': 'stacking',
}

for (const caseId of ['spectroscopy', 'genetics', 'images'] as const) {
  const data = dataset(caseId), config = defaultLabConfig(data)
  describe(`${caseId} canonical fusion presets`, () => {
    for (const preset of fusionPresets(data)) {
      it(`${preset.id} compiles to the qualified native recipe`, () => {
        const document = toLabDocument(data, preset.document)
        expect(fusionLevel(document)).toBe(preset.level)
        const actual = describeRecipe(data, { ...config, pipeline: document })
        if (preset.id === 'mid-pca') {
          expect(Object.values(actual.operators)[0].sourceOps.every(source => source.steps.at(-1)!.methodId === 'preprocessing.feature_selection.flexible_pca')).toBe(true)
          return
        }
        const single = preset.id.startsWith('single:') ? preset.id.slice('single:'.length) : null
        // The CNN preset is the qualified multibranch recipe with the lab's CNN settings.
        const cnn = { filters: 8, kernel_size: 3, embedding_dim: 16, head_hidden: 16, epochs: 150, batch_size: 16, learning_rate: 0.01, weight_decay: 0.0001 }
        const expected = describeRecipe(data, { ...config, strategy: single ? 'single' : preset.id === 'cnn' ? 'mid' : LEGACY[preset.id], baseModels: ['pls'],
          ...(single ? { singleSourceId: single } : {}), ...(preset.id === 'cnn' ? { cnn } : {}) })
        if (preset.level === 'late') {
          // Per-source node IDs follow the source names; the operators and merge are the qualified ones.
          const operators = (recipe: typeof actual) => Object.values(recipe.operators).map(operator => JSON.stringify(operator)).sort()
          expect(operators(actual)).toEqual(operators(expected))
          expect(actual.steps.at(-1)).toMatchObject({ kind: (expected.steps.at(-1) as { kind: string }).kind })
          expect(actual.targetNode).toBe(expected.targetNode)
        } else {
          expect(actual.steps).toEqual(expected.steps)
          expect(actual.nodes).toEqual(expected.nodes)
        }
      })
    }
  })
}

describe('canonical refusals', () => {
  const data = dataset('genetics')
  const refuse = (pipeline: unknown[], message: RegExp) => expect(() => toLabDocument(data, { pipeline })).toThrow(message)
  const scale = { class: 'preprocessing.scaling.standard_scale' }
  const pls = { model: { class: 'models.pls.pls_regression', params: { n_components: 2 } } }
  it('explains unsupported structures instead of guessing', () => {
    refuse([pls], /Start the pipeline with the sources/)
    refuse([{ source_branch: { nirs: [scale], markers: [scale] } }], /Add a model/)
    refuse([{ source_branch: { nirs: [scale], markers: ['preprocessing.scatter.snv'] } }, pls], /applies to spectra/)
    refuse([{ source_branch: { nirs: [scale], markers: [scale] } }, { merge_sources: 'concat' }, { model: { class: 'models.multiblock.mb_pls' } }], /remove the "Merge sources" step/)
    refuse([{ source_branch: { nirs: [scale], other: [scale] } }, pls], /not a source of this dataset/)
    refuse([{ branch: { by_source: true, steps: { nirs: [scale, pls], markers: [scale] } } }, { merge: 'predictions' }, pls], /end the lane with a model/)
    refuse([{ branch: { by_source: true, steps: { nirs: [scale, pls], markers: [scale, pls] } } }, { merge: 'predictions' }], /meta-model/)
    refuse([{ source_branch: { nirs: [scale] } }, { model: { class: 'models.pls.pls_regression', params: { n_components: { _range_: [1, 5] } } } }], /fixed value/)
    refuse([{ class: 'sklearn.model_selection.KFold' }, { source_branch: { nirs: [scale] } }, pls], /section 4/)
  })
  it('accepts explicit source options with a source merge', () => {
    const document = toLabDocument(data, { pipeline: [{ source_branch: { nirs: [scale], markers: [scale], _merge_after_: false } }, { merge_sources: 'concat' }, pls] })
    expect(document.branches[0].sourceIds).toEqual(['nirs', 'markers'])
    refuse([{ source_branch: { nirs: [scale], markers: [scale], _merge_after_: 'no' } }, pls], /true or false/)
  })
  it('accepts bare class strings, bypassed lanes and nested model branches', () => {
    const document = toLabDocument(data, { pipeline: [
      { branch: { by_source: true, steps: { nirs: [scale, { branch: { pls: [pls], ridge: [{ model: 'models.regularized.ridge' }] } }], markers: { _bypassed_: [scale, pls] } } } },
      { merge: 'predictions' }, { model: { class: 'models.regularized.ridge' } },
    ] })
    expect(document.branches.map(branch => branch.id)).toEqual(['nirs-pls', 'nirs-ridge'])
    expect(document.branches[1].head.params).toMatchObject({ alpha: 1, center_x: true })
    expect(document.merge.kind).toBe('model')
  })
})
