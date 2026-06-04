import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Preset } from '@/catalog/types'
import { defaultParams } from '@/catalog/nodes'
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

/** Minimal structural validation of an imported pipeline payload. */
export function isPipelineDSL(value: unknown): value is PipelineDSL {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.steps)) return false
  if (typeof v.model !== 'object' || v.model === null) return false
  const model = v.model as Record<string, unknown>
  return typeof model.type === 'string'
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
