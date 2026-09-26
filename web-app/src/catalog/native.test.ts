import { describe, expect, it } from 'vitest'
import { legacyParamVector } from '@/engine/methods/params'
import { LEGACY_DISPATCH } from './legacy-dispatch'
import manifest from './n4m-manifest.json'
import { NATIVE_MODEL_NODES, NATIVE_PREPROCESSING_NODES, NATIVE_SPLIT_NODES } from './native'
import { ALL_NODES, nodeByType } from './nodes'

describe('native catalog generated from the n4m manifest', () => {
  it('generates exactly one node per legacy-dispatched manifest method', () => {
    const methodIds = new Set(manifest.methods.map((m) => m.method_id))
    for (const [category, nodes] of [
      ['preprocessing', NATIVE_PREPROCESSING_NODES],
      ['model', NATIVE_MODEL_NODES],
      ['split', NATIVE_SPLIT_NODES],
    ] as const) {
      const dispatched = Object.keys(LEGACY_DISPATCH[category])
      expect(nodes.map((n) => n.id).sort()).toEqual([...dispatched].sort())
      for (const id of dispatched) expect(methodIds.has(id)).toBe(true)
    }
  })

  it('keeps DSL tokens unique across the whole catalog', () => {
    const tokens = ALL_NODES.map((n) => n.type)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('takes labels, groups, params and defaults from the manifest', () => {
    const sg = nodeByType('SavitzkyGolay')!
    expect(sg).toMatchObject({ id: 'preprocessing.derivatives.savitzky_golay', name: 'Savitzky Golay', subcategory: 'Derivatives' })
    expect(sg.params.map((p) => [p.name, p.type, p.default])).toEqual([
      ['window_length', 'int', 5],
      ['polyorder', 'int', 2],
      ['deriv', 'int', 0],
    ])
    expect(nodeByType('PLSDA')).toMatchObject({ category: 'model', task: 'binary' })
    expect(nodeByType('Ridge')).toMatchObject({ task: 'regression', classifiable: true })
    expect(nodeByType('KBinsStratified')?.params.find((p) => p.name === 'strategy')?.options?.map((o) => o.value)).toEqual(['uniform', 'quantile'])
  })

  it('encodes params positionally for the legacy dispatcher', () => {
    expect(legacyParamVector(nodeByType('SavitzkyGolay'), { window_length: 11 })).toEqual([11, 2, 0])
    expect(legacyParamVector(nodeByType('AreaNormalization'), { method: 'trapz' })).toEqual([2])
    expect(legacyParamVector(nodeByType('ToAbsorbance'), { is_percent: true })).toEqual([1, 1e-10, 1])
    expect(legacyParamVector(nodeByType('RidgePLS'), { n_components: 8, ridge_lambda: 0.5 })).toEqual([0.5])
  })
})
