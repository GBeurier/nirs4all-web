// dag-ml-wasm participation: compile, validate AND execute the pipeline DSL through
// the real dag-ml coordinator (Rust → WASM). dag-ml is the reproducible ML
// coordinator of the ecosystem; it canonicalizes the linear pipeline into a GraphSpec
// and its SequentialScheduler runs FIT_CV in-browser (see dagml-engine.ts), invoking
// a JS controller that runs the numerics via libn4m. This module is the lighter
// compile/validate entry (used for the badge + as a fallback probe).
import type { FinetuneParam, ParamSweep, PipelineDSL, PipelineStep, StepVariant } from './types'

export interface DagMlLineage {
  engine: 'dag-ml-wasm'
  version: string | null
  compiled: boolean
  /** true when dag-ml's scheduler actually executed the phase (not just compiled) */
  executed?: boolean
  graph?: unknown
  nodeCount?: number
  error?: string
  /** the dag-ml-data provider layer that materialized & served the X/y blocks */
  dataProvider?: {
    layer: string
    status: string
    fingerprints?: { schema: string; plan: string; relation: string | null }
    representation?: string
    version?: string
    error?: string
  }
}

export type DagMlMod = typeof import('./wasm/dagml/dag_ml_wasm.js')
let modPromise: Promise<DagMlMod> | null = null
/** Lazily load + init the dag-ml-wasm module (shared by the badge + the executor). */
export async function loadDagMl(): Promise<DagMlMod> {
  if (!modPromise) {
    modPromise = (async () => {
      const m = await import('./wasm/dagml/dag_ml_wasm.js')
      await m.default()
      return m
    })()
  }
  return modPromise
}

export const dagMlAvailable = () => typeof location === 'undefined' || location.protocol !== 'file:'
const canUse = dagMlAvailable

// --- generator DSL emission -------------------------------------------------
// Field names below are emitted to match dag-ml's PipelineDslParamGenerator /
// PipelineDslVariantChoice exactly (dag-ml/crates/dag-ml-core/src/dsl.rs):
//   - Or:       { kind:'or',        param, values:[...] }              (dsl.rs:196)
//   - Range:    { kind:'range',     param, start, stop, step }         (dsl.rs:204)
//   - LogRange: { kind:'log_range', param, start, stop, count }        (dsl.rs:216)
//   tag is `kind`, rename_all snake_case (dsl.rs:194); generator values are bare
//   JSON (untagged PipelineDslGeneratorValue, dsl.rs:255).
// A step object carries them under `generators` (alias of param_generators,
// dsl.rs:153/2250) and `variants` (dsl.rs:152/2249). The DSL root carries
// `generation_strategy` / `max_variants` / `root_seed` (dsl.rs:39/41/47, parsed
// compat-side at dsl.rs:998-1003). NOTE: the model `tuning` block (dsl.rs:150/2246)
// is metadata-only — dag-ml does NOT expand it into generation dimensions
// (collect_operator_generation reads only `variants` + `param_generators`,
// dsl.rs:4501), so finetune is lowered to real `generators` on the model node
// (see finetuneGenerators) rather than a `tuning` block.

/** One dag-ml param_generator JSON object for a single-param sweep. */
function genFromSweep(param: string, sweep: ParamSweep): object | null {
  if (sweep.type === 'or') {
    const values = sweep.choices ?? []
    if (values.length === 0) return null
    return { kind: 'or', param, values }
  }
  if (sweep.type === 'log_range') {
    if (sweep.from === undefined || sweep.to === undefined) return null
    return { kind: 'log_range', param, start: sweep.from, stop: sweep.to, count: Math.max(2, sweep.count ?? 5) }
  }
  // range
  if (sweep.from === undefined || sweep.to === undefined) return null
  return { kind: 'range', param, start: sweep.from, stop: sweep.to, step: sweep.step ?? 1 }
}

