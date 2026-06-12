import { describe, expect, it } from 'vitest'
import { normalizeImportedPipeline, pipelineWarnings, sanitizeAutonomousPipeline } from './_helpers'
import type { PipelineDSL } from '@/engine/types'

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

  it('carries per-step sweeps and variants through import (not dropped)', () => {
    const p = normalizeImportedPipeline({
      steps: [{ type: 'SavitzkyGolay', params: { window: 11 }, sweeps: { window: { type: 'range', from: 7, to: 15, step: 2 } } }],
      model: { type: 'PLS', sweeps: { n_components: { type: 'or', choices: [5, 10, 20] } } },
    })
    expect(p).not.toBeNull()
    expect(p!.steps[0].sweeps?.window).toEqual({ type: 'range', from: 7, to: 15, step: 2 })
    expect(p!.model!.sweeps?.n_components).toEqual({ type: 'or', choices: [5, 10, 20] })
  })

  it('drops malformed sweeps but keeps the step', () => {
    const p = normalizeImportedPipeline({
      steps: [{ type: 'StandardNormalVariate', sweeps: { foo: { type: 'bogus' }, bar: { type: 'or', choices: [] } } }],
      model: { type: 'PLS' },
    })
    expect(p).not.toBeNull()
    expect(p!.steps[0].sweeps).toBeUndefined()
  })

  it('migrates legacy float_log finetune params to model sweeps on import', () => {
    const p = normalizeImportedPipeline({
      steps: [],
      model: { type: 'PLS' },
      finetune: { enabled: true, n_trials: 30, params: [{ name: 'alpha', type: 'float_log', low: 1e-3, high: 100, count: 6 }] },
    })
    expect(p).not.toBeNull()
    expect(p!.finetune).toBeUndefined()
    expect(p!.model!.sweeps?.alpha).toEqual({ type: 'log_range', from: 1e-3, to: 100, count: 6 })
  })

  it('drops a legacy finetune with no lowerable params', () => {
    const p = normalizeImportedPipeline({
      steps: [],
      model: { type: 'PLS' },
      finetune: { enabled: true, params: [{ name: 'x', type: 'not-a-type' }] },
    })
    expect(p!.finetune).toBeUndefined()
    expect(p!.model!.sweeps).toBeUndefined()
  })
})

describe('pipelineWarnings (light validation pass)', () => {
  const base = (over: Partial<PipelineDSL>): PipelineDSL => ({ name: 't', steps: [], model: { id: 'm', type: 'PLS', params: {} }, ...over })

  it('flags an empty branch in a structural container', () => {
    const w = pipelineWarnings(
      base({
        containers: [{ id: 'c1', container: 'branch', branches: [{ id: 'b1', steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }] }, { id: 'b2', steps: [] }] }],
      }),
    )
    expect(w.some((m) => /empty branch/i.test(m))).toBe(true)
  })

  it('flags a generator with <2 non-empty alternatives', () => {
    const w = pipelineWarnings(
      base({
        containers: [{ id: 'g1', container: 'generator', mode: 'or', branches: [{ id: 'b1', steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }] }, { id: 'b2', steps: [] }] }],
      }),
    )
    expect(w.some((m) => /single variant/i.test(m))).toBe(true)
  })

  it('flags duplicate consecutive preprocessing ops', () => {
    const w = pipelineWarnings(
      base({ steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }, { id: 's2', type: 'StandardNormalVariate', params: {} }] }),
    )
    expect(w.some((m) => /[Dd]uplicate consecutive/.test(m))).toBe(true)
  })

  it('is clean for a healthy pipeline', () => {
    expect(pipelineWarnings(base({ steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }, { id: 's2', type: 'SavitzkyGolay', params: {} }] }))).toEqual([])
  })

  it('flags external preprocessing around an autonomous model', () => {
    const w = pipelineWarnings(base({ model: { id: 'm', type: 'AOMPLS', params: {} }, steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }] }))
    expect(w.some((m) => /screens preprocessing internally/i.test(m))).toBe(true)
  })

  it('flags disabled Whittaker in an imported AOM operator bank', () => {
    const w = pipelineWarnings(base({ model: { id: 'm', type: 'AOMPLS', params: { operator_bank: [0, 16, 10] } } }))
    expect(w.some((m) => /Whittaker is ignored/i.test(m))).toBe(true)
  })
})

describe('sanitizeAutonomousPipeline', () => {
  it('strips external preprocessing and DAG containers for AOM/POP', () => {
    const p = sanitizeAutonomousPipeline({
      name: 'aom',
      steps: [{ id: 's1', type: 'StandardNormalVariate', params: {} }],
      model: { id: 'm', type: 'AOMPLS', params: { n_components: 4 } },
      split: { id: 'sp', type: 'RandomSplit', params: {} },
      cv: { folds: 5, seed: 42 },
      containers: [{ id: 'c1', container: 'branch', branches: [{ id: 'b1', steps: [] }, { id: 'b2', steps: [] }] }],
      finetune: { enabled: true, n_trials: 10, params: [{ name: 'n_components', type: 'int', low: 1, high: 8 }] },
    })
    expect(p.steps).toEqual([])
    expect(p.containers).toBeUndefined()
    expect(p.finetune).toBeUndefined()
    expect(p.split?.type).toBe('RandomSplit')
    expect(p.cv?.folds).toBe(5)
    expect(p.model?.type).toBe('AOMPLS')
  })
})
