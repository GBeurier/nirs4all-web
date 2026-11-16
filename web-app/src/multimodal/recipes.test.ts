import { describe, expect, it } from 'vitest'
import { createPipelinePresets, defaultLabConfig, describeRecipe, NEURAL, pipelineSourceIds, pipelineStrategy, SOURCE_RECIPE_PARAM, validatePipelineDocument } from './recipes'
import type { LabCase, LabDataset, LabPipelineDocument, LabSource } from './types'

function dataset(caseId: LabCase): LabDataset {
  const sampleIds = ['a', 'b', 'c', 'd', 'e', 'f']
  const source = (id: string, modality: LabSource['modality'], shape: number[]): LabSource => {
    const width = shape.reduce((n, size) => n * size, 1)
    return { id, label: id, modality, representation: modality === 'image' ? 'gray_image' : modality === 'genetics' ? 'tabular_numeric' : 'signal_1d',
      shape, sampleIds, data: new Float64Array(sampleIds.length * width), featureNames: Array.from({ length: width }, (_, i) => `f${i}`), provenance: {} }
  }
  const sources = caseId === 'spectroscopy' ? [source('RAMAN', 'spectroscopy', [8]), source('NIRS', 'spectroscopy', [8]), source('MIR', 'spectroscopy', [8])] :
    [source('NIRS', 'spectroscopy', [8]), caseId === 'genetics' ? source('markers', 'genetics', [6]) : source('image', 'image', [4, 4, 1])]
  return { caseId, name: caseId, fingerprint: 'fixture', sampleIds, sources,
    target: { name: 'y', unit: '', values: new Float64Array(sampleIds.length) },
    alignment: sources.map(source => ({ sourceId: source.id, matched: sampleIds.length, missing: 0, refused: 0 })), provenance: {} }
}

for (const caseId of ['spectroscopy', 'genetics', 'images'] as const) {
  const data = dataset(caseId), config = defaultLabConfig(data)
  describe(`${caseId} editable preset equivalence`, () => {
    for (const preset of createPipelinePresets(data, config)) {
      it(`preserves native nodes, immutable operators and DSL for ${preset.id}`, () => {
        const baseline = { ...config, strategy: preset.strategy,
          singleSourceId: preset.id.startsWith('single:') ? preset.id.slice('single:'.length) : config.singleSourceId }
        const expected = describeRecipe(data, baseline)
        const actual = describeRecipe(data, { ...baseline, pipeline: preset.document })
        expect(actual.steps).toEqual(expected.steps)
        expect(actual.operators).toEqual(expected.operators)
        expect(actual.nodes).toEqual(expected.nodes)
        expect(actual.targetNode).toBe(expected.targetNode)
        expect(actual.label).toBe(preset.document.label)
      })
    }
  })
}

const data = dataset('spectroscopy'), config = defaultLabConfig(data)
function preset(id: string): LabPipelineDocument {
  return createPipelinePresets(data, config).find(preset => preset.id === id)!.document
}

