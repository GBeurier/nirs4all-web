import { getPresetPipeline, type PipelinePreset, type PipelinePresetVariantId } from 'nirs4all-ui/pipelines'
import { nodeByType } from './nodes'
import type { ContainerNode, PipelineDSL, PipelineStep } from '@/engine/types'
import { PRESETS } from './presets'

type PresetImport = { kind: 'ready'; pipeline: PipelineDSL } | { kind: 'unavailable'; reason: string }
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export function repositoryPresetUrl(preset: PipelinePreset, task: PipelinePresetVariantId): string {
  return `https://repository.nirs4all.org/pipeline/studio_${preset.id}_${task}.html`
}

// Repository publishes the original Studio recipe as { pipeline: [...] }. Match
// the full recipe, not a filename or a partial operator list, before adapting it.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = record(value)
  if (object) return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function findStudioPresetRecipe(value: unknown): { preset: PipelinePreset; variant: PipelinePresetVariantId } | null {
  const pipeline = record(value)?.pipeline
  if (!Array.isArray(pipeline)) return null
  const recipe = canonical(pipeline)
  for (const preset of PRESETS) {
    for (const variant of preset.available_variants ?? []) {
      if (canonical(getPresetPipeline(preset, variant)) === recipe) return { preset, variant }
    }
  }
  return null
}

// Only existing native equivalents are adapted. Other recipes stay canonical.
const TRANSFORMS: Record<string, string> = {
  'nirs4all.operators.transforms.scalers.StandardNormalVariate': 'n4m:preprocessing.scatter.snv',
  'nirs4all.operators.transforms.nirs.MultiplicativeScatterCorrection': 'n4m:preprocessing.scatter.msc',
  'nirs4all.operators.transforms.nirs.SavitzkyGolay': 'n4m:preprocessing.derivatives.savitzky_golay',
}

function transform(value: unknown, id: string): PipelineStep | null {
  const item = record(value)
  const path = typeof value === 'string' ? value : item?.class
  if (typeof path !== 'string' || !TRANSFORMS[path] || !nodeByType(TRANSFORMS[path])) return null
  if (item && Object.keys(item).some((key) => !['class', 'params'].includes(key))) return null
  if (item?.params !== undefined && !record(item.params)) return null
  // Studio's Python wrapper uses scipy's interpolated SG edges; n4m defaults
  // to mirrored edges and has different window/polynomial defaults.
  const defaults = path === 'nirs4all.operators.transforms.nirs.SavitzkyGolay'
    ? { window_length: 11, polyorder: 3, deriv: 0, delta: 1, mode: 'interp' }
    : {}
  return { id, type: TRANSFORMS[path], params: { ...defaults, ...record(item?.params) } }
}

/** Adapt only complete, faithfully representable recipes to the current Web editor. */
export function importStudioPreset(preset: PipelinePreset, task: PipelinePresetVariantId): PresetImport {
  const recipe = getPresetPipeline(preset, task)
  const steps: PipelineStep[] = []
  const containers: ContainerNode[] = []
  let model: PipelineStep | undefined
  let cv: PipelineDSL['cv']
  const unavailable = (reason: string): PresetImport => ({ kind: 'unavailable', reason })
  for (const [index, value] of recipe.entries()) {
    const id = `studio-${preset.id}-${task}-${index}`
    const item = record(value)
    const plain = transform(value, id)
    if (plain && !model && !cv && containers.length === 0) {
      steps.push(plain)
    } else if (item && Array.isArray(item._or_) && Object.keys(item).length === 1 && !model && !cv) {
      const alternatives = item._or_.map((choice, i) => transform(choice, `${id}-${i}`))
      if (!alternatives.every((step): step is PipelineStep => step !== null)) {
        return unavailable('This preset includes operator alternatives that are not available in the browser runtime.')
      }
      containers.push({ id, container: 'generator', mode: 'or', branches: alternatives.map((step) => ({ id: step.id, steps: [step] })) })
    } else if (item?.class === 'sklearn.model_selection._split.KFold' && !cv && !model) {
      const params = record(item.params)
      if (Object.keys(item).some((key) => !['class', 'params'].includes(key)) ||
          !params || Object.keys(params).some((key) => !['n_splits', 'shuffle', 'random_state'].includes(key)) ||
          params.shuffle !== true || typeof params.random_state !== 'number' ||
          (params.n_splits !== undefined && (!Number.isInteger(params.n_splits) || Number(params.n_splits) < 2))) {
        return unavailable('The browser cannot preserve this preset’s cross-validation settings.')
      }
      cv = { folds: Number(params.n_splits ?? 5), seed: params.random_state, strategy: 'sample' }
    } else if (item?.model === 'sklearn.cross_decomposition._pls.PLSRegression' && !model && task === 'regression') {
      const type = 'n4m:models.pls.pls_regression'
      if (!nodeByType(type) || Object.keys(item).some((key) => !['model', 'name', 'params', '_range_', 'param'].includes(key))) {
        return unavailable('The browser cannot preserve this preset’s model settings.')
      }
      if (item.params !== undefined && !record(item.params)) return unavailable('The preset contains unsupported model parameters.')
      model = { id, type, params: { ...record(item.params) } }
      if (item._range_ !== undefined) {
        if (!Array.isArray(item._range_) || item._range_.length < 2 || item._range_.length > 3 ||
            !item._range_.every((number) => typeof number === 'number' && Number.isFinite(number)) ||
            typeof item.param !== 'string' || Number(item._range_[2] ?? 1) <= 0) {
          return unavailable('The browser cannot preserve this preset’s parameter sweep.')
        }
        model.sweeps = { [item.param]: { type: 'range', from: item._range_[0], to: item._range_[1], step: item._range_[2] ?? 1 } }
      }
    } else {
      return unavailable('This recipe uses operators or search settings that require Studio. The complete original recipe is available below.')
    }
  }
  if (!model) return unavailable('This preset has no model supported by the browser runtime.')
  return { kind: 'ready', pipeline: { name: preset.name, steps, model, cv, containers: containers.length ? containers : undefined } }
}
