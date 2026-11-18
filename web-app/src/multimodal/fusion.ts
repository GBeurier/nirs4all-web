import type { PipelineCatalog, PipelineChainDocument, PipelineOperatorDefinition, PipelineOperatorParameter } from 'nirs4all-ui/pipelineEditor'
import { toCanonicalPipeline } from 'nirs4all-ui/pipelineEditor'
import type { LabDataset, LabPipelineBranch, LabPipelineDocument, LabPipelineStep, LabSource, LabSourceChain } from './types'
import { NEURAL, validatePipelineDocument } from './recipes'

/**
 * Canonical multisource pipelines for the laboratory.
 *
 * Recipes use the nirs4all pipeline structure (`source_branch`,
 * `merge_sources`, `branch` with `by_source`, `merge`, `model`) with native
 * Methods method IDs as operator classes. `toLabDocument` maps the supported
 * subset onto the native execution document and refuses everything else with
 * an explicit reason; it never guesses a missing source, model or merge.
 */

export const PLS = 'models.pls.pls_regression'
export const RIDGE = 'models.regularized.ridge'
export const MBPLS = 'models.multiblock.mb_pls'
export const PCA = 'preprocessing.feature_selection.flexible_pca'
const STANDARD = 'preprocessing.scaling.standard_scale'

/** Fusion level shown to learners. Presentation only: the document decides execution. */
export type FusionLevel = 'single' | 'early' | 'embedding' | 'intermediate' | 'late'

export const FUSION_LEVEL_LABEL: Record<FusionLevel, string> = {
  single: 'Single source',
  early: 'Early fusion',
  embedding: 'Embedding fusion',
  intermediate: 'Intermediate fusion',
  late: 'Late fusion',
}

const int = (name: string, label: string, value: number, min: number, max: number, step = 1, description?: string): PipelineOperatorParameter =>
  ({ name, label, type: 'int', default: value, min, max, step, ...(description ? { description } : {}) })
const float = (name: string, label: string, value: number, min: number, max?: number, description?: string): PipelineOperatorParameter =>
  ({ name, label, type: 'float', default: value, min, ...(max !== undefined ? { max } : {}), ...(description ? { description } : {}) })
const bool = (name: string, label: string, value: boolean): PipelineOperatorParameter => ({ name, label, type: 'bool', default: value })

function op(type: 'preprocessing' | 'model', category: string, classPath: string, name: string, description: string,
  parameters: PipelineOperatorParameter[] = [], tags: string[] = []): PipelineOperatorDefinition {
  return { id: classPath, name, type, category, classPath, description, parameters, tags }
}