describe('editable document execution boundary', () => {
  it('uses edited branch heads, independent preprocessing and overlap rather than strategy defaults', () => {
    const original = preset('stacking')
    const document = validatePipelineDocument(data, { ...original, label: 'Edited experiment',
      branches: original.branches.slice(0, 2).map((branch, i) => ({ ...branch,
        sourceIds: ['NIRS'], sourceChains: [{ sourceId: 'NIRS', steps: i ? [] : [{ methodId: 'preprocessing.scaling.block_rms', params: {} }] }],
        head: { methodId: 'models.regularized.ridge', params: { alpha: i ? 17 : 2, scale_x: false } } })) })
    const result = describeRecipe(data, { ...config, strategy: 'mid', blockScaling: true, pipeline: document })
    expect(Object.values(result.operators).slice(0, 2).map(operator => operator.steps[0].params.alpha)).toEqual([2, 17])
    expect(Object.values(result.operators).slice(0, 2).map(operator => operator.sourceOps[0].steps.length)).toEqual([1, 0])
    expect(result.label).toBe('Edited experiment')
    expect(pipelineSourceIds(document)).toEqual(['NIRS'])
    expect(pipelineStrategy(document)).toBe('stacking')
    expect(result.steps[1]).toMatchObject({ kind: 'merge_model', include_original_data: false,
      metadata: { stacking_oof_execution: 'nested_oof_v1', stacking_refit_oof: 'partitioned_inner_v1' } })
    for (const [id, operator] of Object.entries(result.operators)) {
      const steps = result.steps as any[]
      const model = id === 'model:result' ? steps[1] : steps[0].branches.flatMap((branch: any) => branch.steps).find((step: any) => step.id === id)
      expect(model.params[SOURCE_RECIPE_PARAM]).toEqual(operator)
    }
  })

  it('binds only explicitly selected raw meta inputs and keeps the native hybrid OOF policy', () => {
    const original = preset('stacking')
    const document = { ...original, merge: { ...original.merge, sourceIds: ['MIR'], sourceChains: [{ sourceId: 'MIR', steps: [] }] } }
    const result = describeRecipe(data, { ...config, pipeline: document })
    expect(result.nodes.at(-1)).toEqual({ id: 'model:result', inputName: 'x_original', sourceIds: ['MIR'] })
    expect(result.operators['model:result'].hybrid).toBe(true)
    expect(pipelineStrategy(document)).toBe('hybrid')
  })

  it('emits native fixed mean and explicit Final refit from the document despite a stale strategy', () => {
    const result = describeRecipe(data, { ...config, strategy: 'early', pipeline: preset('late') })
    expect(result.targetNode).toBe('merge:mean')
    expect(result.steps[1]).toMatchObject({ kind: 'merge', merge_mode: 'fusion', output_as: 'predictions',
      metadata: { refit_prediction_partition: 'final' } })
  })

  it('allows an early branch named result to become a merged branch without a node collision', () => {
    const original = preset('early')
    const document = { ...original, branches: [original.branches[0], { ...original.branches[0], id: 'branch:result', label: 'Second' }],
      merge: { ...original.merge, kind: 'model' as const } }
    const result = describeRecipe(data, { ...config, pipeline: document })
    expect(Object.keys(result.operators)).toEqual(['model:branch:result', 'model:branch:branch:result', 'model:result'])
  })

  it('copies explicit RMS steps once and never applies the old global toggle to an edited document', () => {
    const scaled = createPipelinePresets(data, { ...config, blockScaling: true }).find(preset => preset.id === 'early')!
    const result = describeRecipe(data, { ...config, blockScaling: true, pipeline: scaled.document })
    expect(result.operators['model:result'].sourceOps.every(source => source.steps.filter(step => step.methodId === 'preprocessing.scaling.block_rms').length === 1)).toBe(true)
  })

  it('derives neural geometry and an exact signed seed from the selected source layouts', () => {
    const imageData = dataset('images'), defaults = defaultLabConfig(imageData)
    const document = createPipelinePresets(imageData, defaults).find(preset => preset.id === 'mid')!.document
    const result = describeRecipe(imageData, { ...defaults, validation: { ...defaults.validation, seed: '18446744073709551615' }, pipeline: document })
    expect(result.operators['model:result'].steps[0]).toMatchObject({ methodId: NEURAL,
      params: { branch_kinds: [1, 2], branch_shapes: [8, 1, 1, 4, 4, 1], seed: '-1' } })
  })

  it('clones imported valid documents and preserves every model parameter', () => {
    const original = preset('early')
    const clone = validatePipelineDocument(data, original)
    expect(clone).toEqual(original)
    expect(clone).not.toBe(original)
    clone.branches[0].head.params.n_components = 8
    expect(original.branches[0].head.params.n_components).toBe(3)
  })

  it.each([
    ['unknown source', (value: any) => { value.branches[0].sourceIds = ['absent'] }],
    ['duplicate source', (value: any) => { value.branches[0].sourceIds.push(value.branches[0].sourceIds[0]) }],
    ['missing source chain', (value: any) => { value.branches[0].sourceChains = [] }],
    ['duplicate branch', (value: any) => { value.branches.push(structuredClone(value.branches[0])) }],
    ['mean with one branch', (value: any) => { value.merge.kind = 'mean' }],
    ['unsupported document field', (value: any) => { value.steps = [] }],
    ['nonfinite parameter', (value: any) => { value.branches[0].head.params.n_components = NaN }],
    ['structural model parameter', (value: any) => { value.branches[0].head.params.hidden = [1, 2] }],
    ['network geometry override', (value: any) => { value.branches[0].head = { methodId: NEURAL, params: { branch_shapes: 4 } } }],
    ['unsupported meta model', (value: any) => { value.merge.head.methodId = NEURAL }],
    ['ignored raw merge inputs', (value: any) => { value.merge.sourceIds = ['NIRS']; value.merge.sourceChains = [{ sourceId: 'NIRS', steps: [] }] }],
  ])('refuses %s at the imported document boundary', (_, change) => {
    const value = structuredClone(preset('early'))
    change(value)
    expect(() => validatePipelineDocument(data, value)).toThrow()
  })
})
