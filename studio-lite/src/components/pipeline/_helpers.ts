import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Preset } from '@/catalog/types'
import { defaultParams, nodeByType } from '@/catalog/nodes'
import type { ContainerNode, ContainerType, GeneratorMode, PipelineBranch, PipelineDSL, PipelineStep } from '@/engine/types'

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

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
const cleanParams = (raw: unknown, type: string): Record<string, unknown> => {
  const provided = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return { ...defaultParams(type), ...provided }
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
      out.push({ id: typeof s.id === 'string' ? s.id : newStepId(s.type), type: s.type, params: cleanParams(s.params, s.type) })
    }
    return out
  }

  const steps = parsePreprocChain(v.steps)
  if (steps === null) return null

  const m = v.model as Record<string, unknown>
  if (typeof m.type !== 'string') return null
  const modelDef = nodeByType(m.type)
  if (!modelDef || modelDef.category !== 'model') return null
  const model: PipelineStep = { id: typeof m.id === 'string' ? m.id : newStepId(m.type), type: m.type, params: cleanParams(m.params, m.type) }

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