/** Native operators the laboratory executes. Parameter defaults are the values sent to Methods. */
export const LAB_OPERATORS: readonly PipelineOperatorDefinition[] = [
  op('preprocessing', 'Scatter correction', 'preprocessing.scatter.snv', 'SNV',
    'Standard normal variate: centres and scales each spectrum by its own mean and standard deviation. Spectra only.',
    [], ['spectra']),
  op('preprocessing', 'Scatter correction', 'preprocessing.scatter.msc', 'MSC',
    'Multiplicative scatter correction against the mean training spectrum. Spectra only.', [], ['spectra']),
  op('preprocessing', 'Derivatives and smoothing', 'preprocessing.derivatives.savitzky_golay', 'Savitzky–Golay',
    'Local polynomial smoothing or derivative along the spectral axis. Spectra only.', [
      int('window_length', 'Window (points, odd)', 11, 3, 51, 2),
      int('polyorder', 'Polynomial order', 2, 0, 5),
      int('deriv', 'Derivative order', 1, 0, 2),
    ], ['spectra']),
  op('preprocessing', 'Baseline', 'preprocessing.baselines.detrend', 'Detrend',
    'Removes a polynomial trend from each spectrum. Spectra only.', [int('polyorder', 'Polynomial order', 1, 0, 3)], ['spectra']),
  op('preprocessing', 'Scaling', STANDARD, 'Standard scaling',
    'Per-variable centring and unit-variance scaling, fitted on the training scope only.',
    [bool('with_mean', 'Centre', true), bool('with_std', 'Scale to unit variance', true),
      { ...int('ddof', 'Degrees of freedom removed', 0, 0, 1), isAdvanced: true }]),
  op('preprocessing', 'Scaling', 'preprocessing.scaling.block_rms', 'Block RMS scaling',
    'Divides the whole source block by one training-fitted root-mean-square scale, so blocks of different width contribute comparably once combined.'),
  op('preprocessing', 'Embedding', PCA, 'PCA embedding',
    'Projects the source onto its first principal components, fitted on the training scope. The scores are a compact embedding of the source.',
    [float('n_components', 'Components', 5, 1, 50, 'A whole number of components, or a fraction (0–1) of explained variance.')], ['embedding']),
  op('model', 'Linear models', PLS, 'PLS regression', 'Partial least squares regression on the incoming features.', [
    int('n_components', 'Components', 3, 1, 30),
    bool('center_x', 'Centre X', true), bool('scale_x', 'Scale X', false), bool('center_y', 'Centre y', true), bool('scale_y', 'Scale y', false),
  ]),
  op('model', 'Linear models', RIDGE, 'Ridge regression', 'L2-regularised linear regression; also the meta-model of stacking.', [
    float('alpha', 'Alpha', 1, 0), bool('center_x', 'Centre X', true), bool('center_y', 'Centre y', true), bool('scale_x', 'Scale X', false),
  ]),
  op('model', 'Multiblock models', MBPLS, 'Multiblock PLS',
    'MB-PLS (centred blocks, equal super weights): one latent structure shared by the source blocks, kept as separate blocks.',
    [int('n_components', 'Components', 3, 1, 30)], ['intermediate']),
  op('model', 'Neural networks', NEURAL, 'Multibranch network',
    'One learned branch per source (1-D convolution for spectra, dense for markers, 2-D convolution for images), concatenated embeddings and a joint regression head trained together.', [
      int('filters', 'Filters per branch', 4, 1, 32), int('kernel_size', 'Kernel size', 3, 1, 15, 2), int('pool_size', 'Pool size', 2, 1, 4),
      int('embedding_dim', 'Embedding size', 6, 1, 64), int('head_hidden', 'Head hidden units', 8, 1, 128),
      int('epochs', 'Epochs', 24, 1, 400), int('batch_size', 'Batch size', 16, 1, 256),
      float('learning_rate', 'Learning rate', 0.003, 0), float('weight_decay', 'Weight decay', 0.0001, 0),
    ], ['intermediate']),
]

const OPERATOR = new Map(LAB_OPERATORS.map(definition => [definition.classPath!, definition]))
const HEADS = new Set([PLS, RIDGE, MBPLS, NEURAL])
const BLOCK_HEADS = new Set([MBPLS, NEURAL])
const META_HEADS = new Set([PLS, RIDGE])

