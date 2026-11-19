import type { PipelineCatalog, PipelineChainDocument, PipelineOperatorDefinition, PipelineOperatorParameter } from 'nirs4all-ui/pipelineEditor'
import { toCanonicalPipeline } from 'nirs4all-ui/pipelineEditor'
import type { LabDataset, LabPipelineBranch, LabPipelineDocument, LabPipelineStep, LabSource, LabSourceChain } from './types'
import { NEURAL, PLS_LDA, PLS_LOGISTIC, validatePipelineDocument } from './recipes'
import { BURN_CNN, BURN_CNN_CLASSIFIER, RANDOM_FOREST, RANDOM_FOREST_CLASSIFIER, TFJS_CNN } from './hostModelIds'

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
/** AOM calibration (Methods): operator-adaptive PLS or Ridge over raw/SNV/MSC branches, selected by internal CV. */
export const AOM = 'aom_pop.calibration'
const STANDARD = 'preprocessing.scaling.standard_scale'
const RESAMPLE = 'preprocessing.resampling.resample_transformer'
/** Spectra longer than this are resampled before a CNN branch. */
const CNN_MAX_POINTS = 128

/** Fusion level shown to learners. Presentation only: the document decides execution. */
/**
 * Fusion levels: early (variables), mid (features: extracted per source, or
 * learned by network branches and concatenated inside the network), late
 * (predictions).
 */
export type FusionLevel = 'single' | 'early' | 'mid' | 'late'

