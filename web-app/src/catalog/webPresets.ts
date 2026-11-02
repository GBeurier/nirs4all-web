import { getPresetPipeline, type PipelinePreset, type PipelinePresetVariantId } from 'nirs4all-ui/pipelines'
import { PRESETS } from './presets'
import { nodeByType } from './nodes'
import type { ContainerNode, ParamSweep, PipelineDSL, PipelineStep, TaskType } from '@/engine/types'

// The Studio presets as ready-to-run browser pipelines: the same preprocessing
// search, CV and models, with every model the browser cannot run removed. The Web
// engine runs one model per pipeline, so a Studio preset yields one entry per
// browser-compatible model. The Studio `_cartesian_` / `_or_` searches map onto the
// Web Cartesian / OR generator nodes.
export interface WebPreset {
  id: string
  /** the Studio preset it comes from, and the model it keeps */
  presetId: string
  model: string
  name: string
  description: string
  task: 'regression' | 'classification'
  pipeline: PipelineDSL
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null)

const TRANSFORMS: Record<string, string> = {
  'nirs4all.operators.transforms.scalers.StandardNormalVariate': 'n4m:preprocessing.scatter.snv',
  'nirs4all.operators.transforms.nirs.MultiplicativeScatterCorrection': 'n4m:preprocessing.scatter.msc',
  'nirs4all.operators.transforms.nirs.ExtendedMultiplicativeScatterCorrection': 'n4m:preprocessing.scatter.emsc',
  'nirs4all.operators.transforms.nirs.SavitzkyGolay': 'n4m:preprocessing.derivatives.savitzky_golay',
  'nirs4all.operators.transforms.signal.Gaussian': 'n4m:preprocessing.smoothing.gaussian',
  'nirs4all.operators.transforms.signal.Detrend': 'n4m:preprocessing.baselines.detrend',
  'nirs4all.operators.transforms.nirs.ASLSBaseline': 'n4m:preprocessing.baselines.asls',
  'nirs4all.operators.transforms.orthogonalization.OSC': 'n4m:preprocessing.orthogonalization.osc',
  'nirs4all.operators.transforms.wavelet_denoise.WaveletDenoise': 'n4m:preprocessing.wavelets.wavelet_denoise',
  'nirs4all.operators.transforms.feature_selection.FlexiblePCA': 'n4m:preprocessing.feature_selection.flexible_pca',
  'sklearn.preprocessing._data.StandardScaler': 'n4m:preprocessing.scaling.standard_scale',
}
// Python defaults that differ from n4m's (scipy SG edges, window and order).
const DEFAULTS: Record<string, Obj> = {
  'n4m:preprocessing.derivatives.savitzky_golay': { window_length: 11, polyorder: 3, deriv: 0, delta: 1, mode: 'interp' },
}

// Browser-compatible models. Classification reuses native regressors on one-hot
// classes (PLS-DA = PLS on one-hot targets).
const MODELS: Record<string, { type: string; params: (p: Obj) => Obj }> = {
  'sklearn.cross_decomposition._pls.PLSRegression': { type: 'n4m:models.pls.pls_regression', params: (p) => pick(p, ['n_components']) },
  'nirs4all.operators.models.sklearn.ikpls.IKPLS': { type: 'n4m:models.pls.pls_regression', params: (p) => ({ ...pick(p, ['n_components']), solver: 'kernel_algorithm' }) },
  'nirs4all.operators.models.sklearn.plsda.PLSDA': { type: 'n4m:models.pls.pls_regression', params: (p) => pick(p, ['n_components']) },
  'sklearn.linear_model._ridge.Ridge': { type: 'n4m:models.regularized.ridge', params: (p) => pick(p, ['alpha']) },
  'sklearn.linear_model._ridge.RidgeClassifier': { type: 'n4m:models.regularized.ridge', params: (p) => pick(p, ['alpha']) },
  'nirs4all.operators.models.sklearn.aom_pls.AOMPLSRegressor': { type: 'n4m:aom_pop.aom_pls', params: (p) => (p.n_components === undefined ? {} : { max_components: p.n_components }) },
}
const pick = (p: Obj, keys: string[]): Obj => Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]))

function transform(value: unknown, id: string): PipelineStep | null {
  const item = obj(value)
  const path = typeof value === 'string' ? value : item?.class
  const type = typeof path === 'string' ? TRANSFORMS[path] : undefined
  if (!type || !nodeByType(type)) return null
  return { id, type, params: { ...DEFAULTS[type], ...obj(item?.params) } }
}

/** One OR axis → its alternatives (null = no step). */
function alternatives(axis: unknown, id: string): PipelineStep[][] | null {
  const or = obj(axis)?._or_
  if (!Array.isArray(or)) return null
  const out: PipelineStep[][] = []
  for (const [i, choice] of or.entries()) {
    if (choice === null) { out.push([]); continue }
    const step = transform(choice, `${id}-${i}`)
    if (!step) return null
    out.push([step])
  }
  return out
}

/** Studio finetune ranges → small explicit grids on the node's own parameters
 *  (the browser has no Optuna). */