export const LAB_CATALOG: PipelineCatalog = {
  operators: LAB_OPERATORS,
  structures: [
    { id: 'merge-sources', label: 'Merge sources (concatenate)', description: 'Joins the source blocks side by side into one matrix.', value: { merge_sources: 'concat' } },
    { id: 'merge-predictions', label: 'Merge predictions (stacking)', description: 'Out-of-fold predictions of each source model become the features of the next model.', value: { merge: 'predictions' } },
    { id: 'merge-mean', label: 'Merge predictions (mean)', description: 'Averages the predictions of the source models; no model follows.', value: { merge: { predictions: 'all', aggregate: 'mean' } } },
  ],
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface FusionPreset {
  id: string
  label: string
  level: FusionLevel
  summary: string
  document: PipelineChainDocument
}

type Json = Record<string, unknown>
const step = (methodId: string, params: Json = {}): Json => ({ class: methodId, params })
const model = (methodId: string, params: Json = {}, name?: string): Json => ({ model: { class: methodId, params }, ...(name ? { name } : {}) })
const defaults = (methodId: string): Json =>
  Object.fromEntries((OPERATOR.get(methodId)?.parameters ?? []).map(parameter => [parameter.name, parameter.default]))

/** Teaching default chain: train-fitted standard scaling for every source. */
const sourceChain = (): Json[] => [step(STANDARD, defaults(STANDARD))]
const lanes = (sources: readonly LabSource[], chain: (source: LabSource) => Json[]) =>
  Object.fromEntries(sources.map(source => [source.id, chain(source)]))

export function fusionPresets(dataset: LabDataset): FusionPreset[] {
  const sources = dataset.sources
  const pls = model(PLS, defaults(PLS), 'PLS')
  const presets: FusionPreset[] = sources.map(source => ({
    id: `single:${source.id}`,
    label: `${source.label} alone`,
    level: 'single',
    summary: `Baseline: ${source.label} only, standard scaling and PLS. Every fusion must beat the best single source.`,
    document: { name: `${source.label} alone · PLS`, pipeline: [{ source_branch: lanes([source], sourceChain) }, pls] },
  }))
  if (sources.length < 2) return presets
  const all = sources.map(source => source.label).join(' + ')
  presets.push(
    {
      id: 'early', label: 'Early · concatenate', level: 'early',
      summary: 'Each source is scaled, the variables are placed side by side in one matrix and a single PLS model learns from it.',
      document: { name: `Early fusion · ${all} → PLS`, pipeline: [{ source_branch: lanes(sources, sourceChain) }, { merge_sources: 'concat' }, pls] },
    },
    {
      id: 'embedding', label: 'Embedding · PCA scores', level: 'embedding',
      summary: 'Each source is summarised by a few PCA scores fitted on the training samples; the scores are concatenated and PLS learns from them.',
      document: {
        name: `Embedding fusion · PCA scores of ${all} → PLS`,
        pipeline: [{ source_branch: lanes(sources, () => [...sourceChain(), step(PCA, defaults(PCA))]) }, { merge_sources: 'concat' }, pls],
      },
    },
    {
      id: 'mbpls', label: 'Intermediate · MB-PLS', level: 'intermediate',
      summary: 'The sources stay separate blocks; multiblock PLS learns one latent structure shared by the blocks.',
      document: { name: `Intermediate fusion · MB-PLS on ${all}`, pipeline: [{ source_branch: lanes(sources, sourceChain) }, model(MBPLS, defaults(MBPLS), 'MB-PLS')] },
    },
    {
      id: 'mid', label: 'Intermediate · network', level: 'intermediate',
      summary: 'One learned branch per source produces an embedding; the embeddings are concatenated and a joint head predicts. Branches and head train together.',
      document: {
        name: `Intermediate fusion · multibranch network on ${all}`,
        pipeline: [{ source_branch: lanes(sources, sourceChain) }, model(NEURAL, defaults(NEURAL), 'Multibranch network')],
      },
    },
    {
      id: 'late-mean', label: 'Late · average', level: 'late',
      summary: 'One PLS model per source; their predictions are averaged with equal weights. Nothing is learned after the source models.',
      document: {
        name: `Late fusion · mean of per-source PLS (${all})`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, () => [...sourceChain(), pls]) } }, { merge: { predictions: 'all', aggregate: 'mean' } }],
      },
    },
    {
      id: 'late-stacking', label: 'Late · stacking', level: 'late',
      summary: 'One PLS model per source; their out-of-fold predictions become the inputs of a Ridge meta-model that learns how much to trust each source.',
      document: {
        name: `Late fusion · stacking of per-source PLS (${all}) → Ridge`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, () => [...sourceChain(), pls]) } }, { merge: 'predictions' },
          model(RIDGE, defaults(RIDGE), 'Meta-model (Ridge)')],
      },
    },
  )
  return presets
}

// ---------------------------------------------------------------------------
// Canonical document -> native execution document
// ---------------------------------------------------------------------------

export class FusionRecipeError extends Error {
  override name = 'FusionRecipeError'
}
function insist(condition: unknown, message: string): asserts condition {
  if (!condition) throw new FusionRecipeError(message)
}
const record = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)
const keysOf = (value: Json) => Object.keys(value)

