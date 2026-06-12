import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Preset } from '@/catalog/types'
import { defaultParams, nodeByType } from '@/catalog/nodes'
import type {
  ContainerNode,
  ContainerType,
  FinetuneParam,
  FinetuneParamType,
  GeneratorMode,
  ParamSweep,
  PipelineBranch,
  PipelineDSL,
  PipelineStep,
  StepVariant,
  SweepType,
} from '@/engine/types'

// Drag-and-drop payload keys (native HTML5 DnD — no extra dependency).
/** dataTransfer key carrying a catalog node `type` dragged from the palette. */
export const DND_NEW_NODE = 'application/x-n4a-node'
/** dataTransfer key carrying a canvas step index being reordered. */
export const DND_REORDER = 'application/x-n4a-reorder'

/** Resolve a lucide-react icon by its catalog name, with a sane fallback. */
export function iconByName(name: string | undefined): LucideIcon {
  if (name) {
    const registry = Icons as unknown as Record<string, LucideIcon>
    const found = registry[name]
    if (found) return found
  }
  return Icons.Circle
}

let stepCounter = 0
/** Mint a unique, stable-per-session step instance id. */
export function newStepId(type: string): string {
  stepCounter += 1
  return `${type.toLowerCase()}-${Date.now().toString(36)}-${stepCounter}`
}

let branchCounter = 0
/** Mint a branch id that's a valid dag-ml branch id token ([A-Za-z0-9_-]). */
export function newBranchId(): string {
  branchCounter += 1
  return `branch-${Date.now().toString(36)}-${branchCounter}`
}

let containerCounter = 0
/** Mint a unique structural-container instance id. */
export function newContainerId(): string {
  containerCounter += 1
  return `dag-${Date.now().toString(36)}-${containerCounter}`
}

/** A fresh container of the given kind, pre-seeded with 2 empty branches (the
 *  minimum for a feature fusion / a meaningful OR generator). */
export function newContainer(container: ContainerType, mode?: GeneratorMode): ContainerNode {
  return {
    id: newContainerId(),
    container,
    mode: container === 'generator' ? (mode ?? 'or') : undefined,
    output: container === 'merge' ? 'features' : undefined,
    branches: [
      { id: newBranchId(), steps: [] },
      { id: newBranchId(), steps: [] },
    ],
  }
}

/** Migrate the legacy single inline `branch` block (v1) into a `branch`
 *  ContainerNode, so old persisted sessions / .n4a bundles open in the new tree
 *  editor. The editor only ever writes `containers`. Idempotent. */
export function migrateLegacyBranch(dsl: PipelineDSL): PipelineDSL {
  if (!dsl.branch) return dsl
  const migrated: ContainerNode = { id: newContainerId(), container: 'branch', branches: dsl.branch.branches }
  return { ...dsl, branch: undefined, containers: [...(dsl.containers ?? []), migrated] }
}

/** Build an editable PipelineDSL from a preset, merging defaults with preset params. */
export function pipelineFromPreset(preset: Preset): PipelineDSL {
  const steps: PipelineStep[] = preset.steps.map((s) => ({
    id: newStepId(s.type),
    type: s.type,
    params: { ...defaultParams(s.type), ...(s.params ?? {}) },
  }))
  const model: PipelineStep = {
    id: newStepId(preset.model.type),
    type: preset.model.type,
    params: { ...defaultParams(preset.model.type), ...(preset.model.params ?? {}) },
  }
  return {
    name: preset.name,
    steps,
    model,
    cv: { folds: 5, seed: 42 },
  }
}

export function isAutonomousPipeline(dsl: PipelineDSL): boolean {
  return !!dsl.model && !!nodeByType(dsl.model.type)?.autonomous
}

/** Autonomous models (AOM/POP) screen preprocessing internally. Keep split/CV
 *  and model params, but remove external preprocessing and feature-fusion DAG
 *  state that would otherwise be misleading in the editor. */