export const FUSION_LEVEL_LABEL: Record<FusionLevel, string> = {
  single: 'Single source',
  early: 'Early fusion (variables)',
  mid: 'Mid fusion (features)',
  late: 'Late fusion (predictions)',
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
  op('preprocessing', 'Resampling', RESAMPLE, 'Resample',
    'Resamples each spectrum to a fixed number of points (native). Keeps convolution networks small and stable on long spectra. Spectra only.',
    [int('num_samples', 'Points', 128, 8, 4096)], ['spectra']),
  op('preprocessing', 'Scaling', STANDARD, 'Standard scaling',
    'Per-variable centring and unit-variance scaling, fitted on the training scope only.',
    [bool('with_mean', 'Centre', true), bool('with_std', 'Scale to unit variance', true),
      { ...int('ddof', 'Degrees of freedom removed', 0, 0, 1), isAdvanced: true }]),
  op('preprocessing', 'Scaling', 'preprocessing.scaling.block_rms', 'Block RMS scaling',
    'Divides the whole source block by one training-fitted root-mean-square scale, so blocks of different width contribute comparably once combined.'),
  op('preprocessing', 'Feature extraction', PCA, 'PCA scores',
    'Projects the source onto its first principal components, fitted on the training scope. The scores are compact features of the source (mid-level fusion).',
    [float('n_components', 'Components', 5, 1, 50, 'A whole number of components, or a fraction (0–1) of explained variance.')], ['features']),
  op('model', 'Linear models', PLS, 'PLS regression', 'Partial least squares regression on the incoming features.', [
    int('n_components', 'Components', 3, 1, 30),
    bool('center_x', 'Centre X', true), bool('scale_x', 'Scale X', false), bool('center_y', 'Centre y', true), bool('scale_y', 'Scale y', false),
  ]),
  op('model', 'Linear models', RIDGE, 'Ridge regression', 'L2-regularised linear regression; also the meta-model of stacking.', [
    float('alpha', 'Alpha', 1, 0), bool('center_x', 'Centre X', true), bool('center_y', 'Centre y', true), bool('scale_x', 'Scale X', false),
  ]),
  op('model', 'Multiblock models', MBPLS, 'Multiblock PLS',
    'MB-PLS (centred blocks, equal super weights): one latent structure shared by the source blocks, kept as separate blocks.',
    [int('n_components', 'Components', 3, 1, 30)], ['multiblock']),
  op('model', 'Neural networks', NEURAL, 'Multibranch network',
    'One learned branch per source (1-D convolution for spectra, dense for markers, 2-D convolution for images), concatenated embeddings and a joint regression head trained together.', [
      int('filters', 'Filters per branch', 8, 1, 32), int('kernel_size', 'Kernel size', 3, 1, 15, 2), int('pool_size', 'Pool size', 2, 1, 4),
      int('embedding_dim', 'Embedding size', 16, 1, 64), int('head_hidden', 'Head hidden units', 16, 1, 128),
      int('epochs', 'Epochs', 150, 1, 400), int('batch_size', 'Batch size', 16, 1, 256),
      float('learning_rate', 'Learning rate', 0.01, 0), float('weight_decay', 'Weight decay', 0.0001, 0),
    ], ['mid']),
  op('model', 'AOM (operator-adaptive)', AOM, 'AOM (PLS or Ridge)',
    'Operator-adaptive calibration (Methods): tries preprocessing chains (detrend, Savitzky–Golay smoothing and derivatives, Norris–Williams, finite differences) on raw, SNV and MSC branches and keeps the best by an internal cross-validation inside the training fold. Spectra only; give it the raw spectrum.', [
      { name: 'head', label: 'Model', type: 'select', default: 'pls', options: [{ value: 'pls', label: 'AOM-PLS' }, { value: 'ridge', label: 'AOM-Ridge' }] },
      int('max_components', 'Max components (PLS)', 15, 1, 40), int('cv', 'Internal CV folds', 3, 2, 10),
      bool('fast', 'Fast screening', true),
    ], ['spectra']),
  op('model', 'Browser models (JavaScript)', RANDOM_FOREST, 'Random forest (ml.js)',
    'Random forest regression trained in the browser with ml.js (host model behind the native controller: DAG-ML keeps folds, OOF and refit).', [
      int('n_estimators', 'Trees', 50, 10, 500), float('max_features', 'Features per split (fraction)', 0.33, 0.05, 1),
      int('max_depth', 'Max depth', 10, 2, 40), int('min_samples_leaf', 'Min samples per leaf', 3, 1, 20),
    ], ['browser']),
  op('model', 'Browser models (JavaScript)', TFJS_CNN, 'CNN (TensorFlow.js)',
    'CNN trained in the browser with TensorFlow.js (WebGL when available): 1-D convolution per spectrum or ordered marker table, 2-D convolution per image, embeddings concatenated mid-network, common head.', [
      int('filters', 'Filters per branch', 8, 1, 64), int('kernel_size', 'Kernel size', 5, 1, 15, 2),
      int('pool_size', 'Pooling size (compact)', 2, 1, 32),
      int('embedding_dim', 'Embedding size', 16, 1, 128), int('head_hidden', 'Head hidden units', 16, 1, 256),
      int('epochs', 'Epochs', 60, 1, 500), int('batch_size', 'Batch size', 64, 1, 256),
      float('learning_rate', 'Learning rate', 0.005, 0),
      { name: 'architecture', label: 'Architecture', type: 'select', default: 'compact', options: [
        { value: 'compact', label: 'Compact CNN' }, { value: 'nicon', label: 'NICON (nirs4all, ≥ 175 points per spectrum)' }] },
    ], ['browser', 'mid']),
  op('model', 'Browser models (JavaScript)', BURN_CNN, 'CNN (Burn)',
    'CNN trained in the browser with Burn (Rust compiled to WebAssembly, CPU): NICON (the nirs4all 1-D CNN) or a compact CNN per source, embeddings concatenated mid-network. Browser-only model.', [
      { name: 'architecture', label: 'Architecture', type: 'select', default: 'nicon', options: [
        { value: 'nicon', label: 'NICON (nirs4all, ≥ 175 points per spectrum)' }, { value: 'compact', label: 'Compact CNN' }] },
      int('filters', 'Filters per branch (compact)', 8, 1, 64), int('kernel_size', 'Kernel size (compact)', 5, 1, 15, 2),
      int('embedding_dim', 'Embedding size (compact)', 16, 1, 128), int('head_hidden', 'Head hidden units (compact)', 16, 1, 256),
      int('epochs', 'Epochs', 30, 1, 500), int('batch_size', 'Batch size', 64, 2, 256),
      float('learning_rate', 'Learning rate', 0.002, 0),
    ], ['browser', 'mid']),
  // Classification heads: the dataset declares its class vocabulary (categorical target).
  op('model', 'Classification', PLS_LOGISTIC, 'PLS-DA (logistic)',
    'PLS-DA: PLS components of the incoming features, then a multinomial logistic model; gives class probabilities (needed for late fusion and stacking).', [
      int('n_components', 'Components', 5, 1, 30), { ...int('max_iter', 'Logistic iterations', 500, 10, 5000), isAdvanced: true },
    ], ['classification']),
  op('model', 'Classification', PLS_LDA, 'PLS-LDA',
    'PLS components, then linear discriminant analysis; class labels only (no probabilities), so it cannot feed late fusion or stacking.', [
      int('n_components', 'Components', 5, 1, 30),
    ], ['classification']),
  op('model', 'Classification', RANDOM_FOREST_CLASSIFIER, 'Random forest classifier (ml.js)',
    'Random forest classifier trained in the browser with ml.js; class probabilities are the share of trees voting for each class.', [
      int('n_estimators', 'Trees', 50, 10, 500), float('max_features', 'Features per split (fraction)', 0.33, 0.05, 1),
      int('max_depth', 'Max depth', 10, 2, 40), int('min_samples_leaf', 'Min samples per leaf', 3, 1, 20),
    ], ['browser', 'classification']),
  op('model', 'Classification', BURN_CNN_CLASSIFIER, 'CNN classifier (Burn)',
    'CNN classifier trained in the browser with Burn (softmax output, cross-entropy): NICON or a compact CNN per source, embeddings concatenated mid-network.', [
      { name: 'architecture', label: 'Architecture', type: 'select', default: 'compact', options: [
        { value: 'compact', label: 'Compact CNN' }, { value: 'nicon', label: 'NICON (nirs4all, ≥ 175 points per spectrum)' }] },
      int('filters', 'Filters per branch (compact)', 8, 1, 64), int('kernel_size', 'Kernel size (compact)', 5, 1, 15, 2),
      int('embedding_dim', 'Embedding size (compact)', 16, 1, 128), int('head_hidden', 'Head hidden units (compact)', 16, 1, 256),
      int('epochs', 'Epochs', 30, 1, 500), int('batch_size', 'Batch size', 64, 2, 256),
      float('learning_rate', 'Learning rate', 0.005, 0),
    ], ['browser', 'mid', 'classification']),
]

