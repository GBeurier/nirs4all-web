import { describe, expect, it } from 'vitest'
import { countVariants, toCompatDsl } from './dagml'
import { compatNodeIds } from './dagml-engine'
import type { PipelineDSL } from './types'

// These assertions pin the emitted JSON field names to dag-ml's ground truth in
// dag-ml/crates/dag-ml-core/src/dsl.rs. A drift here silently collapses every
// pipeline to 1 variant, so the names are checked exactly:
//   PipelineDslParamGenerator (tag `kind`, snake_case): Or{param,values},
//     Range{param,start,stop,step}, LogRange{param,start,stop,count}  (dsl.rs:194-225)
//   PipelineDslVariantChoice { label, params }                        (dsl.rs:185-191)
//   PipelineDslTuningSpec { n_trials, model_params, ... }             (dsl.rs:165-182)
//   root: generation_strategy / max_variants / root_seed             (dsl.rs:39/41/47)

function basePipeline(over: Partial<PipelineDSL> = {}): PipelineDSL {
  return {
    name: 'test',
    steps: [],
    model: { id: 'm', type: 'PLS', params: { n_components: 10 } },
    cv: { folds: 5, seed: 42 },
    ...over,
  }
}

function modelStep(out: object): Record<string, unknown> {
  const pipeline = (out as { pipeline: Record<string, unknown>[] }).pipeline
  return pipeline.find((s) => 'model' in s) as Record<string, unknown>
}