export function sanitizeAutonomousPipeline(dsl: PipelineDSL): PipelineDSL {
  if (!isAutonomousPipeline(dsl)) return dsl
  return {
    ...dsl,
    steps: [],
    branch: undefined,
    containers: undefined,
    finetune: undefined,
  }
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
const cleanParams = (raw: unknown, type: string): Record<string, unknown> => {
  const provided = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return { ...defaultParams(type), ...provided }
}

// --- generators / legacy tuning on import ----------------------------------
// An imported pipeline can carry optional sweep / variant intent. Legacy
// `finetune` specs are converted to explicit finite model sweeps because the
// browser build does not ship Optuna. Each entry is validated loosely:
// malformed entries are dropped, never fatal.

const SWEEP_TYPES = new Set<SweepType>(['range', 'log_range', 'or'])
/** Parse one per-param ParamSweep from imported JSON (drops if malformed). */
function parseSweep(raw: unknown): ParamSweep | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Record<string, unknown>
  if (typeof s.type !== 'string' || !SWEEP_TYPES.has(s.type as SweepType)) return undefined
  const out: ParamSweep = { type: s.type as SweepType }
  if (typeof s.from === 'number') out.from = s.from
  if (typeof s.to === 'number') out.to = s.to
  if (typeof s.step === 'number') out.step = s.step
  if (typeof s.count === 'number') out.count = s.count
  if (Array.isArray(s.choices)) out.choices = s.choices.filter((c) => ['string', 'number', 'boolean'].includes(typeof c)) as (string | number | boolean)[]
  // require the fields the chosen kind needs, else drop
  if (out.type === 'or' && (!out.choices || out.choices.length === 0)) return undefined
  if ((out.type === 'range' || out.type === 'log_range') && (out.from === undefined || out.to === undefined)) return undefined
  return out
}

/** Parse a step's `sweeps` map (param → ParamSweep); undefined when none valid. */
function parseSweeps(raw: unknown): Record<string, ParamSweep> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, ParamSweep> = {}
  for (const [param, sweep] of Object.entries(raw as Record<string, unknown>)) {
    const s = parseSweep(sweep)
    if (s) out[param] = s
  }
  return Object.keys(out).length ? out : undefined
}

/** Parse a step's `variants` array (labelled alternatives); undefined when empty. */
function parseVariants(raw: unknown): StepVariant[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: StepVariant[] = []
  for (const vv of raw) {
    if (!vv || typeof vv !== 'object') continue
    const v = vv as Record<string, unknown>
    const type = typeof v.type === 'string' ? v.type : undefined
    const label = typeof v.label === 'string' ? v.label : type
    if (!type || !label) continue
    out.push({ label, type, params: cleanParams(v.params, type) })
  }
  return out.length ? out : undefined
}

// Canonical finetune param-type vocabulary. nirs4all-studio (commit 50077b5,
// api/pipeline_canonical.py) normalizes the single legacy alias `float_log` to
// `log_float` over the canonical token set {int, float, categorical, log_float};
// mirror that exactly on import so older exported pipelines hydrate to the token
// the legacy-to-sweep migration understands.
const FINETUNE_TYPE_ALIASES: Record<string, FinetuneParamType> = {
  float_log: 'log_float',
  log_float: 'log_float',
  int: 'int',
  float: 'float',
  categorical: 'categorical',
}

/** Parse one finetune param, normalizing its type alias (float_log → log_float). */
function parseFinetuneParam(raw: unknown): FinetuneParam | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.name !== 'string' || !p.name) return null
  const type = typeof p.type === 'string' ? FINETUNE_TYPE_ALIASES[p.type] : undefined
  if (!type) return null
  const out: FinetuneParam = { name: p.name, type }
  if (typeof p.low === 'number') out.low = p.low
  if (typeof p.high === 'number') out.high = p.high
  if (typeof p.step === 'number') out.step = p.step
  if (typeof p.count === 'number') out.count = p.count
  if (Array.isArray(p.choices)) out.choices = p.choices.filter((c) => ['string', 'number'].includes(typeof c)) as (string | number)[]
  return out
}

function finetuneParamToSweep(p: FinetuneParam): ParamSweep | undefined {
  if (p.type === 'categorical') {
    const choices = p.choices ?? []
    return choices.length > 0 ? { type: 'or', choices } : undefined
  }
  if (p.low === undefined || p.high === undefined || p.high < p.low) return undefined
  if (p.type === 'log_float') {
    return p.count !== undefined ? { type: 'log_range', from: p.low, to: p.high, count: p.count } : undefined
  }
  if (p.type === 'float') {
    return p.step !== undefined && p.step > 0 ? { type: 'range', from: p.low, to: p.high, step: p.step } : undefined
  }
  return { type: 'range', from: p.low, to: p.high, step: p.step ?? 1 }
}

/** Parse a legacy finetune spec into explicit model sweeps. */
function parseLegacyFinetuneSweeps(raw: unknown): Record<string, ParamSweep> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  if (f.enabled === false) return undefined
  const params = Array.isArray(f.params) ? f.params.map(parseFinetuneParam).filter((p): p is FinetuneParam => p !== null) : []
  const out: Record<string, ParamSweep> = {}
  for (const p of params) {
    const sweep = finetuneParamToSweep(p)
    if (sweep) out[p.name] = sweep
  }
  return Object.keys(out).length ? out : undefined
}