const OPERATOR = new Map(LAB_OPERATORS.map(definition => [definition.classPath!, definition]))
const HEADS = new Set([PLS, RIDGE, MBPLS, NEURAL, RANDOM_FOREST, TFJS_CNN, BURN_CNN, AOM, PLS_LOGISTIC, PLS_LDA, RANDOM_FOREST_CLASSIFIER, BURN_CNN_CLASSIFIER])
const BLOCK_HEADS = new Set([MBPLS, NEURAL, TFJS_CNN, BURN_CNN, BURN_CNN_CLASSIFIER])
const META_HEADS = new Set([PLS, RIDGE, PLS_LOGISTIC])

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
/** CNN lanes: long spectra are resampled first, so the convolution branch stays small and stable. */
const cnnChain = (source: LabSource): Json[] => source.modality === 'spectroscopy' && source.shape[0] > CNN_MAX_POINTS
  ? [step(RESAMPLE, { num_samples: CNN_MAX_POINTS }), ...sourceChain()] : sourceChain()
/** NICON keeps more of the spectrum (it needs at least 175 points) but stays browser-sized. */
const NICON_POINTS = 256
/** Compact Burn CNN for marker tables and mixed sources: fastest browser CNN on CPU. */
const COMPACT_CNN = { architecture: 'compact', filters: 4, epochs: 30, learning_rate: 0.005 }
/** AOM screens many chains per component: long spectra are resampled first in the browser. */
const AOM_POINTS = 256
const niconChain = (source: LabSource): Json[] => source.modality === 'spectroscopy'
  ? [...(source.shape[0] > NICON_POINTS ? [step(RESAMPLE, { num_samples: NICON_POINTS })] : []), step('preprocessing.scatter.snv'),
    step('preprocessing.derivatives.savitzky_golay', { window_length: 15, polyorder: 2, deriv: 1 }), ...sourceChain()]
  : sourceChain()