/** dag-ml param_generators[] for a step's sweeps map (skips empty/invalid). */
function generatorsForStep(step: PipelineStep): object[] {
  if (!step.sweeps) return []
  const gens: object[] = []
  for (const [param, sweep] of Object.entries(step.sweeps)) {
    const g = genFromSweep(param, sweep)
    if (g) gens.push(g)
  }
  return gens
}

/** dag-ml variants[] (PipelineDslVariantChoice: { label, params }) for a step. */
function variantsForStep(variants: StepVariant[] | undefined): object[] {
  if (!variants || variants.length === 0) return []
  return variants.map((v) => ({ label: v.label, params: { ...v.params } }))
}

/**
 * Lower a finetune (model `tuning`) param to a real dag-ml param_generator the
 * compiler EXPANDS into generation dimensions — NOT a `tuning` block. dag-ml's
 * compat importer only collects generation dims from `variants` + `param_generators`
 * (dsl.rs collect_operator_generation / 4501); `tuning` is serialized to metadata
 * (`dsl_tuning`) and never expanded, so a `tuning`-only finetune would plan as a
 * single variant. We map the search space to a discrete grid the engine actually
 * sweeps + selects over:
 *   - categorical → `or` over choices
 *   - int        → `range` (integer grid, step defaults to 1, inclusive)
 *   - float      → `range` ONLY when a discretizing `step` is given (else unbounded)
 *   - log_float  → `log_range` ONLY when a `count` is given
 * A param that can't be lowered to a finite grid is dropped (returns null) rather
 * than overstating the variant count.
 */
function finetuneSweep(p: FinetuneParam): ParamSweep | null {
  if (p.type === 'categorical') {
    const choices = p.choices ?? []
    return choices.length > 0 ? { type: 'or', choices } : null
  }
  if (p.low === undefined || p.high === undefined || p.high < p.low) return null
  if (p.type === 'log_float') {
    return p.count !== undefined ? { type: 'log_range', from: p.low, to: p.high, count: p.count } : null
  }
  if (p.type === 'float') {
    return p.step !== undefined && p.step > 0 ? { type: 'range', from: p.low, to: p.high, step: p.step } : null
  }
  // int: an integer grid; default step 1
  return { type: 'range', from: p.low, to: p.high, step: p.step ?? 1 }
}

/** dag-ml param_generators[] for the finetune search space (lowerable params only). */
function finetuneGenerators(finetune: PipelineDSL['finetune']): object[] {
  if (!finetune?.enabled || finetune.params.length === 0) return []
  const gens: object[] = []
  for (const p of finetune.params) {
    const sweep = finetuneSweep(p)
    if (!sweep) continue
    const g = genFromSweep(p.name, sweep)
    if (g) gens.push(g)
  }
  return gens
}

// Map the studio-lite pipeline to dag-ml's nirs4all-compat DSL (accepted by the
// compatibility importer: bare "SNV"/"MSC", {preprocessing,params}, {model,params}),
// now carrying per-step `generators`/`variants`, model `tuning`, and DSL-level
// `generation_strategy`/`max_variants`/`root_seed` so dag-ml expands the cartesian
// product of variants itself.
export function toCompatDsl(dsl: PipelineDSL): object {
  const steps: unknown[] = [{ sources: ['x'] }]
  for (const s of dsl.steps) {
    const generators = generatorsForStep(s)
    const variants = variantsForStep(s.variants)
    const hasGen = generators.length > 0 || variants.length > 0
    if (s.type === 'StandardNormalVariate' && !hasGen) steps.push('SNV')
    else if (s.type === 'MSC' && !hasGen) steps.push('MSC')
    else {
      const step: Record<string, unknown> = { preprocessing: s.type, params: s.params }
      if (generators.length) step.generators = generators
      if (variants.length) step.variants = variants
      steps.push(step)
    }
  }
  steps.push({ split: { type: 'KFold', n_splits: dsl.cv.folds } })

  const modelStep: Record<string, unknown> = {
    model: dsl.model.type === 'PLSDA' ? 'PLSDA' : 'PLSRegression',
    params: dsl.model.params,
  }
  // The model node carries BOTH its explicit param sweeps AND the finetune search
  // space — both lowered to real param_generators so dag-ml expands + selects them
  // (the finetune `tuning` block is metadata-only in dag-ml and was never swept).
  const modelGenerators = [...generatorsForStep(dsl.model), ...finetuneGenerators(dsl.finetune)]
  if (modelGenerators.length) modelStep.generators = modelGenerators
  const modelVariants = variantsForStep(dsl.model.variants)
  if (modelVariants.length) modelStep.variants = modelVariants
  steps.push(modelStep)

  const out: Record<string, unknown> = {
    id: `n4a-lite-${dsl.name}`.replace(/[^A-Za-z0-9_.:-]+/g, '-'),
    pipeline: steps,
    root_seed: dsl.cv.seed,
  }
  if (dsl.generation) {
    out.generation_strategy = dsl.generation.strategy
    if (dsl.generation.maxVariants !== undefined) out.max_variants = dsl.generation.maxVariants
  }
  return out
}