function operatorStep(value: unknown, where: string): LabPipelineStep {
  // A bare class string is the canonical form of an operator with default parameters.
  const reference = typeof value === 'string' ? { class: value } : record(value) ? value : null
  insist(reference && typeof reference.class === 'string' && keysOf(reference).every(key => key === 'class' || key === 'params'),
    `${where}: use an operator from the laboratory catalogue ({ "class": …, "params": … }).`)
  const methodId = reference.class as string
  insist(OPERATOR.has(methodId), `${where}: ${methodId} is not available in this browser laboratory.`)
  const params = reference.params === undefined ? {} : reference.params
  insist(record(params), `${where}: parameters must be an object.`)
  const merged: Record<string, number | string | boolean> = {}
  for (const [name, raw] of Object.entries({ ...defaults(methodId), ...params })) {
    insist(typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string',
      `${where}: parameter ${name} must be a fixed value; sweeps and tuning are not run by this laboratory.`)
    merged[name] = raw
  }
  return { methodId, params: merged }
}

/** One element of a chain: a transform (`{class}`) or a model step (`{model: {class}}`). */
function chainElement(value: unknown, where: string): { kind: 'transform' | 'model'; step: LabPipelineStep } {
  if (record(value) && 'model' in value) {
    insist(keysOf(value).every(key => key === 'model' || key === 'name'), `${where}: model steps accept only "model" and "name".`)
    const head = operatorStep(value.model, where)
    insist(HEADS.has(head.methodId), `${where}: ${OPERATOR.get(head.methodId)?.name ?? head.methodId} is a transform, not a model.`)
    return { kind: 'model', step: head }
  }
  const transform = operatorStep(value, where)
  insist(!HEADS.has(transform.methodId), `${where}: wrap ${OPERATOR.get(transform.methodId)!.name} in a model step.`)
  return { kind: 'transform', step: transform }
}

function sourceOf(dataset: LabDataset, id: string, where: string): LabSource {
  const source = dataset.sources.find(candidate => candidate.id === id)
  insist(source, `${where}: "${id}" is not a source of this dataset (${dataset.sources.map(s => s.id).join(', ')}).`)
  return source
}

function checkTransforms(source: LabSource, steps: readonly LabPipelineStep[], where: string): void {
  for (const transform of steps) {
    insist(source.modality === 'spectroscopy' || !OPERATOR.get(transform.methodId)?.tags?.includes('spectra'),
      `${where}: ${OPERATOR.get(transform.methodId)!.name} applies to spectra; ${source.label} is ${source.modality === 'image' ? 'an image' : 'a marker table'}.`)
  }
}

function transformsOnly(dataset: LabDataset, sourceId: string, value: unknown, where: string): LabSourceChain {
  const source = sourceOf(dataset, sourceId, where)
  insist(Array.isArray(value), `${where}: a source lane is a list of steps.`)
  const steps = value.map((item, index) => {
    const element = chainElement(item, `${where}, step ${index + 1}`)
    insist(element.kind === 'transform', `${where}: models go after the sources are merged, not inside a source lane of source_branch. Use a by_source branch for one model per source.`)
    return element.step
  })
  checkTransforms(source, steps, where)
  return { sourceId, steps }
}

const label = (dataset: LabDataset, id: string) => dataset.sources.find(source => source.id === id)?.label ?? id