const lanes = (sources: readonly LabSource[], chain: (source: LabSource) => Json[]) =>
  Object.fromEntries(sources.map(source => [source.id, chain(source)]))

export function fusionPresets(dataset: LabDataset): FusionPreset[] {
  if (dataset.target.kind === 'categorical') return classificationPresets(dataset)
  const sources = dataset.sources
  const pls = model(PLS, defaults(PLS), 'PLS')
  const width = (source: LabSource) => source.shape.reduce((n, size) => n * size, 1)
  // Single-head PLS presets sweep the number of components (5, 10, 15, bounded by the
  // variables): every value is a full cross-validated run, compared in the Inspector.
  const components = (variables: number) => variables >= 10 ? { _range_: [5, Math.min(15, variables), 5] } : defaults(PLS).n_components
  const plsSweep = (variables: number) => model(PLS, { ...defaults(PLS), n_components: components(variables) }, 'PLS')
  // Late presets keep one fixed PLS per source (a sweep per branch would multiply the variants):
  // 10 components, the middle of the single-source sweep, so the sources alone compare like with like.
  const plsLate = (source: LabSource) => model(PLS, { ...defaults(PLS), ...(width(source) >= 10 ? { n_components: 10 } : {}) }, 'PLS')
  const presets: FusionPreset[] = sources.map(source => ({
    id: `single:${source.id}`,
    label: `${source.label} alone`,
    level: 'single',
    summary: `Baseline: ${source.label} only, standard scaling and PLS (number of components swept). Every fusion must beat the best single source.`,
    document: { name: `${source.label} alone · PLS`, pipeline: [{ source_branch: lanes([source], sourceChain) }, plsSweep(width(source))] },
  }))
  // Ordered marker tables: a compact 1-D CNN (Burn, WebAssembly) on the markers alone.
  for (const source of sources.filter(item => item.modality === 'genetics')) presets.push({
    id: `cnn-burn:${source.id}`, label: `${source.label} · CNN (Burn)`, level: 'single',
    summary: `${source.label} only, read by a 1-D convolution along the marker order, trained in the browser with Burn (Rust compiled to WebAssembly).`,
    document: { name: `${source.label} alone · Burn CNN`, pipeline: [{ source_branch: lanes([source], sourceChain) }, model(BURN_CNN, { ...defaults(BURN_CNN), ...COMPACT_CNN }, 'CNN (Burn)')] },
  })
  if (sources.length < 2) return presets
  const all = sources.map(source => source.label).join(' + ')
  presets.push(
    {
      id: 'early', label: 'Early · concatenate', level: 'early',
      summary: 'Each source is scaled, the variables are placed side by side in one matrix and a single PLS model learns from it (number of components swept).',
      document: { name: `Early fusion · ${all} → PLS`, pipeline: [{ source_branch: lanes(sources, sourceChain) }, { merge_sources: 'concat' }, plsSweep(sources.reduce((n, source) => n + width(source), 0))] },
    },
    {
      id: 'mid-pca', label: 'Mid · PCA scores', level: 'mid',
      summary: 'Each source is summarised by a few PCA scores fitted on the training samples; the scores are concatenated and PLS learns from them.',
      document: {
        name: `Mid fusion · PCA scores of ${all} → PLS`,
        pipeline: [{ source_branch: lanes(sources, () => [...sourceChain(), step(PCA, defaults(PCA))]) }, { merge_sources: 'concat' }, pls],
      },
    },
    {
      id: 'mbpls', label: 'Early · MB-PLS', level: 'early',
      summary: 'Low-level fusion with block structure: centred blocks, one score per block, a shared super-score. Close to PLS on the block-weighted concatenation.',
      document: { name: `Early fusion · MB-PLS on ${all}`, pipeline: [{ source_branch: lanes(sources, sourceChain) }, model(MBPLS, { ...defaults(MBPLS), n_components: components(Math.min(...sources.map(width))) }, 'MB-PLS')] },
    },
    {
      id: 'cnn', label: 'Mid · CNN', level: 'mid',
      summary: 'A small CNN: one learned branch per source (1-D convolution for spectra, dense for markers, 2-D convolution for images); the branch embeddings are concatenated in the middle of the network and a common head predicts. Everything trains together.',
      document: {
        name: `Mid fusion · CNN on ${all}`,
        pipeline: [{ source_branch: lanes(sources, cnnChain) }, model(NEURAL, defaults(NEURAL), 'Multibranch network')],
      },
    },
    {
      id: 'early-rf', label: 'Early · random forest', level: 'early',
      summary: 'The scaled sources (long spectra resampled to 128 points) are concatenated and a random forest (ml.js, trained in the browser) learns from them.',
      document: { name: `Early fusion · ${all} → random forest`, pipeline: [{ source_branch: lanes(sources, cnnChain) }, { merge_sources: 'concat' },
        model(RANDOM_FOREST, defaults(RANDOM_FOREST), 'Random forest')] },
    },
    // Compact Burn CNN where marker tables are present: a 1-D branch also reads the marker order.
    ...(sources.some(source => source.modality === 'genetics') ? [{
      id: 'cnn-burn', label: 'Mid · CNN (Burn)', level: 'mid' as const,
      summary: 'The same mid-fusion CNN idea, trained with Burn (Rust compiled to WebAssembly): one convolution branch per source, embeddings concatenated mid-network.',
      document: { name: `Mid fusion · Burn CNN on ${all}`, pipeline: [{ source_branch: lanes(sources, cnnChain) }, model(BURN_CNN, { ...defaults(BURN_CNN), ...COMPACT_CNN }, 'CNN (Burn)')] },
    }] : []),
    ...(sources.every(source => source.modality === 'image' || source.shape[0] >= 175) && sources.some(source => source.modality === 'spectroscopy') ? [{
      id: 'nicon', label: 'Mid · NICON (Burn)', level: 'mid' as const,
      summary: 'nirs4all’s NICON CNN, trained in the browser with Burn (Rust/WebAssembly): each spectrum is resampled to 256 points, SNV-corrected and differentiated (Savitzky–Golay), then read by its own NICON branch; the branches are concatenated mid-network.',
      document: { name: `Mid fusion · NICON on ${all}`, pipeline: [
        { source_branch: lanes(sources, niconChain) },
        model(BURN_CNN, { ...defaults(BURN_CNN), epochs: 20 }, 'NICON (Burn)'),
      ] },
    }] : []),
    ...(sources.some(source => source.modality === 'spectroscopy') ? [{
      id: 'late-aom', label: 'Late · AOM stacking', level: 'late' as const,
      summary: 'One AOM-PLS per spectrum (it selects its own preprocessing among raw, SNV and MSC branches and derivative chains, inside the training fold), PLS for the other sources; a Ridge meta-model learns from their out-of-fold predictions.',
      document: {
        name: `Late fusion · AOM-PLS per spectrum (${all}) → Ridge`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, source => source.modality === 'spectroscopy'
          ? [...(source.shape[0] > AOM_POINTS ? [step(RESAMPLE, { num_samples: AOM_POINTS })] : []), model(AOM, defaults(AOM), 'AOM-PLS')]
          : [...sourceChain(), plsLate(source)]) } },
        { merge: 'predictions' }, model(RIDGE, defaults(RIDGE), 'Meta-model (Ridge)')],
      },
    }] : []),
    {
      id: 'late-mean', label: 'Late · average', level: 'late',
      summary: 'One PLS model per source; their predictions are averaged with equal weights. Nothing is learned after the source models.',
      document: {
        name: `Late fusion · mean of per-source PLS (${all})`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, source => [...sourceChain(), plsLate(source)]) } }, { merge: { predictions: 'all', aggregate: 'mean' } }],
      },
    },
    {
      id: 'late-stacking', label: 'Late · stacking', level: 'late',
      summary: 'One PLS model per source; their out-of-fold predictions become the inputs of a Ridge meta-model that learns how much to trust each source.',
      document: {
        name: `Late fusion · stacking of per-source PLS (${all}) → Ridge`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, source => [...sourceChain(), plsLate(source)]) } }, { merge: 'predictions' },
          model(RIDGE, defaults(RIDGE), 'Meta-model (Ridge)')],
      },
    },
  )
  return presets
}