describe('toCompatDsl generator DSL', () => {
  it('keeps a flat pipeline minimal (no generation fields, root_seed echoed)', () => {
    const out = toCompatDsl(basePipeline()) as Record<string, unknown>
    expect(out.root_seed).toBe(42)
    expect(out.generation_strategy).toBeUndefined()
    expect(out.max_variants).toBeUndefined()
    expect(modelStep(out).generators).toBeUndefined()
    expect(modelStep(out).tuning).toBeUndefined()
  })

  it('emits an `or` generator with `kind`/`param`/`values` (dsl.rs:196)', () => {
    const out = toCompatDsl(basePipeline({ model: { id: 'm', type: 'PLS', params: { n_components: 10 }, sweeps: { n_components: { type: 'or', choices: [5, 10, 20] } } } }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens).toHaveLength(1)
    expect(gens[0]).toEqual({ kind: 'or', param: 'n_components', values: [5, 10, 20] })
  })

  it('emits a `range` generator with `start`/`stop`/`step` (dsl.rs:204)', () => {
    const out = toCompatDsl(basePipeline({ model: { id: 'm', type: 'PLS', params: { n_components: 10 }, sweeps: { n_components: { type: 'range', from: 2, to: 10, step: 2 } } } }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens[0]).toEqual({ kind: 'range', param: 'n_components', start: 2, stop: 10, step: 2 })
  })

  it('emits a `log_range` generator with `start`/`stop`/`count` (dsl.rs:216)', () => {
    const out = toCompatDsl(basePipeline({ model: { id: 'm', type: 'Ridge', params: { alpha: 1 }, sweeps: { alpha: { type: 'log_range', from: 0.001, to: 100, count: 6 } } } }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens[0]).toEqual({ kind: 'log_range', param: 'alpha', start: 0.001, stop: 100, count: 6 })
  })

  it('emits per-step `variants` as { label, params } (dsl.rs:185)', () => {
    const out = toCompatDsl(basePipeline({
      steps: [{ id: 's1', type: 'SavitzkyGolay', params: {}, variants: [
        { label: 'd1', type: 'SavitzkyGolay', params: { deriv: 1 } },
        { label: 'd2', type: 'SavitzkyGolay', params: { deriv: 2 } },
      ] }],
    }))
    const pipeline = (out as { pipeline: Record<string, unknown>[] }).pipeline
    const sg = pipeline.find((s) => s.preprocessing === 'SavitzkyGolay') as Record<string, unknown>
    expect(sg.variants).toEqual([
      { label: 'd1', params: { deriv: 1 } },
      { label: 'd2', params: { deriv: 2 } },
    ])
  })

  it('lowers finetune to REAL model param_generators, NOT a `tuning` block (#1)', () => {
    // dag-ml only collects generation dims from `variants` + `param_generators`
    // (dsl.rs:4501); a `tuning` block is metadata-only and would plan as 1 variant.
    // So finetune must become `generators` on the model node that dag-ml expands.
    const out = toCompatDsl(basePipeline({
      finetune: { enabled: true, n_trials: 25, approach: 'grouped', eval_mode: 'best', params: [
        { name: 'n_components', type: 'int', low: 2, high: 6 },
        { name: 'scale', type: 'categorical', choices: ['x', 'y'] },
      ] },
    }))
    const model = modelStep(out)
    expect(model.tuning).toBeUndefined()
    const gens = model.generators as Record<string, unknown>[]
    expect(gens).toEqual([
      { kind: 'range', param: 'n_components', start: 2, stop: 6, step: 1 },
      { kind: 'or', param: 'scale', values: ['x', 'y'] },
    ])
  })

  it('merges finetune generators AFTER the model\'s own sweeps (#1)', () => {
    const out = toCompatDsl(basePipeline({
      model: { id: 'm', type: 'PLS', params: {}, sweeps: { n_components: { type: 'or', choices: [5, 10] } } },
      finetune: { enabled: true, n_trials: 10, params: [{ name: 'scale', type: 'categorical', choices: ['a', 'b', 'c'] }] },
    }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens).toEqual([
      { kind: 'or', param: 'n_components', values: [5, 10] },
      { kind: 'or', param: 'scale', values: ['a', 'b', 'c'] },
    ])
  })

  it('drops finetune params that cannot be lowered to a finite grid (#1)', () => {
    // float w/o step and log_float w/o count have no discrete grid → dropped, not
    // emitted as a generator (which would otherwise overstate / fail to expand).
    const out = toCompatDsl(basePipeline({
      finetune: { enabled: true, n_trials: 10, params: [
        { name: 'alpha', type: 'float', low: 0, high: 1 },
        { name: 'gamma', type: 'log_float', low: 0.001, high: 10 },
        { name: 'n_components', type: 'int', low: 2, high: 4 },
      ] },
    }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens).toEqual([{ kind: 'range', param: 'n_components', start: 2, stop: 4, step: 1 }])
  })

  it('emits DSL-level generation_strategy + max_variants (dsl.rs:39/41)', () => {
    const out = toCompatDsl(basePipeline({ generation: { strategy: 'cartesian', maxVariants: 64 } })) as Record<string, unknown>
    expect(out.generation_strategy).toBe('cartesian')
    expect(out.max_variants).toBe(64)
  })
})

describe('countVariants (display-only mirror of dag-ml enumeration)', () => {
  it('is 1 for a flat pipeline', () => {
    expect(countVariants(basePipeline())).toBe(1)
  })
  it('counts an or-sweep', () => {
    expect(countVariants(basePipeline({ model: { id: 'm', type: 'PLS', params: {}, sweeps: { n_components: { type: 'or', choices: [5, 10, 20] } } } }))).toBe(3)
  })
  it('multiplies a cartesian product across steps', () => {
    expect(countVariants(basePipeline({
      steps: [{ id: 's', type: 'SavitzkyGolay', params: {}, sweeps: { deriv: { type: 'or', choices: [1, 2] } } }],
      model: { id: 'm', type: 'PLS', params: {}, sweeps: { n_components: { type: 'range', from: 2, to: 10, step: 2 } } },
    }))).toBe(2 * 5)
  })
  it('takes the max for zip', () => {
    expect(countVariants(basePipeline({
      steps: [{ id: 's', type: 'SavitzkyGolay', params: {}, sweeps: { deriv: { type: 'or', choices: [1, 2] } } }],
      model: { id: 'm', type: 'PLS', params: {}, sweeps: { n_components: { type: 'or', choices: [5, 10, 20] } } },
      generation: { strategy: 'zip' },
    }))).toBe(3)
  })
  it('counts the REAL finetune grid (not n_trials) (#1)', () => {
    // n_components int 2..6 step1 → 5 points; scale categorical x/y → 2; 5×2 = 10,
    // regardless of n_trials=25.
    expect(countVariants(basePipeline({
      finetune: { enabled: true, n_trials: 25, params: [
        { name: 'n_components', type: 'int', low: 2, high: 6 },
        { name: 'scale', type: 'categorical', choices: ['x', 'y'] },
      ] },
    }))).toBe(5 * 2)
  })
  it('ignores finetune params that cannot be lowered (#1)', () => {
    // a lone un-lowerable float (no step) contributes nothing → count stays 1.
    expect(countVariants(basePipeline({
      finetune: { enabled: true, n_trials: 25, params: [{ name: 'alpha', type: 'float', low: 0, high: 1 }] },
    }))).toBe(1)
  })
})

describe('compatNodeIds (mirror of dag-ml compat node_counter, dsl.rs:2486)', () => {
  it('numbers EVERY operator step incl. bare SNV/MSC, model shares the counter (#3)', () => {
    // dag-ml mints transform:compat.N for bare string sugar too (dsl.rs:1120 String
    // branch → next_node_id), advancing one shared counter; the model is last.
    const ids = compatNodeIds(basePipeline({
      steps: [
        { id: 'a', type: 'StandardNormalVariate', params: {} },                 // bare SNV → transform:compat.0
        { id: 'b', type: 'SavitzkyGolay', params: {}, sweeps: { deriv: { type: 'or', choices: [1, 2] } } }, // transform:compat.1
        { id: 'c', type: 'MSC', params: {} },                                   // bare MSC → transform:compat.2
      ],
      model: { id: 'm', type: 'PLS', params: {} },
    }))
    expect(ids.stepIds).toEqual(['transform:compat.0', 'transform:compat.1', 'transform:compat.2'])
    // a sweep on step b (after a bare SNV) must target transform:compat.1, not .0
    expect(ids.stepIds[1]).toBe('transform:compat.1')
    expect(ids.modelId).toBe('model:compat.3')
  })
  it('model id reflects the step count for a flat (model-only) pipeline (#3)', () => {
    expect(compatNodeIds(basePipeline()).modelId).toBe('model:compat.0')
  })
})