function sweeps(finetune: unknown, type: string): Record<string, ParamSweep> | undefined {
  const params = obj(obj(finetune)?.model_params)
  if (!params) return undefined
  const known = new Set(nodeByType(type)?.params.map((p) => p.name))
  const out: Record<string, ParamSweep> = {}
  for (const [studioName, spec] of Object.entries(params)) {
    const name = type === 'n4m:aom_pop.aom_pls' && studioName === 'n_components' ? 'max_components' : studioName
    if (!Array.isArray(spec) || !known.has(name)) continue
    const [kind, lo, hi] = spec as [string, number, number]
    if (kind === 'int') out[name] = { type: 'range', from: lo, to: hi, step: Math.max(1, Math.ceil((hi - lo) / 3)) }
    else if (kind === 'log_float') out[name] = { type: 'log_range', from: lo, to: hi, count: 4 }
  }
  return Object.keys(out).length ? out : undefined
}

function build(presetId: string, presetName: string, description: string, task: PipelinePresetVariantId, recipe: unknown[]): WebPreset[] {
  let search: ContainerNode | null = null
  const trailing: PipelineStep[] = []
  let cv: PipelineDSL['cv']
  const models: { name: string; step: PipelineStep }[] = []
  for (const [index, value] of recipe.entries()) {
    const item = obj(value)
    const id = `${presetId}-${task}-${index}`
    if (item && Array.isArray(item._cartesian_)) {
      const axes = item._cartesian_.map((axis, a) => alternatives(axis, `${id}-${a}`))
      if (axes.some((axis) => !axis)) return []
      search = { id: `${id}-cartesian`, container: 'generator', mode: 'cartesian',
        branches: (axes as PipelineStep[][][]).map((axis, a) => ({ id: `${id}-axis${a}`, steps: axis.flat(), optional: axis.some((alt) => alt.length === 0) })),
        ...(typeof item.count === 'number' ? { count: item.count } : {}) }
    } else if (item && Array.isArray(item._or_)) {
      const alts = alternatives(item, id)
      if (!alts) return []
      search = { id: `${id}-or`, container: 'generator', mode: 'or', branches: alts.map((steps, b) => ({ id: `${id}-alt${b}`, steps })) }
    } else if (item?.model !== undefined) {
      const model = obj(item.model)
      const path = typeof item.model === 'string' ? item.model : model?.class
      const spec = typeof path === 'string' ? MODELS[path] : undefined
      if (!spec || !nodeByType(spec.type)?.task || (task === 'classification' && nodeByType(spec.type)?.autonomous)) continue
      const step: PipelineStep = { id: `${id}-model`, type: spec.type, params: spec.params({ ...obj(model?.params), ...obj(item.params) }) }
      const sweep = sweeps(item.finetune_params, spec.type)
      if (Array.isArray(item._range_) && typeof item.param === 'string') {
        const [from, to, s] = item._range_ as number[]
        step.sweeps = { [item.param]: { type: 'range', from, to, step: s ?? 1 } }
      } else if (sweep) step.sweeps = sweep
      models.push({ name: typeof item.name === 'string' ? item.name : path as string, step })
    } else if (typeof item?.class === 'string' && /model_selection|splitters/.test(item.class)) {
      const params = obj(item.params) ?? {}
      cv = { folds: Number(params.n_splits ?? 5), seed: Number(params.random_state ?? 42) }
    } else {
      const step = transform(value, id)
      if (!step) return []
      trailing.push(step)
    }
  }
  return models.map(({ name, step }, m) => {
    const autonomous = !!nodeByType(step.type)?.autonomous
    const pipeline: PipelineDSL = { name: `${presetName} · ${name}`, steps: [], model: step, cv }
    if (!autonomous) {
      if (!search) pipeline.steps = trailing
      else if (search.mode === 'cartesian') {
        // Studio runs the trailing steps (e.g. centering) after the search: one fixed axis each.
        pipeline.containers = [{ ...search, branches: [...search.branches, ...trailing.map((s) => ({ id: `${s.id}-axis`, steps: [s] }))] }]
      } else {
        pipeline.containers = [{ ...search, branches: search.branches.map((b) => ({ ...b, steps: [...b.steps, ...trailing] })) }]
      }
    }
    return { id: `${presetId}-${task}-${m}`, presetId, model: name, name: pipeline.name, description, task, pipeline }
  })
}

/** A browser-compatible model entry of a Studio recipe. */
function browserModel(item: Obj | null): boolean {
  if (item?.model === undefined) return true
  const path = typeof item.model === 'string' ? item.model : obj(item.model)?.class
  return typeof path === 'string' && !!MODELS[path]
}

/** The Studio preset as shown in the browser gallery: one task, impossible models removed. */
export function browserPreset(preset: PipelinePreset, task: PipelinePresetVariantId): PipelinePreset {
  const pipeline = getPresetPipeline(preset, task).filter((item) => browserModel(obj(item)))
  return { ...preset, available_variants: [task], variants: { [task]: { ...preset.variants?.[task], pipeline } } } as PipelinePreset
}

export const WEB_PRESETS: WebPreset[] = PRESETS.flatMap((preset) =>
  (preset.available_variants ?? []).flatMap((task) => build(preset.id, preset.name, preset.description, task, getPresetPipeline(preset, task))))

export const webPresetsFor = (task: TaskType): WebPreset[] =>
  WEB_PRESETS.filter((preset) => (preset.task === 'regression') === (task === 'regression'))