/** Feature-level fusion: `source_branch` → optional `merge_sources` → one model. */
function featureLevel(dataset: LabDataset, steps: unknown[], name: string): LabPipelineDocument {
  const branch = (steps[0] as Json).source_branch as Json
  const options = keysOf(branch).filter(key => key.startsWith('_'))
  insist(options.every(key => key === '_merge_after_'), `Source branch option ${options.find(key => key !== '_merge_after_')} is not supported here.`)
  const sourceIds = keysOf(branch).filter(key => !key.startsWith('_'))
  insist(sourceIds.length > 0, 'Keep at least one source lane in the source branch.')
  const chains = sourceIds.map(id => transformsOnly(dataset, id, branch[id], `Source ${label(dataset, id)}`))
  let rest = steps.slice(1)
  let merged: string | null = null
  if (record(rest[0]) && 'merge_sources' in rest[0]) {
    insist(keysOf(rest[0]).length === 1 && rest[0].merge_sources === 'concat', 'Only { "merge_sources": "concat" } is supported.')
    merged = 'concat'
    rest = rest.slice(1)
  }
  insist(rest.length === 1, rest.length === 0 ? 'Add a model after the sources.' : 'Put exactly one model after the source branch (extra steps after the merge are not supported here).')
  const head = chainElement(rest[0], 'Model')
  insist(head.kind === 'model', 'The last step must be a model.')
  const blockModel = BLOCK_HEADS.has(head.step.methodId)
  insist(!(blockModel && merged), `${OPERATOR.get(head.step.methodId)!.name} fuses the source blocks itself: remove the "Merge sources" step.`)
  insist(!blockModel || sourceIds.length >= 2 || head.step.methodId === NEURAL, 'Multiblock PLS needs at least two sources.')
  insist(branch._merge_after_ !== false || blockModel, 'With _merge_after_ false the sources stay separate: use a multiblock model, or merge the sources.')
  return {
    label: name,
    branches: [{ id: 'result', label: name, sourceIds, sourceChains: chains, head: head.step }],
    merge: { kind: 'none', head: { methodId: RIDGE, params: defaults(RIDGE) as Record<string, number | boolean> }, sourceIds: [], sourceChains: [] },
  }
}

/** Prediction-level fusion: `branch` by source with one or several models per source → `merge`. */
function predictionLevel(dataset: LabDataset, steps: unknown[], name: string): LabPipelineDocument {
  const holder = (steps[0] as Json).branch as Json
  insist(keysOf(holder).every(key => key === 'by_source' || key === 'steps'), 'Only by_source and steps are supported on a source branch here.')
  const lanesMap = holder.steps as Json
  const branches: LabPipelineBranch[] = []
  for (const sourceId of keysOf(lanesMap)) {
    const where = `Source ${label(dataset, sourceId)}`
    const source = sourceOf(dataset, sourceId, where)
    const lane = lanesMap[sourceId]
    insist(Array.isArray(lane) && lane.length > 0, `${where}: add preprocessing and a model to this lane.`)
    const prefix: LabPipelineStep[] = []
    const heads: Array<{ suffix: LabPipelineStep[]; head: LabPipelineStep; tag: string }> = []
    lane.forEach((item, index) => {
      const at = `${where}, step ${index + 1}`
      const last = index === lane.length - 1
      if (record(item) && record(item.branch) && last) {
        // Several models for the same source: a nested branch whose lanes end with a model.
        const inner = item.branch
        const entries: Array<[string, unknown]> = Array.isArray(inner) ? inner.map((value, i) => [String(i + 1), value]) : Object.entries(inner)
        insist(entries.length > 0, `${at}: the nested branch is empty.`)
        for (const [key, value] of entries) {
          insist(Array.isArray(value) && value.length > 0, `${at}, lane ${key}: a lane is a list of steps ending with a model.`)
          const elements = value.map((element, i) => chainElement(element, `${at}, lane ${key}, step ${i + 1}`))
          const head = elements.pop()!
          insist(head.kind === 'model' && elements.every(element => element.kind === 'transform'), `${at}, lane ${key}: end the lane with one model.`)
          heads.push({ suffix: elements.map(element => element.step), head: head.step, tag: key })
        }
        return
      }
      const element = chainElement(item, at)
      if (element.kind === 'model') {
        insist(last, `${at}: the model must be the last step of the source lane.`)
        heads.push({ suffix: [], head: element.step, tag: '' })
      } else prefix.push(element.step)
    })
    insist(heads.length > 0, `${where}: end the lane with a model; late fusion merges per-source predictions.`)
    for (const { suffix, head, tag } of heads) {
      insist(!BLOCK_HEADS.has(head.methodId) || head.methodId === NEURAL, `${where}: Multiblock PLS needs several sources; use it after a source_branch.`)
      const chain = [...prefix, ...suffix]
      checkTransforms(source, chain, where)
      const id = `${sourceId}${tag ? `-${tag}` : ''}`
      branches.push({ id, label: `${source.label}${tag ? ` · ${tag}` : ''} → ${OPERATOR.get(head.methodId)!.name}`,
        sourceIds: [sourceId], sourceChains: [{ sourceId, steps: chain }], head })
    }
  }
  insist(branches.length >= 2, 'Late fusion needs at least two source models; keep two lanes or add a second model.')
  const merge = steps[1]
  insist(record(merge) && 'merge' in merge && keysOf(merge).length === 1, 'Add a merge step after the source models.')
  const spec = merge.merge
  const mean = record(spec) && spec.predictions === 'all' && spec.aggregate === 'mean' && keysOf(spec).every(key => ['predictions', 'aggregate'].includes(key))
  const hybrid = record(spec) && spec.predictions === 'all' && spec.include_original === true && keysOf(spec).every(key => ['predictions', 'include_original'].includes(key))
  insist(mean || hybrid || spec === 'predictions', 'Supported merges: "predictions" (stacking), { predictions: "all", aggregate: "mean" } or { predictions: "all", include_original: true }.')
  const fallback: LabPipelineStep = { methodId: RIDGE, params: defaults(RIDGE) as Record<string, number | boolean> }
  if (mean) {
    insist(steps.length === 2, 'A mean merge is the output: remove the steps after it.')
    return { label: name, branches, merge: { kind: 'mean', head: fallback, sourceIds: [], sourceChains: [] } }
  }
  insist(steps.length === 3, steps.length === 2 ? 'Stacking needs a meta-model after the prediction merge.' : 'Put exactly one meta-model after the merge.')
  const meta = chainElement(steps[2], 'Meta-model')
  insist(meta.kind === 'model' && META_HEADS.has(meta.step.methodId), 'The meta-model must be PLS or Ridge.')
  const original = hybrid ? dataset.sources.map(source => source.id) : []
  return { label: name, branches, merge: { kind: 'model', head: meta.step, sourceIds: original,
    sourceChains: original.map(sourceId => ({ sourceId, steps: [{ methodId: STANDARD, params: defaults(STANDARD) as Record<string, boolean> }] })) } }
}