function mergeSweeps(...items: (Record<string, ParamSweep> | undefined)[]): Record<string, ParamSweep> | undefined {
  const out = Object.assign({}, ...items.filter(Boolean))
  return Object.keys(out).length ? out : undefined
}

/**
 * Validate + normalize an imported pipeline payload against the catalog. Unknown
 * node types, malformed steps, or a model invalid for the catalog are rejected
 * (returns null); missing ids/params/cv are filled with defaults. This keeps a
 * hand-edited or foreign JSON from crashing the editor or producing an invalid run.
 */
export function normalizeImportedPipeline(value: unknown): PipelineDSL | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.steps)) return null
  if (typeof v.model !== 'object' || v.model === null) return null

  const parsePreprocChain = (arr: unknown): PipelineStep[] | null => {
    if (!Array.isArray(arr)) return null
    const out: PipelineStep[] = []
    for (const raw of arr) {
      if (typeof raw !== 'object' || raw === null) return null
      const s = raw as Record<string, unknown>
      if (typeof s.type !== 'string') return null
      const def = nodeByType(s.type)
      if (!def || def.category !== 'preprocessing') return null // unknown / non-preprocessing step
      out.push({
        id: typeof s.id === 'string' ? s.id : newStepId(s.type),
        type: s.type,
        params: cleanParams(s.params, s.type),
        sweeps: parseSweeps(s.sweeps),
        variants: parseVariants(s.variants),
      })
    }
    return out
  }

  const steps = parsePreprocChain(v.steps)
  if (steps === null) return null

  const m = v.model as Record<string, unknown>
  if (typeof m.type !== 'string') return null
  const modelDef = nodeByType(m.type)
  if (!modelDef || modelDef.category !== 'model') return null
  const legacyFinetuneSweeps = parseLegacyFinetuneSweeps(v.finetune)
  const modelSweeps = parseSweeps(m.sweeps)
  const model: PipelineStep = {
    id: typeof m.id === 'string' ? m.id : newStepId(m.type),
    type: m.type,
    params: cleanParams(m.params, m.type),
    sweeps: mergeSweeps(legacyFinetuneSweeps, modelSweeps),
  }

  // optional split operator (a split-category catalog node); dropped if unknown.
  let split: PipelineStep | undefined
  if (v.split && typeof v.split === 'object' && !Array.isArray(v.split)) {
    const sp = v.split as Record<string, unknown>
    const sdef = typeof sp.type === 'string' ? nodeByType(sp.type) : undefined
    if (sdef && sdef.category === 'split') {
      split = { id: typeof sp.id === 'string' ? sp.id : newStepId(sp.type as string), type: sp.type as string, params: cleanParams(sp.params, sp.type as string) }
    }
  }

  const parseBranches = (arr: unknown): PipelineBranch[] | null => {
    if (!Array.isArray(arr)) return null
    const parsed: PipelineBranch[] = []
    for (const bb of arr) {
      if (!bb || typeof bb !== 'object') return null
      const b = bb as Record<string, unknown>
      const bsteps = parsePreprocChain(b.steps)
      if (bsteps === null) return null
      parsed.push({ id: typeof b.id === 'string' ? b.id : newBranchId(), steps: bsteps })
    }
    return parsed
  }

  // optional DAG containers (the recursive tree): each is a branch/concat/merge/
  // generator with ≥2 preprocessing sub-chains. Malformed/under-filled containers
  // are dropped, not fatal.
  const containers: ContainerNode[] = []
  if (Array.isArray(v.containers)) {
    for (const cc of v.containers) {
      if (!cc || typeof cc !== 'object') continue
      const c = cc as Record<string, unknown>
      const kind = c.container
      if (!['branch', 'concat_transform', 'merge', 'generator'].includes(String(kind))) continue
      const branches = parseBranches(c.branches)
      if (!branches || branches.length < 2) continue
      containers.push({
        id: typeof c.id === 'string' ? c.id : newContainerId(),
        container: kind as ContainerType,
        mode: kind === 'generator' ? (c.mode === 'cartesian' ? 'cartesian' : 'or') : undefined,
        output: kind === 'merge' ? (c.output === 'predictions' ? 'predictions' : 'features') : undefined,
        branches,
      })
    }
  }
  // legacy feature-union block (v1) → migrate into a `branch` container.
  if (v.branch && typeof v.branch === 'object' && !Array.isArray(v.branch)) {
    const braw = v.branch as Record<string, unknown>
    const parsed = parseBranches(braw.branches)
    if (parsed && parsed.length >= 2) containers.push({ id: newContainerId(), container: 'branch', branches: parsed })
  }

  // CV is OPTIONAL (FEATURE 1): present → KFold; absent → refit-only run.
  // Back-compatible: a missing `cv` defaults to 5-fold (legacy files always had it),
  // an explicit `cv: null`/`false` means refit-only.
  let cv: PipelineDSL['cv']
  if (v.cv === null || v.cv === false) cv = undefined
  else {
    const cvRaw = v.cv && typeof v.cv === 'object' ? (v.cv as Record<string, unknown>) : {}
    cv = { folds: clampInt(cvRaw.folds, 2, 10, 5), seed: clampInt(cvRaw.seed, -2147483648, 2147483647, 42) }
  }
  return {
    name: typeof v.name === 'string' && v.name.trim() ? v.name : 'Imported pipeline',
    split,
    steps,
    containers: containers.length ? containers : undefined,
    model,
    cv,
  }
}

