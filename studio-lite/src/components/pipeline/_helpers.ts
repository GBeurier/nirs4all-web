import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Preset } from '@/catalog/types'
import { defaultParams, nodeByType } from '@/catalog/nodes'
import type { PipelineDSL, PipelineStep } from '@/engine/types'

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

  const steps: PipelineStep[] = []
  for (const raw of v.steps) {
    if (typeof raw !== 'object' || raw === null) return null
    const s = raw as Record<string, unknown>
    if (typeof s.type !== 'string') return null
    const def = nodeByType(s.type)
    if (!def || def.category !== 'preprocessing') return null // unknown / non-preprocessing step
    steps.push({ id: typeof s.id === 'string' ? s.id : newStepId(s.type), type: s.type, params: cleanParams(s.params, s.type) })
  }

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
