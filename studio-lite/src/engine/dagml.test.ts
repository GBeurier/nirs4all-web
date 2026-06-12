import { describe, expect, it } from 'vitest'
import { activeOrGenerator, countVariants, expandGeneratorVariants, hasUnsupportedGenerator, toCompatDsl } from './dagml'
import { compatNodeIds } from './dagml-engine'
import type { ContainerNode, PipelineDSL } from './types'

// These assertions pin the emitted JSON field names to dag-ml's ground truth in
// dag-ml/crates/dag-ml-core/src/dsl.rs. A drift here silently collapses every
// pipeline to 1 variant, so the names are checked exactly:
//   PipelineDslParamGenerator (tag `kind`, snake_case): Or{param,values},
//     Range{param,start,stop,step}, LogRange{param,start,stop,count}  (dsl.rs:194-225)
//   PipelineDslVariantChoice { label, params }                        (dsl.rs:185-191)
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

  it('ignores legacy finetune fields; web search is explicit sweeps only', () => {
    const out = toCompatDsl(basePipeline({
      model: { id: 'm', type: 'PLS', params: {}, sweeps: { n_components: { type: 'or', choices: [5, 10] } } },
      finetune: { enabled: true, n_trials: 10, params: [{ name: 'scale', type: 'categorical', choices: ['a', 'b', 'c'] }] },
    }))
    const gens = modelStep(out).generators as Record<string, unknown>[]
    expect(gens).toEqual([{ kind: 'or', param: 'n_components', values: [5, 10] }])
    expect(modelStep(out).tuning).toBeUndefined()
  })

  it('emits DSL-level generation_strategy + max_variants (dsl.rs:39/41)', () => {
    const out = toCompatDsl(basePipeline({ generation: { strategy: 'cartesian', maxVariants: 64 } })) as Record<string, unknown>
    expect(out.generation_strategy).toBe('cartesian')
    expect(out.max_variants).toBe(64)
  })

  it('emits a KFold split when cv is present (FEATURE 1)', () => {
    const out = toCompatDsl(basePipeline({ cv: { folds: 4, seed: 7 } })) as { pipeline: Record<string, unknown>[] }
    const split = out.pipeline.find((s) => 'split' in s) as { split: { type: string; n_splits: number } }
    expect(split.split).toEqual({ type: 'KFold', n_splits: 4 })
  })

  it('omits the KFold split when cv is ABSENT — refit-only (FEATURE 1)', () => {
    const out = toCompatDsl(basePipeline({ cv: undefined })) as Record<string, unknown>
    const pipeline = out.pipeline as Record<string, unknown>[]
    expect(pipeline.some((s) => 'split' in s)).toBe(false)
    expect(out.root_seed).toBe(0)
  })

  it('emits a concat_transform feature-union with branch ids → steps (FEATURE 2)', () => {
    // dag-ml lower_concat_transform_step (dsl.rs:1742) → PipelineDslConcatTransformStep
    // { branches:[PipelineDslConcatBranch{id,steps}] } (dsl.rs:379-403).
    const out = toCompatDsl(basePipeline({
      branch: { branches: [
        { id: 'snv', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
        { id: 'd1', steps: [{ id: 'b', type: 'SavitzkyGolay', params: { deriv: 1 } }] },
      ] },
    })) as { pipeline: Record<string, unknown>[] }
    const ct = out.pipeline.find((s) => 'concat_transform' in s) as { concat_transform: Record<string, unknown[]> }
    expect(ct).toBeDefined()
    expect(Object.keys(ct.concat_transform)).toEqual(['snv', 'd1'])
    // bare SNV lowers to the "SNV" string sugar; SG carries preprocessing+params
    expect(ct.concat_transform.snv).toEqual(['SNV'])
    expect(ct.concat_transform.d1).toEqual([{ preprocessing: 'SavitzkyGolay', params: { deriv: 1 } }])
  })

  it('skips the branch block when fewer than 2 branches (FEATURE 2)', () => {
    const out = toCompatDsl(basePipeline({ branch: { branches: [{ id: 'only', steps: [] }] } })) as { pipeline: Record<string, unknown>[] }
    expect(out.pipeline.some((s) => 'concat_transform' in s)).toBe(false)
  })
})