/**
 * A light, pre-run validation pass — soft *warnings* (never blocking) for the
 * structurally-possible mistakes lite's fixed-slot editor can't prevent by
 * construction (model-last / split-before-model are already guaranteed by the
 * canvas layout, so they need no rule). A trimmed subset of nirs4all-studio's
 * validation engine: STEP_EMPTY_BRANCHES, an empty/degenerate generator, and a
 * duplicate-consecutive-operator check. dag-ml stays authoritative at run time;
 * this is just editor guidance.
 */
export function pipelineWarnings(dsl: PipelineDSL): string[] {
  const out: string[] = []
  if (isAutonomousPipeline(dsl) && (dsl.steps.length > 0 || !!dsl.branch || (dsl.containers?.length ?? 0) > 0)) {
    out.push(`${nodeByType(dsl.model!.type)?.name ?? dsl.model!.type}: external preprocessing and DAG containers are ignored because the model screens preprocessing internally.`)
  }
  if (isAutonomousPipeline(dsl) && Array.isArray(dsl.model?.params.operator_bank) && dsl.model.params.operator_bank.includes(16)) {
    out.push(`${nodeByType(dsl.model!.type)?.name ?? dsl.model!.type}: Whittaker is ignored in browser AOM/POP runs because libn4m 0.98 stalls on wide spectra with that operator.`)
  }
  const containers = dsl.containers ?? []
  for (const c of containers) {
    const label = nodeByType(c.container === 'generator' ? (c.mode === 'cartesian' ? 'GeneratorCartesian' : 'GeneratorOr') : c.container === 'concat_transform' ? 'ConcatTransform' : c.container === 'merge' ? 'Merge' : 'Branch')?.name ?? c.container
    const nonEmpty = c.branches.filter((b) => b.steps.length > 0)
    // empty branch in a structural container contributes nothing to the fusion
    if (c.container !== 'generator' && nonEmpty.length < c.branches.length) {
      out.push(`${label}: ${c.branches.length - nonEmpty.length} empty branch${c.branches.length - nonEmpty.length === 1 ? '' : 'es'} — add operators or remove them (empty branches contribute nothing).`)
    }
    // a generator needs ≥2 *distinct* non-empty alternatives to expand to >1 variant
    if (c.container === 'generator' && nonEmpty.length < 2) {
      out.push(`${label}: fewer than 2 non-empty alternatives — it expands to a single variant. Fill at least two branches.`)
    }
  }
  // duplicate consecutive preprocessing op in the linear chain (likely a slip)
  for (let i = 1; i < dsl.steps.length; i++) {
    if (dsl.steps[i].type === dsl.steps[i - 1].type) {
      out.push(`Duplicate consecutive ${nodeByType(dsl.steps[i].type)?.name ?? dsl.steps[i].type} — applying it twice in a row is usually unintended.`)
    }
  }
  return out
}

/** Compact one-line summary of a step's parameters for the canvas node subtitle. */
export function paramSummary(step: PipelineStep): string {
  const entries = Object.entries(step.params ?? {})
  if (!entries.length) return ''
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${typeof v === 'number' ? v : String(v)}`)
    .join(' · ')
}

const PHASE_LABELS: Record<string, string> = {
  preprocess: 'Preprocessing',
  fit_cv: 'Cross-validation',
  select: 'Selecting',
  refit: 'Refitting',
  predict: 'Predicting',
  done: 'Done',
}
export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}