/**
 * Display-only count of the cartesian product of all sweeps + variants in the
 * pipeline. dag-ml is authoritative (it enumerates + caps via `max_variants`);
 * this only powers the editor's `×N` chip and the pre-run guard.
 */
export function sweepVariantCount(sweep: ParamSweep): number {
  if (sweep.type === 'or') return sweep.choices?.length ?? 0
  if (sweep.type === 'log_range') return Math.max(2, sweep.count ?? 5)
  if (sweep.from === undefined || sweep.to === undefined) return 0
  const step = sweep.step ?? 1
  if (step === 0) return 0
  return Math.max(1, Math.floor((sweep.to - sweep.from) / step) + 1)
}

function stepDimensions(step: PipelineStep): number[] {
  const dims: number[] = []
  if (step.sweeps) for (const sweep of Object.values(step.sweeps)) {
    const n = sweepVariantCount(sweep)
    if (n > 1) dims.push(n)
  }
  if (step.variants && step.variants.length > 1) dims.push(step.variants.length)
  return dims
}

export function countVariants(dsl: PipelineDSL): number {
  const dims: number[] = []
  for (const s of dsl.steps) dims.push(...stepDimensions(s))
  dims.push(...stepDimensions(dsl.model))
  // finetune contributes one cartesian dimension per LOWERABLE param (the real
  // grid dag-ml expands), NOT n_trials — params that can't be lowered to a finite
  // grid are dropped so the count never overstates what dag-ml actually sweeps.
  if (dsl.finetune?.enabled) {
    for (const p of dsl.finetune.params) {
      const sweep = finetuneSweep(p)
      if (!sweep) continue
      const n = sweepVariantCount(sweep)
      if (n > 1) dims.push(n)
    }
  }
  if (dims.length === 0) return 1
  if (dsl.generation?.strategy === 'zip') return Math.max(...dims)
  return dims.reduce((a, b) => a * b, 1)
}

/** Compile+validate a pipeline via dag-ml-wasm. Best-effort: never throws. */
export async function compileWithDagMl(dsl: PipelineDSL): Promise<DagMlLineage> {
  if (!canUse()) return { engine: 'dag-ml-wasm', version: null, compiled: false, error: 'dag-ml-wasm not loaded under file://' }
  try {
    const m = await loadDagMl()
    const json = JSON.stringify(toCompatDsl(dsl))
    m.validate_pipeline_dsl_json(json)
    const graphJson = m.compile_pipeline_dsl_graph_json(json)
    const graph = JSON.parse(graphJson) as { nodes?: unknown[] }
    return {
      engine: 'dag-ml-wasm',
      version: m.dag_ml_version(),
      compiled: true,
      graph,
      nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : undefined,
    }
  } catch (e) {
    return { engine: 'dag-ml-wasm', version: null, compiled: false, error: e instanceof Error ? e.message : String(e) }
  }
}
