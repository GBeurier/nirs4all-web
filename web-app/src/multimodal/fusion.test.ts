import { describe, expect, it } from 'vitest'
import { defaultLabConfig, describeRecipe } from './recipes'
import { fusionLevel, fusionPresets, toLabDocument } from './fusion'
import type { LabCase, LabDataset, LabSource } from './types'
import { sweepPlan } from './sweeps'

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
        // Swept presets (PLS components) compile variant by variant; the structure is the qualified one.
        const plan = sweepPlan(preset.document)
        const variants = Array.from({ length: plan.count }, (_, index) => toLabDocument(data, plan.variant([index]).chain))
        const sweepable = preset.id.startsWith('single:') || preset.id === 'early' || preset.id === 'mbpls'
        const swept = plan.count > 1
        if (!sweepable) expect(plan.count).toBe(1)
        if (sweepable && preset.id === 'early') expect(swept).toBe(true)
        if (swept) {
          const values = variants.map(item => (item.merge.kind === 'none' ? item.branches[0].head : item.merge.head).params.n_components)
          expect(values).toEqual(values.map((_, index) => 5 + 5 * index))
          expect(Math.max(...(values as number[]))).toBeLessThanOrEqual(15)
        }
        const document = variants[0]
        expect(fusionLevel(document)).toBe(preset.level)
        const strip = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, item) => (swept || preset.level === 'late') && key === 'n_components' ? undefined : item))
        const actual = strip(describeRecipe(data, { ...config, pipeline: document })) as ReturnType<typeof describeRecipe>
        if (preset.id === 'early-rf' || preset.id.startsWith('cnn-burn')) {
          // Host models: the head carries the task seed (and the CNN its branch geometry); sources stay native.
          const operator = Object.values(actual.operators)[0]
          const head = operator.steps[0]
          expect(head.params.seed).toBe(config.validation.seed)
          if (preset.id.startsWith('cnn-burn')) {
            const sources = operator.sourceOps.map(op => data.sources.find(source => source.id === op.source_id)!)
            expect(head.params.branch_kinds).toEqual(sources.map(source => source.modality === 'image' ? 2 : 1))
            expect((head.params.branch_shapes as number[]).length).toBe(sources.length * 3)
          }
          return
        }
        if (preset.id === 'late-aom') {
          // AOM-PLS per spectrum (native Methods calibration), PLS for other sources, Ridge meta-model.
          for (const operator of Object.values(actual.operators)) {
            const source = data.sources.find(item => item.id === operator.sourceOps[0]?.source_id)
            if (source) expect(operator.steps[0].methodId).toBe(source.modality === 'spectroscopy' ? 'aom_pop.calibration' : 'models.pls.pls_regression')
          }
          expect(actual.steps.at(-1)).toMatchObject({ kind: 'merge_model' })
          return
        }
        if (preset.id === 'mid-pca') {
          expect(Object.values(actual.operators)[0].sourceOps.every(source => source.steps.at(-1)!.methodId === 'preprocessing.feature_selection.flexible_pca')).toBe(true)
          return
        }
        const single = preset.id.startsWith('single:') ? preset.id.slice('single:'.length) : null
        // The CNN preset is the qualified multibranch recipe with the lab's CNN settings.
        const cnn = { filters: 8, kernel_size: 3, embedding_dim: 16, head_hidden: 16, epochs: 150, batch_size: 16, learning_rate: 0.01, weight_decay: 0.0001 }
        const expected = strip(describeRecipe(data, { ...config, strategy: single ? 'single' : preset.id === 'cnn' ? 'mid' : LEGACY[preset.id], baseModels: ['pls'],
          ...(single ? { singleSourceId: single } : {}), ...(preset.id === 'cnn' ? { cnn } : {}) })) as ReturnType<typeof describeRecipe>
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

describe('classification presets (declared class vocabulary)', () => {
  const base = dataset('images')
  const data: LabDataset = { ...base, target: { name: 'variety', unit: 'variety', kind: 'categorical', classes: ['a', 'b', 'c'],
    values: Float64Array.from(base.sampleIds.map((_, index) => index % 3)) } }
  const config = defaultLabConfig(data)
  const presets = fusionPresets(data)

  it('offers classifier heads only and late fusion over class probabilities', () => {
    expect(presets.map(preset => preset.id)).toEqual(['single:nirs', 'single:image', 'early', 'early-rf', 'mid-pca', 'cnn-burn', 'late-mean', 'late-stacking'])
    for (const preset of presets) {
      const plan = sweepPlan(preset.document)
      const recipe = describeRecipe(data, { ...config, pipeline: toLabDocument(data, plan.variant(plan.sizes.map(() => 0)).chain) })
      for (const operator of Object.values(recipe.operators)) {
        expect(['models.classification.pls_logistic', 'host.mljs.random_forest_classifier', 'host.burn.cnn_classifier']).toContain(operator.steps[0].methodId)
      }
    }
  })

  it('routes out-of-fold probabilities into the mean and the stacking meta-model', () => {
    const recipe = (id: string) => describeRecipe(data, { ...config, pipeline: toLabDocument(data, presets.find(preset => preset.id === id)!.document) })
    const mean = recipe('late-mean')
    const [branch, merge] = mean.steps as Array<Record<string, any>>
    expect(branch.branches.every((item: any) => item.steps[0].prediction_output_ports?.[0] === 'probabilities')).toBe(true)
    expect(merge).toMatchObject({ kind: 'merge', merge_mode: 'fusion_proba_mean_label', source_ports: { 'model:nirs': 'probabilities', 'model:image': 'probabilities' } })
    const stacking = recipe('late-stacking').steps[1] as Record<string, any>
    expect(stacking).toMatchObject({ kind: 'merge_model', source_ports: { 'model:nirs': 'probabilities', 'model:image': 'probabilities' } })
    expect(stacking.operator.steps[0].methodId).toBe('models.classification.pls_logistic')
    // Host classifiers receive the declared number of classes, never chosen by the user.
    const forest = Object.values(recipe('early-rf').operators)[0]
    expect(forest.steps[0].params).toMatchObject({ n_classes: 3, seed: config.validation.seed })
  })

  it('refuses regression heads for a class target and classifier heads for a numeric target', () => {
    const regression = fusionPresets(base).find(preset => preset.id === 'mid-pca')!.document
    expect(() => describeRecipe(data, { ...config, pipeline: toLabDocument(data, regression) })).toThrow(/classifier heads/)
    const classifier = presets.find(preset => preset.id === 'mid-pca')!.document
    expect(() => describeRecipe(base, { ...defaultLabConfig(base), pipeline: toLabDocument(base, classifier) })).toThrow(/numeric target/)
  })
})
