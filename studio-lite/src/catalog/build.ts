import type { PipelineDSL, TaskType } from '@/engine/types'
import { defaultParams, modelsForTask } from './nodes'
import { PRESETS } from './presets'
import type { Preset } from './types'

let uid = 0
const sid = () => `step-${(uid++).toString(36)}`

export function dslFromPreset(preset: Preset): PipelineDSL {
  return {
    name: preset.name,
    steps: preset.steps.map((s) => ({ id: sid(), type: s.type, params: { ...defaultParams(s.type), ...(s.params ?? {}) } })),
    model: { id: sid(), type: preset.model.type, params: { ...defaultParams(preset.model.type), ...(preset.model.params ?? {}) } },
    cv: { folds: 5, seed: 42 },
  }
}

/** A sensible starting pipeline for a task, with a model valid for that task. */
export function defaultPipeline(taskType: TaskType): PipelineDSL {
  const preset =
    PRESETS.find((p) => p.task === taskType) ??
    PRESETS.find((p) => (p.task !== 'regression') === (taskType !== 'regression')) ??
    PRESETS[0]
  const dsl = dslFromPreset(preset)
  const models = modelsForTask(taskType)
  if (!models.some((m) => m.type === dsl.model.type) && models.length) {
    dsl.model = { id: sid(), type: models[0].type, params: defaultParams(models[0].type) }
  }
  return dsl
}
