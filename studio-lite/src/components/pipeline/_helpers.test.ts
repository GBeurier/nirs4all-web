import { describe, expect, it } from 'vitest'
import { normalizeImportedPipeline } from './_helpers'

// Validates the pipeline-JSON import path (Import button + future .n4a re-import).
// A foreign/hand-edited payload must never crash the editor: unknown node types,
// non-preprocessing steps, or a missing model are rejected; ids/params/cv are
// filled from the catalog defaults.
describe('normalizeImportedPipeline', () => {
  it('normalizes a valid pipeline, filling ids/params/cv', () => {
    const p = normalizeImportedPipeline({
      name: 'My pipe',
      steps: [{ type: 'StandardNormalVariate' }, { type: 'SavitzkyGolay', params: { window: 15 } }],
      model: { type: 'PLS', params: { n_components: 8 } },
    })
    expect(p).not.toBeNull()
    expect(p!.name).toBe('My pipe')
    expect(p!.steps).toHaveLength(2)
    expect(p!.steps.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true)
    // catalog defaults merged for SavitzkyGolay (polyorder/deriv) + provided window kept
    expect(p!.steps[1].params.window).toBe(15)
    expect(p!.steps[1].params).toHaveProperty('polyorder')
    expect(p!.model!.type).toBe('PLS')
    expect(p!.model!.params.n_components).toBe(8)
    // cv defaults (missing cv → legacy 5-fold default, back-compatible)
    expect(p!.cv!.folds).toBe(5)
    expect(p!.cv!.seed).toBe(42)
  })

  it('clamps cv folds into [2,10] and keeps a provided seed', () => {
    const p = normalizeImportedPipeline({
      steps: [],
      model: { type: 'PLS' },
      cv: { folds: 99, seed: 7 },
    })
    expect(p!.cv!.folds).toBe(10)
    expect(p!.cv!.seed).toBe(7)
  })

  it('rejects an unknown preprocessing node type', () => {
    expect(normalizeImportedPipeline({ steps: [{ type: 'NotARealOp' }], model: { type: 'PLS' } })).toBeNull()
  })

  it('rejects a model node that is not a catalog model', () => {
    // SNV is a preprocessing op, not a model → invalid in the model slot
    expect(normalizeImportedPipeline({ steps: [], model: { type: 'StandardNormalVariate' } })).toBeNull()
  })

  it('rejects a preprocessing slot holding a model type', () => {
    expect(normalizeImportedPipeline({ steps: [{ type: 'PLS' }], model: { type: 'PLS' } })).toBeNull()
  })

  it('rejects malformed payloads', () => {
    expect(normalizeImportedPipeline(null)).toBeNull()
    expect(normalizeImportedPipeline({})).toBeNull()
    expect(normalizeImportedPipeline({ steps: 'nope', model: { type: 'PLS' } })).toBeNull()
    expect(normalizeImportedPipeline({ steps: [], model: {} })).toBeNull()
    expect(normalizeImportedPipeline({ steps: [null], model: { type: 'PLS' } })).toBeNull()
  })
})
