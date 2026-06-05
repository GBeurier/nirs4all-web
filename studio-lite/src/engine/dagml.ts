// dag-ml-wasm participation: compile, validate AND execute the pipeline DSL through
// the real dag-ml coordinator (Rust → WASM). dag-ml is the reproducible ML
// coordinator of the ecosystem; it canonicalizes the linear pipeline into a GraphSpec
// and its SequentialScheduler runs FIT_CV in-browser (see dagml-engine.ts), invoking
// a JS controller that runs the numerics via libn4m. This module is the lighter
// compile/validate entry (used for the badge + as a fallback probe).
import type { ContainerNode, FinetuneParam, ParamSweep, PipelineDSL, PipelineStep, StepVariant } from './types'

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
/** Lower one studio-lite preprocessing step to its nirs4all-compat pipeline entry
 *  (bare "SNV"/"MSC" sugar, else `{preprocessing,params,generators?,variants?}`). */
function compatStepEntry(s: PipelineStep): unknown {
  const generators = generatorsForStep(s)
  const variants = variantsForStep(s.variants)
  const hasGen = generators.length > 0 || variants.length > 0
  if (s.type === 'StandardNormalVariate' && !hasGen) return 'SNV'
  if (s.type === 'MSC' && !hasGen) return 'MSC'
  const step: Record<string, unknown> = { preprocessing: s.type, params: s.params }
  if (generators.length) step.generators = generators
  if (variants.length) step.variants = variants
  return step
}

/** Migrate the legacy single inline `branch` block (v1) to a `branch` ContainerNode,
 *  and concatenate it with any explicit `containers`. The editor only writes
 *  `containers`; this keeps old .n4a / persisted sessions runnable. */
export function effectiveContainers(dsl: PipelineDSL): ContainerNode[] {
  const out: ContainerNode[] = []
  if (dsl.branch && dsl.branch.branches.length >= 2) {
    out.push({ id: 'legacy-branch', container: 'branch', branches: dsl.branch.branches })
  }
  if (dsl.containers) out.push(...dsl.containers)
  return out
}

/** The single OR-generator container in a pipeline, if exactly one runnable one is
 *  present (≥2 alternatives). v1 executes ONE generator-OR per pipeline. */
export function activeOrGenerator(dsl: PipelineDSL): ContainerNode | undefined {
  const gens = effectiveContainers(dsl).filter((c) => c.container === 'generator' && c.mode !== 'cartesian' && c.branches.length >= 2)
  return gens.length === 1 ? gens[0] : undefined
}

/** True when the pipeline contains a generator the host can't yet execute
 *  (a Cartesian generator, or >1 OR generator). The engine surfaces a clear guard. */
export function hasUnsupportedGenerator(dsl: PipelineDSL): boolean {
  const gens = effectiveContainers(dsl).filter((c) => c.container === 'generator' && c.branches.length >= 2)
  const cartesian = gens.some((c) => c.mode === 'cartesian')
  const ors = gens.filter((c) => c.mode !== 'cartesian')
  return cartesian || ors.length > 1
}

/** Expand a generator-OR container into one effective PipelineDSL per alternative.
 *  Each alternative's sub-chain is appended to the main `steps` (an alternative
 *  preprocessing path before the shared model), the generator container is dropped,
 *  and all OTHER containers (fusion branches) are preserved. The engine runs the
 *  EXISTING leakage-safe CV-per-variant loop over these and dag-ml selects the best.
 *  Returns a single-element list (the pipeline itself) when there's no runnable
 *  generator. */
export function expandGeneratorVariants(dsl: PipelineDSL): { label: string; dsl: PipelineDSL }[] {
  const gen = activeOrGenerator(dsl)
  if (!gen) return [{ label: 'base', dsl }]
  const others = (dsl.containers ?? []).filter((c) => c.id !== gen.id)
  // also fold a migrated legacy branch back in (it lives outside `containers`)
  const keepLegacyBranch = dsl.branch
  return gen.branches.map((b, i) => {
    const altSteps = b.steps.map((s) => ({ ...s, params: { ...s.params } }))
    const label = b.steps.length ? b.steps.map((s) => s.type).join('+') : `option ${i + 1}`
    return {
      label,
      dsl: { ...dsl, steps: [...dsl.steps, ...altSteps], containers: others.length ? others : undefined, branch: keepLegacyBranch },
    }
  })
}

/** Lower ONE feature-fusion container (branch | concat_transform | merge) to the
 *  nirs4all-compat `concat_transform` step. dag-ml's lower_concat_transform_step
 *  (dsl.rs:1742) lowers the object form `{ concat_transform: { <id>: [steps...] } }`
 *  to a PipelineDslConcatTransformStep { branches:[PipelineDslConcatBranch{id,steps}] }
 *  (dsl.rs:379-403) — a column-wise feature merge feeding the model. branch/merge
 *  in duplication mode are the SAME executable feature fusion, so all three emit
 *  the canonical concat_transform that compiles + runs identically. */
