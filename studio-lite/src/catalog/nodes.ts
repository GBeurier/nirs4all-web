import type { NodeDef } from './types'

// Curated v1 catalog — only nirs4all-methods operators that are actually exported
// in the libn4m ABI (verified against catalog/abi_method_map.yaml +
// cpp/abi/expected_symbols_linux.txt). NOTE: OPLS is intentionally absent — its
// enum exists but no ABI symbol is exported, so it must not be advertised.
//
// `scripts/validate-catalog.mjs` fails CI if any n4m.* symbol here is missing
// upstream. To add a method: append a NodeDef and (if it needs new numerics)
// a dispatch case in the engine.

export const PREPROCESSING_NODES: NodeDef[] = [
  {
    id: 'preprocessing.scatter.snv',
    type: 'StandardNormalVariate',
    name: 'SNV',
    category: 'preprocessing',
    subcategory: 'scatter',
    description: 'Standard Normal Variate — per-spectrum centering and scaling; removes multiplicative scatter and baseline shift.',
    icon: 'Waves',
    params: [],
    n4m: { fit: null, transform: 'n4m_pp_snv_transform' },
  },
  {
    id: 'preprocessing.scatter.msc',
    type: 'MSC',
    name: 'MSC',
    category: 'preprocessing',
    subcategory: 'scatter',
    description: 'Multiplicative Scatter Correction — regresses each spectrum onto a reference (mean of the training set) to remove scatter.',
    icon: 'Layers',
    params: [],
    n4m: { fit: 'n4m_pp_msc_fit', transform: 'n4m_pp_msc_transform' },
    stateful: true,
  },
  {
    id: 'preprocessing.derivatives.savitzky_golay',
    type: 'SavitzkyGolay',
    name: 'Savitzky–Golay',
    category: 'preprocessing',
    subcategory: 'derivative',
    description: 'Polynomial smoothing filter with optional derivative — sharpens features while suppressing noise.',
    icon: 'Activity',
    params: [
      { name: 'window', label: 'Window', type: 'int', default: 11, min: 3, max: 51, step: 2, help: 'Window length (odd).' },
      { name: 'polyorder', label: 'Poly order', type: 'int', default: 2, min: 1, max: 5, help: 'Polynomial order (< window).' },
      { name: 'deriv', label: 'Derivative', type: 'select', default: 0, options: [
        { value: 0, label: 'Smooth (0)' }, { value: 1, label: '1st deriv' }, { value: 2, label: '2nd deriv' },
      ] },
    ],
    n4m: { fit: null, transform: 'n4m_pp_savgol_transform' },
  },
  {
    id: 'preprocessing.derivatives.first_derivative',
    type: 'Derivative',
    name: 'Derivative',
    category: 'preprocessing',
    subcategory: 'derivative',
    description: 'Shape-preserving central-difference derivative (np.gradient) — emphasizes spectral slopes and removes additive baseline.',
    icon: 'TrendingUp',
    params: [
      { name: 'order', label: 'Order', type: 'select', default: 1, options: [
        { value: 1, label: '1st' }, { value: 2, label: '2nd' },
      ] },
    ],
    n4m: { fit: null, transform: 'n4m_pp_first_derivative_transform' },
  },
  {
    id: 'preprocessing.baselines.detrend',
    type: 'Detrend',
    name: 'Detrend',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Removes a fitted polynomial baseline trend from each spectrum.',
    icon: 'Minus',
    params: [
      { name: 'degree', label: 'Degree', type: 'int', default: 1, min: 0, max: 4, help: 'Polynomial degree of the trend.' },
    ],
    n4m: { fit: null, transform: 'n4m_pp_detrend_transform' },
  },
  {
    id: 'preprocessing.scaling.normalize',
    type: 'Normalize',
    name: 'Normalize',
    category: 'preprocessing',
    subcategory: 'scaling',
    description: 'Per-spectrum vector normalization to unit L2 norm.',
    icon: 'Ruler',
    params: [],
    n4m: { fit: null, transform: 'n4m_pp_normalize_transform' },
  },
  {
    id: 'preprocessing.filtering.gaussian',
    type: 'GaussianFilter',
    name: 'Gaussian smooth',
    category: 'preprocessing',
    subcategory: 'filtering',
    description: 'Gaussian convolution smoothing.',
    icon: 'Wind',
    advanced: true,
    params: [
      { name: 'sigma', label: 'Sigma', type: 'float', default: 2, min: 0.5, max: 10, step: 0.5 },
    ],
    n4m: { fit: null, transform: 'n4m_pp_gaussian_transform' },
  },
]

export const MODEL_NODES: NodeDef[] = [
  {
    id: 'models.pls.pls_regression',
    type: 'PLS',
    name: 'PLS Regression',
    category: 'model',
    description: 'Partial Least Squares regression — the NIRS workhorse. Projects spectra onto latent components most correlated with the target.',
    icon: 'GitBranch',
    task: 'regression',
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_pls_fit_simple', predict: 'n4m_wasm_pls_predict_from_coeffs' },
  },
  {
    id: 'models.classification.pls_lda',
    type: 'PLSDA',
    name: 'PLS-DA',
    category: 'model',
    description: 'PLS Discriminant Analysis — PLS on one-hot class targets for classification; predicts the argmax class.',
    icon: 'Boxes',
    task: 'binary',
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_pls_lda_fit', predict: 'n4m_wasm_pls_predict_from_coeffs' },
  },
]

export const ALL_NODES: NodeDef[] = [...PREPROCESSING_NODES, ...MODEL_NODES]

const BY_TYPE = new Map(ALL_NODES.map((n) => [n.type, n]))
export function nodeByType(type: string): NodeDef | undefined {
  return BY_TYPE.get(type)
}
export function modelsForTask(task: 'regression' | 'binary' | 'multiclass'): NodeDef[] {
  return MODEL_NODES.filter((m) => m.task === 'any' || m.task === task || (task === 'multiclass' && m.task === 'binary'))
}
/** default params object for a node type */
export function defaultParams(type: string): Record<string, unknown> {
  const def = BY_TYPE.get(type)
  if (!def) return {}
  return Object.fromEntries(def.params.map((p) => [p.name, p.default]))
}
