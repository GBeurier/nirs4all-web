import { describe, expect, it } from 'vitest'
import { loadMethodsWasm } from '@/engine/nirs4all-core'
import manifest from './n4m-manifest.json'
import {
  NATIVE_AUGMENTATION_NODES,
  NATIVE_FILTER_NODES,
  NATIVE_MODEL_NODES,
  NATIVE_PREPROCESSING_NODES,
  NATIVE_SPLIT_NODES,
  n4mToken,
} from './native'
import { ALL_NODES, modelsForTask, nodeByType } from './nodes'

const NATIVE = [...NATIVE_PREPROCESSING_NODES, ...NATIVE_FILTER_NODES, ...NATIVE_AUGMENTATION_NODES, ...NATIVE_MODEL_NODES, ...NATIVE_SPLIT_NODES]
const SUPPLIED = new Set(['y', 'labels', 'axis'])
const executable = (m: (typeof manifest.methods)[number]) =>
  !m.roles.every((r) => r === 'generic') &&
  Object.entries(m.inputs).every(([input, use]) => use !== 'required' || SUPPLIED.has(input))

describe('native catalog generated from the n4m manifest', () => {
  it('exposes every manifest method whose role and inputs the web pipeline can supply, once', () => {
    const expected = manifest.methods.filter(executable).map((m) => m.method_id).sort()
    expect(NATIVE.map((n) => n.id).sort()).toEqual(expected)
    // the untestable remainder: generic procedures and methods needing inputs a web
    // dataset has no source for (groups, feature groups, blocks, a transfer target)
    expect(manifest.methods.length - expected.length).toBe(manifest.methods.filter((m) => !executable(m)).length)
  })

  it('places each role in its pipeline slot, dual transformer/regressor methods as models', () => {
    const slot = { transformer: 'preprocessing', selector: 'preprocessing', regressor: 'model', classifier: 'model', sample_filter: 'filter', splitter: 'split', augmenter: 'augmentation' }
    for (const node of NATIVE) expect(node.category).toBe(slot[node.native!.role])
    expect(nodeByType(n4mToken('models.pls.pls_regression'))).toMatchObject({ category: 'model', native: { role: 'regressor' } })
    expect(NATIVE_PREPROCESSING_NODES.some((n) => n.id === 'models.pls.pls_regression')).toBe(false)
  })

  it('keeps DSL tokens unique across the whole catalog', () => {
    const tokens = ALL_NODES.map((n) => n.type)
    expect(new Set(tokens).size).toBe(tokens.length)
    for (const node of NATIVE) expect(node.type).toBe(`n4m:${node.id}`)
  })

  it('takes labels, groups, typed params and defaults from the manifest', () => {
    const sg = nodeByType('n4m:preprocessing.derivatives.savitzky_golay')!
    expect(sg).toMatchObject({ name: 'Savitzky Golay', subcategory: 'Derivatives' })
    expect(sg.params.map((p) => [p.name, p.type, p.default])).toEqual([
      ['window_length', 'int', 5],
      ['polyorder', 'int', 2],
      ['deriv', 'int', 0],
      ['delta', 'float', 1],
      ['mode', 'select', 'mirror'],
      ['cval', 'float', 0],
    ])
    expect(nodeByType('n4m:models.classification.pls_lda')).toMatchObject({ category: 'model', task: 'binary' })
    expect(nodeByType('n4m:aom_pop.aom_pls')).toMatchObject({ autonomous: true, task: 'regression' })
    expect(nodeByType('n4m:aom_pop.aom_pls')?.params.find((p) => p.name === 'op_kinds')).toMatchObject({ type: 'array', itemType: 'int' })
    expect(nodeByType('n4m:selection.spa')?.params.find((p) => p.name === 'top_k')).toMatchObject({ required: true })
    expect(nodeByType('n4m:selection.spa')?.params.find((p) => p.name === 'top_k')?.default).toBeUndefined()
    expect(nodeByType('n4m:splitters.kbins_stratified')?.params.find((p) => p.name === 'strategy')?.options?.map((o) => o.value)).toEqual(['uniform', 'quantile'])
  })

  it('offers native classifiers and every native regressor for classification', () => {
    const classification = modelsForTask('multiclass').map((m) => m.id)
    for (const node of NATIVE_MODEL_NODES) expect(classification.includes(node.id)).toBe(true)
    expect(modelsForTask('regression').some((m) => m.native?.role === 'classifier')).toBe(false)
  })

  it('resolves every native node to a role class of the staged @nirs4all/methods', async () => {
    const n4m = await loadMethodsWasm()
    for (const node of NATIVE) {
      const method = new (n4m.methodClass(node.id))()
      expect(method.methodId).toBe(node.id)
      const estimator = method instanceof n4m.NativeEstimator
      expect(estimator).toBe(node.category !== 'split' && node.category !== 'augmentation')
      for (const p of node.params) expect(method.paramTypes[p.name]).toBeDefined()
    }
  })
})