function compatFusionStep(c: ContainerNode): unknown {
  const concat: Record<string, unknown[]> = {}
  // concat tolerates empty lanes; the branch ids carry into dag-ml's graph/lineage.
  c.branches.forEach((b, i) => {
    concat[b.id || `branch${i}`] = b.steps.map(compatStepEntry)
  })
  return { concat_transform: concat }
}

/** Lower an OR generator container (alternatives → one variant each) to the
 *  nirs4all-compat `_or_` step. dag-ml's lower_or_generator (dsl.rs:1837) lowers
 *  `{ _or_: [ <subpipeline>, ... ] }` to a PipelineDslGeneratorStep { mode:Or,
 *  branches:[PipelineDslBranch{id,steps}] } (dsl.rs:1860). Each alternative is a
 *  preprocessing sub-chain tried before the shared model; the host expands these
 *  into per-variant effective DSLs (generatorVariants) for FIT_CV + selection. */
function compatOrStep(c: ContainerNode): unknown {
  return { _or_: c.branches.map((b) => b.steps.map(compatStepEntry)) }
}

/** Lower a Cartesian generator container (axes → cross-product) to the
 *  nirs4all-compat `_cartesian_` step. dag-ml's lower_cartesian_generator
 *  (dsl.rs:1874) lowers `{ _cartesian_: [ {_or_:[...]}, ... ] }` to a
 *  PipelineDslGeneratorStep { mode:Cartesian, stages:[...] } (dsl.rs:1892). Each
 *  branch of the container is one AXIS holding alternatives; we wrap each axis as
 *  an `_or_` stage. (Single-alternative axes are still valid stages.) */
function compatCartesianStep(c: ContainerNode): unknown {
  return { _cartesian_: c.branches.map((b) => ({ _or_: [b.steps.map(compatStepEntry)] })) }
}

/** Lower one container to its nirs4all-compat pipeline entry. */
export function compatContainerEntry(c: ContainerNode): unknown {
  if (c.container === 'generator') {
    return c.mode === 'cartesian' ? compatCartesianStep(c) : compatOrStep(c)
  }
  // branch | concat_transform | merge all fuse features column-wise
  return compatFusionStep(c)
}

export function toCompatDsl(dsl: PipelineDSL): object {
  const steps: unknown[] = [{ sources: ['x'] }]
  for (const s of dsl.steps) steps.push(compatStepEntry(s))

  // DAG containers (the recursive structural tree): each container lowers to its
  // dag-ml step — branch/concat_transform/merge → a column-wise feature fusion
  // (nirs4all-compat concat_transform); generator OR/Cartesian → a `_or_`/
  // `_cartesian_` generator. Containers with <2 branches are skipped (nothing to
  // fuse / no alternatives). Containers carry into dag-ml's graph/lineage.
  for (const c of effectiveContainers(dsl)) {
    if (c.branches.length < 2) continue
    steps.push(compatContainerEntry(c))
  }

  // CV is OPTIONAL: when absent the run is refit-only — emit NO KFold split_invocation.
  if (dsl.cv) steps.push({ split: { type: 'KFold', n_splits: dsl.cv.folds } })

  // A model is OPTIONAL: a preprocessing-only (or split+preproc) pipeline lowers
  // to the preprocessing chain + split, with no terminal estimator step.
  if (dsl.model) {
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
  }

  const out: Record<string, unknown> = {
    id: `n4a-lite-${dsl.name}`.replace(/[^A-Za-z0-9_.:-]+/g, '-'),
    pipeline: steps,
    root_seed: dsl.cv?.seed ?? 0,
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

/** Number of variants ONE generator container contributes. OR/Cartesian both
 *  enumerate one variant per branch (each branch is an alternative sub-pipeline);
 *  dag-ml is authoritative for the real cartesian product across stages. Fusion
 *  containers (branch/concat/merge) contribute no variants (one fused matrix). */
export function containerVariants(c: ContainerNode): number {
  if (c.container !== 'generator') return 1
  return Math.max(1, c.branches.length)
}

export function countVariants(dsl: PipelineDSL): number {
  const dims: number[] = []
  for (const s of dsl.steps) dims.push(...stepDimensions(s))
  if (dsl.model) dims.push(...stepDimensions(dsl.model))
  // generator containers each add a cartesian dimension equal to their variant
  // count (OR = #alternatives). Fusion containers add nothing.
  for (const c of effectiveContainers(dsl)) {
    const n = containerVariants(c)
    if (n > 1) dims.push(n)
  }
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