// --- DAG container tree (branch / concat / merge / generator) -----------------
const branchC = (over: Partial<ContainerNode> = {}): ContainerNode => ({
  id: 'c1', container: 'branch',
  branches: [
    { id: 'snv', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
    { id: 'd1', steps: [{ id: 'b', type: 'SavitzkyGolay', params: { deriv: 1 } }] },
  ],
  ...over,
})

describe('toCompatDsl DAG containers', () => {
  it('lowers a branch container to a concat_transform (dsl.rs:1742)', () => {
    const out = toCompatDsl(basePipeline({ containers: [branchC()] })) as { pipeline: Record<string, unknown>[] }
    const ct = out.pipeline.find((s) => 'concat_transform' in s) as { concat_transform: Record<string, unknown[]> }
    expect(Object.keys(ct.concat_transform)).toEqual(['snv', 'd1'])
    expect(ct.concat_transform.snv).toEqual(['SNV'])
    expect(ct.concat_transform.d1).toEqual([{ preprocessing: 'SavitzkyGolay', params: { deriv: 1 } }])
  })
  it('keeps param sweeps inside branch container steps', () => {
    const out = toCompatDsl(basePipeline({
      containers: [branchC({
        branches: [
          { id: 'snv', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
          { id: 'd1', steps: [{ id: 'b', type: 'SavitzkyGolay', params: { deriv: 1 }, sweeps: { deriv: { type: 'or', choices: [1, 2] } } }] },
        ],
      })],
    })) as { pipeline: Record<string, unknown>[] }
    const ct = out.pipeline.find((s) => 'concat_transform' in s) as { concat_transform: Record<string, unknown[]> }
    expect(ct.concat_transform.d1).toEqual([
      { preprocessing: 'SavitzkyGolay', params: { deriv: 1 }, generators: [{ kind: 'or', param: 'deriv', values: [1, 2] }] },
    ])
  })
  it('lowers concat_transform + merge containers to concat_transform too (same fusion)', () => {
    for (const kind of ['concat_transform', 'merge'] as const) {
      const out = toCompatDsl(basePipeline({ containers: [branchC({ container: kind })] })) as { pipeline: Record<string, unknown>[] }
      expect(out.pipeline.some((s) => 'concat_transform' in s)).toBe(true)
    }
  })
  it('lowers an OR generator container to a `_or_` step (dsl.rs:1837)', () => {
    const gen: ContainerNode = { id: 'g', container: 'generator', mode: 'or', branches: [
      { id: 'o1', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
      { id: 'o2', steps: [{ id: 'b', type: 'MSC', params: {} }] },
    ] }
    const out = toCompatDsl(basePipeline({ containers: [gen] })) as { pipeline: Record<string, unknown>[] }
    const orStep = out.pipeline.find((s) => '_or_' in s) as { _or_: unknown[] }
    expect(orStep._or_).toEqual([['SNV'], ['MSC']])
  })
  it('lowers a Cartesian generator container to a `_cartesian_` step (dsl.rs:1874)', () => {
    const gen: ContainerNode = { id: 'g', container: 'generator', mode: 'cartesian', branches: [
      { id: 'ax1', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
      { id: 'ax2', steps: [{ id: 'b', type: 'Detrend', params: { degree: 1 } }] },
    ] }
    const out = toCompatDsl(basePipeline({ containers: [gen] })) as { pipeline: Record<string, unknown>[] }
    const cart = out.pipeline.find((s) => '_cartesian_' in s) as { _cartesian_: unknown[] }
    expect(cart._cartesian_).toHaveLength(2)
    expect(cart._cartesian_[0]).toEqual({ _or_: [['SNV']] })
  })
})

describe('generator container variant expansion / guards', () => {
  const orGen: ContainerNode = { id: 'g', container: 'generator', mode: 'or', branches: [
    { id: 'o1', steps: [{ id: 'a', type: 'StandardNormalVariate', params: {} }] },
    { id: 'o2', steps: [{ id: 'b', type: 'MSC', params: {} }] },
    { id: 'o3', steps: [{ id: 'c', type: 'Detrend', params: { degree: 1 } }] },
  ] }
  it('countVariants counts an OR generator (one variant per alternative)', () => {
    expect(countVariants(basePipeline({ containers: [orGen] }))).toBe(3)
  })
  it('activeOrGenerator finds exactly one runnable OR generator', () => {
    expect(activeOrGenerator(basePipeline({ containers: [orGen] }))?.id).toBe('g')
  })
  it('expandGeneratorVariants appends each alternative to the main steps', () => {
    const cands = expandGeneratorVariants(basePipeline({ steps: [{ id: 's0', type: 'Detrend', params: {} }], containers: [orGen] }))
    expect(cands).toHaveLength(3)
    // each candidate keeps the base step + adds the alternative; the generator is dropped
    expect(cands[0].dsl.steps.map((s) => s.type)).toEqual(['Detrend', 'StandardNormalVariate'])
    expect(cands[1].dsl.steps.map((s) => s.type)).toEqual(['Detrend', 'MSC'])
    expect(cands.every((c) => !c.dsl.containers || c.dsl.containers.every((x) => x.container !== 'generator'))).toBe(true)
  })
  it('flags Cartesian + multiple OR generators as unsupported (clear guard)', () => {
    const cart: ContainerNode = { ...orGen, id: 'g2', mode: 'cartesian' }
    expect(hasUnsupportedGenerator(basePipeline({ containers: [cart] }))).toBe(true)
    expect(hasUnsupportedGenerator(basePipeline({ containers: [orGen, { ...orGen, id: 'g2' }] }))).toBe(true)
    expect(hasUnsupportedGenerator(basePipeline({ containers: [orGen] }))).toBe(false)
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
  it('does not count legacy finetune fields', () => {
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