/**
 * Presets of a class target (declared vocabulary): PLS-DA, random forest and CNN classifiers;
 * late fusion averages or stacks out-of-fold class probabilities, never class ids.
 */
function classificationPresets(dataset: LabDataset): FusionPreset[] {
  const sources = dataset.sources
  const width = (source: LabSource) => source.shape.reduce((n, size) => n * size, 1)
  // PLS-DA sweeps its components (5, 10, 15, bounded by the variables), as the regression presets do.
  const components = (variables: number) => variables >= 10 ? { _range_: [5, Math.min(15, variables), 5] } : Math.max(1, Math.min(5, variables))
  const plsda = (variables: number, name = 'PLS-DA') => model(PLS_LOGISTIC, { ...defaults(PLS_LOGISTIC), n_components: components(variables) }, name)
  const plsdaFixed = (variables: number, name = 'PLS-DA') => model(PLS_LOGISTIC, { ...defaults(PLS_LOGISTIC), n_components: Math.max(1, Math.min(5, variables)) }, name)
  const presets: FusionPreset[] = sources.map(source => ({
    id: `single:${source.id}`, label: `${source.label} alone`, level: 'single',
    summary: `Baseline: ${source.label} only, standard scaling and PLS-DA (number of components swept). Every fusion must beat the best single source.`,
    document: { name: `${source.label} alone · PLS-DA`, pipeline: [{ source_branch: lanes([source], sourceChain) }, plsda(width(source))] },
  }))
  if (sources.length < 2) return presets
  const all = sources.map(source => source.label).join(' + ')
  presets.push(
    {
      id: 'early', label: 'Early · concatenate', level: 'early',
      summary: 'Each source is scaled, the variables are placed side by side and one PLS-DA classifies the samples (number of components swept).',
      document: { name: `Early fusion · ${all} → PLS-DA`, pipeline: [{ source_branch: lanes(sources, sourceChain) }, { merge_sources: 'concat' },
        plsda(sources.reduce((n, source) => n + width(source), 0))] },
    },
    {
      id: 'early-rf', label: 'Early · random forest', level: 'early',
      summary: 'The concatenated (and, for long spectra, resampled) variables feed a random forest classifier trained in the browser.',
      document: { name: `Early fusion · ${all} → random forest`, pipeline: [{ source_branch: lanes(sources, cnnChain) }, { merge_sources: 'concat' },
        // About sqrt(p) candidate variables per split, the usual classification forest setting (and fast on images).
        model(RANDOM_FOREST_CLASSIFIER, { ...defaults(RANDOM_FOREST_CLASSIFIER), max_features: 0.05 }, 'Random forest')] },
    },
    {
      id: 'mid-pca', label: 'Mid · PCA scores', level: 'mid',
      summary: 'Each source is summarised by a few PCA scores fitted on the training samples; PLS-DA classifies the concatenated scores.',
      document: { name: `Mid fusion · PCA scores of ${all} → PLS-DA`,
        pipeline: [{ source_branch: lanes(sources, () => [...sourceChain(), step(PCA, defaults(PCA))]) }, { merge_sources: 'concat' }, plsdaFixed(5 * sources.length)] },
    },
    {
      id: 'cnn-burn', label: 'Mid · CNN (Burn)', level: 'mid',
      summary: 'A compact CNN classifier trained with Burn: one convolution branch per source (2-D for images), embeddings concatenated mid-network, softmax output.',
      document: { name: `Mid fusion · Burn CNN classifier on ${all}`, pipeline: [{ source_branch: lanes(sources, cnnChain) },
        model(BURN_CNN_CLASSIFIER, { ...defaults(BURN_CNN_CLASSIFIER), ...COMPACT_CNN }, 'CNN (Burn)')] },
    },
    ...(sources.every(source => source.modality === 'image' || source.shape[0] >= 175) && sources.some(source => source.modality === 'spectroscopy') ? [{
      id: 'nicon', label: 'Mid · NICON (Burn)', level: 'mid' as const,
      summary: 'NICON, the nirs4all 1-D CNN, per spectrum (a compact 2-D branch per image), with a softmax classification head, trained with Burn.',
      document: { name: `Mid fusion · NICON classifier on ${all}`, pipeline: [{ source_branch: lanes(sources, niconChain) },
        model(BURN_CNN_CLASSIFIER, { ...defaults(BURN_CNN_CLASSIFIER), architecture: 'nicon', epochs: 20, learning_rate: 0.002 }, 'NICON (Burn)')] },
    }] : []),
    {
      id: 'late-mean', label: 'Late · average', level: 'late',
      summary: 'One PLS-DA per source; their class probabilities are averaged and the most probable class is kept. Nothing is learned after the source models.',
      document: { name: `Late fusion · mean of per-source PLS-DA probabilities (${all})`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, source => [...sourceChain(), plsdaFixed(width(source))]) } },
          { merge: { predictions: 'all', aggregate: 'mean' } }] },
    },
    {
      id: 'late-stacking', label: 'Late · stacking', level: 'late',
      summary: 'One PLS-DA per source; their out-of-fold class probabilities become the inputs of a PLS-DA meta-model that learns which source to trust for which class.',
      document: { name: `Late fusion · stacking of per-source PLS-DA (${all}) → PLS-DA`,
        pipeline: [{ branch: { by_source: true, steps: lanes(sources, source => [...sourceChain(), plsdaFixed(width(source))]) } }, { merge: 'predictions' },
          model(PLS_LOGISTIC, { ...defaults(PLS_LOGISTIC), n_components: 5 }, 'Meta-model (PLS-DA)')] },
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

function checkHead(sources: readonly LabSource[], head: LabPipelineStep, where: string): void {
  insist(head.methodId !== AOM || sources.every(source => source.modality === 'spectroscopy'),
    `${where}: AOM works on spectra; use PLS or Ridge for marker tables and images.`)
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
  checkHead(sourceIds.map(id => sourceOf(dataset, id, 'Model')), head.step, 'Model')
  insist(head.step.methodId !== AOM || sourceIds.length === 1, 'AOM works on one spectrum at a time: use it per source in a late-fusion branch.')
  const blockModel = BLOCK_HEADS.has(head.step.methodId)
  insist(!(blockModel && merged), `${OPERATOR.get(head.step.methodId)!.name} fuses the source blocks itself: remove the "Merge sources" step.`)
  insist(!blockModel || sourceIds.length >= 2 || head.step.methodId !== MBPLS, 'Multiblock PLS needs at least two sources.')
  insist(branch._merge_after_ === undefined || typeof branch._merge_after_ === 'boolean', '_merge_after_ must be true or false.')
  insist(branch._merge_after_ !== false || blockModel || merged !== null, 'With _merge_after_ false the sources stay separate: use a multiblock model, or merge the sources.')
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
      checkHead([source], head, where)
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
  insist(meta.kind === 'model' && META_HEADS.has(meta.step.methodId), 'The meta-model must be PLS, Ridge or PLS-DA (logistic).')
  // Hybrid stacking also gives the meta-model the (scaled) variables of the sources used by the branches.
  const original = hybrid ? [...new Set(branches.flatMap(branch => branch.sourceIds))] : []
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
  else throw new FusionRecipeError('Start the pipeline with the sources: a source branch (early or mid fusion) or a by-source branch (late fusion).')
  return validatePipelineDocument(dataset, lab)
}

/** Fusion level of a canonical document, for grouping results. */
export function fusionLevel(document: LabPipelineDocument): FusionLevel {
  if (document.merge.kind !== 'none') return 'late'
  const branch = document.branches[0]
  if (branch.sourceIds.length === 1) return 'single'
  if ([NEURAL, TFJS_CNN, BURN_CNN, BURN_CNN_CLASSIFIER].includes(branch.head.methodId)) return 'mid'
  if (branch.head.methodId === MBPLS) return 'early'
  if (branch.sourceIds.length === 1) return 'single'
  return branch.sourceChains.some(chain => chain.steps.some(item => item.methodId === PCA)) ? 'mid' : 'early'
}

export function operatorName(methodId: string): string {
  return OPERATOR.get(methodId)?.name ?? methodId
}