/** Map a canonical laboratory pipeline onto the native execution document, or refuse it. */
export function toLabDocument(dataset: LabDataset, document: PipelineChainDocument): LabPipelineDocument {
  const steps = [...toCanonicalPipeline(document).pipeline]
  const name = typeof document.name === 'string' && document.name.trim() ? document.name.trim() : 'Edited pipeline'
  insist(steps.length > 0, 'The pipeline is empty: load a preset.')
  insist(!steps.some(item => record(item) && ('split' in item || /model_selection|splitters/.test(String(item.class ?? '')))),
    'Validation is set once for every run in section 4; remove the splitter step.')
  const first = steps[0]
  let lab: LabPipelineDocument
  if (record(first) && record(first.source_branch) && keysOf(first).length === 1) lab = featureLevel(dataset, steps, name)
  else if (record(first) && record(first.branch) && first.branch.by_source === true && keysOf(first).length === 1 && record(first.branch.steps)) lab = predictionLevel(dataset, steps, name)
  else throw new FusionRecipeError('Start the pipeline with the sources: a source branch (early, embedding or intermediate fusion) or a by-source branch (late fusion).')
  return validatePipelineDocument(dataset, lab)
}

/** Fusion level of a canonical document, for grouping results. */
export function fusionLevel(document: LabPipelineDocument): FusionLevel {
  if (document.merge.kind !== 'none') return 'late'
  const branch = document.branches[0]
  if (BLOCK_HEADS.has(branch.head.methodId)) return 'intermediate'
  if (branch.sourceIds.length === 1) return 'single'
  return branch.sourceChains.some(chain => chain.steps.some(item => item.methodId === PCA)) ? 'embedding' : 'early'
}

export function operatorName(methodId: string): string {
  return OPERATOR.get(methodId)?.name ?? methodId
}
