import type { NodeDef } from './types'
import { AOM_DEFAULT_BANK } from './types'

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
    n4m: { fit: null, transform: 'n4m_transform_snv_transform' },
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
    n4m: { fit: 'n4m_transform_msc_fit', transform: 'n4m_transform_msc_transform' },
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
    n4m: { fit: null, transform: 'n4m_transform_savitzky_golay_transform' },
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
    n4m: { fit: null, transform: 'n4m_transform_first_derivative_transform' },
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
    n4m: { fit: null, transform: 'n4m_transform_detrend_transform' },
  },
  // NOTE: a per-spectrum (row-wise) L2 Normalize node is intentionally not
  // shipped — libn4m's n4m_pp_normalize is column-wise/batch-dependent, which is
  // wrong for spectra + unsafe for predict. Re-add when a row-wise op lands.
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
    n4m: { fit: null, transform: 'n4m_transform_gaussian_transform' },
  },

  // ---- A2a: baseline correctors (stateless, shape-preserving) -------------
  {
    id: 'preprocessing.baseline.asls',
    type: 'AsLS',
    name: 'AsLS',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Asymmetric Least Squares baseline correction (Eilers & Boelens).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'lam', label: 'λ (smoothness)', type: 'float', default: 1e6, min: 1, max: 1e9, step: 10 },
      { name: 'p', label: 'asymmetry', type: 'float', default: 1e-2, min: 1e-4, max: 0.5, step: 1e-3 },
      { name: 'max_iter', label: 'max iter', type: 'int', default: 50, min: 1, max: 500 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_asls_transform' },
  },
  {
    id: 'preprocessing.baseline.airpls',
    type: 'AirPLS',
    name: 'AirPLS',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Adaptive iteratively reweighted penalized least squares baseline (Zhang).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'lam', label: 'λ (smoothness)', type: 'float', default: 1e6, min: 1, max: 1e9, step: 10 },
      { name: 'max_iter', label: 'max iter', type: 'int', default: 50, min: 1, max: 500 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_airpls_transform' },
  },
  {
    id: 'preprocessing.baseline.arpls',
    type: 'ArPLS',
    name: 'ArPLS',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Asymmetrically reweighted penalized least squares baseline (Baek).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'lam', label: 'λ (smoothness)', type: 'float', default: 1e5, min: 1, max: 1e9, step: 10 },
      { name: 'max_iter', label: 'max iter', type: 'int', default: 50, min: 1, max: 500 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_arpls_transform' },
  },
  {
    id: 'preprocessing.baseline.modpoly',
    type: 'ModPoly',
    name: 'ModPoly',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Iterative polynomial baseline with peak-clipping (Lieber & Mahadevan-Jansen).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'polyorder', label: 'Poly order', type: 'int', default: 2, min: 0, max: 8 },
      { name: 'max_iter', label: 'max iter', type: 'int', default: 250, min: 1, max: 1000 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_modpoly_transform' },
  },
  {
    id: 'preprocessing.baseline.imodpoly',
    type: 'IModPoly',
    name: 'IModPoly',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Improved ModPoly with σ-based stopping (Gan).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'polyorder', label: 'Poly order', type: 'int', default: 2, min: 0, max: 8 },
      { name: 'max_iter', label: 'max iter', type: 'int', default: 250, min: 1, max: 1000 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_imodpoly_transform' },
  },
  {
    id: 'preprocessing.baseline.snip',
    type: 'SNIP',
    name: 'SNIP',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Statistics-sensitive non-linear iterative peak-clipping baseline.',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'max_half_window', label: 'max half-window', type: 'int', default: 20, min: 1, max: 200 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_snip_transform' },
  },
  {
    id: 'preprocessing.baseline.rolling_ball',
    type: 'RollingBall',
    name: 'Rolling ball',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Morphological rolling-ball baseline (Kneen & Annegarn).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'half_window', label: 'half-window', type: 'int', default: 20, min: 1, max: 200 },
      { name: 'smooth_half_window', label: 'smooth half-window', type: 'int', default: 0, min: 0, max: 100 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_rolling_ball_transform' },
  },
  {
    id: 'preprocessing.baseline.iasls',
    type: 'IAsLS',
    name: 'IAsLS',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Improved AsLS — polynomial prefit then AsLS reweighting (He).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'lam', label: 'λ (smoothness)', type: 'float', default: 1e6, min: 1, max: 1e9, step: 10 },
      { name: 'p', label: 'asymmetry', type: 'float', default: 1e-2, min: 1e-4, max: 0.5, step: 1e-3 },
      { name: 'polyorder', label: 'Poly order', type: 'int', default: 2, min: 0, max: 8 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_iasls_transform' },
  },
  {
    id: 'preprocessing.baseline.beads',
    type: 'BEADS',
    name: 'BEADS',
    category: 'preprocessing',
    subcategory: 'baseline',
    description: 'Baseline Estimation And Denoising with Sparsity (Ning & Selesnick).',
    icon: 'Activity',
    advanced: true,
    params: [
      { name: 'lam_0', label: 'λ₀ (sparsity)', type: 'float', default: 1e2, min: 1e-2, max: 1e6, step: 1 },
      { name: 'lam_1', label: 'λ₁ (1st diff)', type: 'float', default: 0.5, min: 1e-3, max: 100, step: 0.1 },
      { name: 'lam_2', label: 'λ₂ (2nd diff)', type: 'float', default: 0.5, min: 1e-3, max: 100, step: 0.1 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_beads_transform' },
  },

  // ---- A2b: signal conversions (stateless) -------------------------------
  {
    id: 'preprocessing.signal.to_absorbance',
    type: 'ToAbsorbance',
    name: 'To absorbance',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Reflectance/transmittance → absorbance: A = -log10(max(R, ε)).',
    icon: 'Sigma',
    advanced: true,
    params: [
      { name: 'is_percent', label: 'input is %', type: 'bool', default: false },
    ],
    n4m: { fit: null, transform: 'n4m_transform_to_absorbance_transform' },
  },
  {
    id: 'preprocessing.signal.from_absorbance',
    type: 'FromAbsorbance',
    name: 'From absorbance',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Absorbance → reflectance: R = 10^(-A).',
    icon: 'Sigma',
    advanced: true,
    params: [
      { name: 'is_percent', label: 'output is %', type: 'bool', default: false },
    ],
    n4m: { fit: null, transform: 'n4m_transform_from_absorbance_transform' },
  },
  {
    id: 'preprocessing.signal.percent_to_fraction',
    type: 'PercentToFraction',
    name: '% → fraction',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Rescale percent values to the [0, 1] fraction range (x / 100).',
    icon: 'Sigma',
    advanced: true,
    params: [],
    n4m: { fit: null, transform: 'n4m_transform_percent_to_fraction_transform' },
  },
  {
    id: 'preprocessing.signal.fraction_to_percent',
    type: 'FractionToPercent',
    name: 'fraction → %',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Rescale [0, 1] fraction values to percent (x · 100).',
    icon: 'Sigma',
    advanced: true,
    params: [],
    n4m: { fit: null, transform: 'n4m_transform_fraction_to_percent_transform' },
  },
  {
    id: 'preprocessing.signal.kubelka_munk',
    type: 'KubelkaMunk',
    name: 'Kubelka–Munk',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Kubelka–Munk transform: KM = (1 - R)² / (2R).',
    icon: 'Sigma',
    advanced: true,
    params: [
      { name: 'is_percent', label: 'input is %', type: 'bool', default: false },
    ],
    n4m: { fit: null, transform: 'n4m_transform_kubelka_munk_transform' },
  },

  // ---- A2c: scatter / scaling / derivative (stateless) -------------------
  {
    id: 'preprocessing.scatter.rnv',
    type: 'RobustNormalVariate',
    name: 'Robust NV',
    category: 'preprocessing',
    subcategory: 'scatter',
    description: 'Robust Normal Variate — per-spectrum median + k·MAD scaling (outlier-robust SNV).',
    icon: 'Waves',
    advanced: true,
    params: [
      { name: 'k', label: 'MAD factor', type: 'float', default: 1.4826, min: 0.5, max: 3, step: 0.01 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_robust_snv_transform' },
  },
  {
    id: 'preprocessing.scatter.lsnv',
    type: 'LocalSNV',
    name: 'Local SNV',
    category: 'preprocessing',
    subcategory: 'scatter',
    description: 'Sliding-window SNV — local per-spectrum centring and scaling.',
    icon: 'Waves',
    advanced: true,
    params: [
      { name: 'window', label: 'window (odd)', type: 'int', default: 11, min: 3, max: 101, step: 2 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_local_snv_transform' },
  },
  {
    id: 'preprocessing.scaling.area',
    type: 'AreaNormalization',
    name: 'Area norm',
    category: 'preprocessing',
    subcategory: 'scaling',
    description: 'Per-spectrum area normalization (row-wise; predict-safe).',
    icon: 'Ruler',
    advanced: true,
    params: [
      { name: 'method', label: 'method', type: 'select', default: 1, options: [
        { value: 0, label: 'sum' }, { value: 1, label: '|sum|' }, { value: 2, label: 'trapz' },
      ] },
    ],
    n4m: { fit: null, transform: 'n4m_transform_area_normalization_transform' },
  },
  {
    id: 'preprocessing.derivatives.norris_williams',
    type: 'NorrisWilliams',
    name: 'Norris–Williams',
    category: 'preprocessing',
    subcategory: 'derivative',
    description: 'Norris–Williams gap-segment derivative with smoothing.',
    icon: 'TrendingUp',
    advanced: true,
    params: [
      { name: 'segment', label: 'segment (odd)', type: 'int', default: 5, min: 1, max: 51, step: 2 },
      { name: 'gap', label: 'gap', type: 'int', default: 3, min: 1, max: 51 },
      { name: 'derivative_order', label: 'order', type: 'select', default: 1, options: [
        { value: 1, label: '1st' }, { value: 2, label: '2nd' },
      ] },
    ],
    n4m: { fit: null, transform: 'n4m_transform_norris_williams_transform' },
  },
  {
    id: 'preprocessing.signal.log',
    type: 'LogTransform',
    name: 'Log transform',
    category: 'preprocessing',
    subcategory: 'signal',
    description: 'Natural-log transform with a small clamp on non-positive values.',
    icon: 'Sigma',
    advanced: true,
    params: [],
    n4m: { fit: null, transform: 'n4m_transform_log_transform_transform' },
  },
  {
    id: 'preprocessing.filtering.wavelet_denoise',
    type: 'WaveletDenoise',
    name: 'Wavelet denoise',
    category: 'preprocessing',
    subcategory: 'filtering',
    description: 'Multi-level DWT VisuShrink denoising (shape-preserving).',
    icon: 'Wind',
    advanced: true,
    params: [
      { name: 'family', label: 'family', type: 'select', default: 0, options: [
        { value: 0, label: 'haar' }, { value: 1, label: 'db4' }, { value: 2, label: 'sym4' }, { value: 3, label: 'coif1' },
      ] },
      { name: 'level', label: 'level', type: 'int', default: 3, min: 1, max: 8 },
    ],
    n4m: { fit: null, transform: 'n4m_transform_wavelet_denoise_transform' },
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
    n4m: { fit: 'n4m_estimators_pls_fit', predict: 'n4m_wasm_pls_predict_from_coeffs' },
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
    n4m: { fit: 'n4m_estimators_pls_lda_fit', predict: 'n4m_wasm_pls_predict_from_coeffs' },
  },

  {
    id: 'models.pls.aom_pls',
    type: 'AOMPLS',
    name: 'AOM-PLS',
    category: 'model',
    description:
      'Operator-adaptive PLS — screens a bank of strict-linear preprocessing operators by internal CV and fits SIMPLS on the single winner, returning input-space coefficients. Screens preprocessing internally, so use it WITHOUT preceding preprocessing steps.',
    icon: 'Wand2',
    task: 'regression',
    params: [
      { name: 'n_components', label: 'Max components', type: 'int', default: 15, min: 1, max: 40, help: 'Max latent variables for the internal SIMPLS fits.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV fold count for the operator screen.' },
      { name: 'operator_bank', label: 'Operator bank', type: 'operators', default: AOM_DEFAULT_BANK, help: 'Strict-linear operators screened by the AOM selector. Picking fewer/different operators changes the fit.' },
    ],
    n4m: { fit: 'n4m_model_selection_aom_pls_select', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
  },

  {
    id: 'models.pls.pop_pls',
    type: 'POPPLS',
    name: 'POP-PLS',
    category: 'model',
    description:
      'Per-operator PLS — like AOM-PLS but picks one strict-linear operator PER latent component (per-component AOM) rather than one for the whole model, then returns input-space coefficients. Screens preprocessing internally, so use it WITHOUT preceding preprocessing steps.',
    icon: 'Wand2',
    task: 'regression',
    params: [
      { name: 'n_components', label: 'Max components', type: 'int', default: 15, min: 1, max: 40, help: 'Max latent variables; the screen picks an operator for each one.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV fold count for the per-component operator screen.' },
      { name: 'operator_bank', label: 'Operator bank', type: 'operators', default: AOM_DEFAULT_BANK, help: 'Strict-linear operators the per-component selector may pick from.' },
    ],
    n4m: { fit: 'n4m_model_selection_pop_pls_select', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
  },

  {
    id: 'models.ensemble.aom_ridge_blender',
    type: 'AOMRidgeBlender',
    name: 'AOM-Ridge blender',
    category: 'model',
    description:
      'AOM Ridge simplex blender — builds a strict-linear chain bank, scores (chain, λ) Ridge candidates by out-of-fold CV, then non-negatively blends them and folds the result back into input-space coefficients. Screens preprocessing internally, so use it WITHOUT preceding preprocessing steps.',
    icon: 'Wand2',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'profile', label: 'Bank profile', type: 'select', default: 0, options: [
        { value: 0, label: 'compact' }, { value: 1, label: 'wide' },
      ], help: 'Strict-linear chain bank size screened by the blender.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV folds for the out-of-fold Ridge scoring.' },
      { name: 'regularizer', label: 'Blend regularizer', type: 'float', default: 0.01, min: 0, max: 10, step: 0.01, help: 'Shrinks the simplex blend weights toward uniform.' },
    ],
    n4m: { fit: 'n4m_ensemble_aom_ridge_blender_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
  },

  {
    id: 'models.ensemble.aom_operator_pls_stack',
    type: 'AOMOperatorPLSStack',
    name: 'AOM PLS stack',
    category: 'model',
    description:
      'AOM operator-PLS score stack with a Ridge head — fits a PLS score projector per strict-linear operator, concatenates the scores, CV-selects (components, α), refits the Ridge head and folds the stack into input-space coefficients. Single-target regression. Screens preprocessing internally, so use it WITHOUT preceding preprocessing steps.',
    icon: 'Wand2',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'profile', label: 'Bank profile', type: 'select', default: 0, options: [
        { value: 0, label: 'compact' }, { value: 1, label: 'wide' },
      ], help: 'Strict-linear operator bank size.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV folds for the (components, α) screen.' },
      { name: 'n_components', label: 'Max components', type: 'int', default: 15, min: 1, max: 40, help: 'Component-grid endpoint; the screen tries 1…this.' },
      { name: 'std_penalty', label: 'Std penalty', type: 'float', default: 0, min: 0, max: 10, step: 0.05, help: 'Penalty on OOF-RMSE std in the selection criterion.' },
      { name: 'gap_penalty', label: 'Gap penalty', type: 'float', default: 0, min: 0, max: 10, step: 0.05, help: 'Penalty on the (OOF − train) RMSE gap.' },
    ],
    n4m: { fit: 'n4m_ensemble_aom_operator_pls_stack_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
  },

  // ---- Tier A: algorithm-enum family (via n4m_wasm_model_fit) -------------
  {
    id: 'models.pls.pcr',
    type: 'PCR',
    name: 'PCR',
    category: 'model',
    description: 'Principal Component Regression — PCA projection followed by OLS on the scores.',
    icon: 'GitBranch',
    task: 'regression',
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of principal components.' },
    ],
    n4m: { fit: 'n4m_model_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.pls_canonical',
    type: 'PLSCanonical',
    name: 'PLS Canonical',
    category: 'model',
    description: 'Canonical PLS (NIPALS, symmetric deflation) — projects X and Y onto shared latent directions.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_model_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.pls_svd',
    type: 'PLSSVD',
    name: 'PLS SVD',
    category: 'model',
    description: 'Cross-covariance PLS-SVD scores — single SVD of XᵀY, no deflation.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_model_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },

  // ---- Tier B: standalone coeff fits (via n4m_wasm_model_fit) -------------
  {
    id: 'models.linear.ridge',
    type: 'Ridge',
    name: 'Ridge',
    category: 'model',
    description: 'Closed-form ridge regression — L2-penalised OLS with a fitted intercept (sklearn parity).',
    icon: 'GitBranch',
    task: 'regression',
    params: [
      { name: 'lambda', label: 'λ (L2 penalty)', type: 'float', default: 1, min: 1e-6, max: 1e6, step: 0.1, help: 'Regularization strength.' },
    ],
    n4m: { fit: 'n4m_estimators_ridge_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.ridge_pls',
    type: 'RidgePLS',
    name: 'Ridge PLS',
    category: 'model',
    description: 'Ridge-augmented SIMPLS — adds an L2 penalty into the PLS direction search.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'ridge_lambda', label: 'λ (L2 penalty)', type: 'float', default: 1, min: 0, max: 1e6, step: 0.1 },
    ],
    n4m: { fit: 'n4m_estimators_ridge_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.continuum',
    type: 'ContinuumRegression',
    name: 'Continuum',
    category: 'model',
    description: 'Continuum regression — τ interpolates between PLS (0) and OLS-like (1).',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'tau', label: 'τ', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    n4m: { fit: 'n4m_estimators_continuum_regression_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.robust_pls',
    type: 'RobustPLS',
    name: 'Robust PLS',
    category: 'model',
    description: 'Robust PLS via IRLS with Huber weights — downweights outlying samples.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'huber_k', label: 'Huber k', type: 'float', default: 1.345, min: 0.5, max: 3, step: 0.05 },
      { name: 'max_irls_iter', label: 'IRLS iters', type: 'int', default: 5, min: 1, max: 50 },
    ],
    n4m: { fit: 'n4m_estimators_robust_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.cppls',
    type: 'CPPLS',
    name: 'CPPLS',
    category: 'model',
    description: 'Canonical Powered PLS — γ powers the per-column std rescaling before SIMPLS.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'gamma', label: 'γ', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    n4m: { fit: 'n4m_estimators_cppls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.sparse_simpls',
    type: 'SparseSIMPLS',
    name: 'Sparse SIMPLS',
    category: 'model',
    description: 'Sparse SIMPLS — soft-thresholds the SIMPLS direction for feature sparsity.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'sparsity_lambda', label: 'sparsity λ', type: 'float', default: 0, min: 0, max: 10, step: 0.01 },
    ],
    n4m: { fit: 'n4m_estimators_sparse_simpls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.group_sparse_pls',
    type: 'GroupSparsePLS',
    name: 'Group sparse PLS',
    category: 'model',
    description: 'Group sparse PLS — soft-thresholds all features as one group (single-group surface).',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'group_lambda', label: 'group λ', type: 'float', default: 0, min: 0, max: 10, step: 0.01 },
    ],
    n4m: { fit: 'n4m_estimators_group_sparse_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.fused_sparse_pls',
    type: 'FusedSparsePLS',
    name: 'Fused sparse PLS',
    category: 'model',
    description: 'Fused sparse PLS — L1 sparsity plus fusion of consecutive features.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'l1_lambda', label: 'L1 λ', type: 'float', default: 0, min: 0, max: 10, step: 0.01 },
      { name: 'fusion_lambda', label: 'fusion λ', type: 'float', default: 0, min: 0, max: 10, step: 0.01 },
    ],
    n4m: { fit: 'n4m_estimators_fused_sparse_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.ensemble.bagging_pls',
    type: 'BaggingPLS',
    name: 'Bagging PLS',
    category: 'model',
    description: 'Bootstrap-aggregated PLS — averages coefficients over resampled fits.',
    icon: 'Boxes',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'n_estimators', label: 'estimators', type: 'int', default: 10, min: 2, max: 100 },
      { name: 'seed', label: 'seed', type: 'int', default: 0, min: 0, max: 1e9 },
    ],
    n4m: { fit: 'n4m_ensemble_bagging_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.ensemble.boosting_pls',
    type: 'BoostingPLS',
    name: 'Boosting PLS',
    category: 'model',
    description: 'Gradient-boosting style stage-wise PLS refit.',
    icon: 'Boxes',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'n_estimators', label: 'estimators', type: 'int', default: 10, min: 2, max: 100 },
      { name: 'learning_rate', label: 'learning rate', type: 'float', default: 0.1, min: 0.01, max: 1, step: 0.01 },
    ],
    n4m: { fit: 'n4m_ensemble_boosting_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.ensemble.random_subspace_pls',
    type: 'RandomSubspacePLS',
    name: 'Random subspace PLS',
    category: 'model',
    description: 'Random-subspace PLS — averages PLS fits over random feature subsets.',
    icon: 'Boxes',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
      { name: 'n_estimators', label: 'estimators', type: 'int', default: 10, min: 2, max: 100 },
      { name: 'features_per_subspace', label: 'features/subspace', type: 'int', default: 50, min: 1, max: 5000 },
      { name: 'seed', label: 'seed', type: 'int', default: 0, min: 0, max: 1e9 },
    ],
    n4m: { fit: 'n4m_ensemble_random_subspace_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },

  // ---- Tier B extension: additional coeff-triple fits (via n4m_wasm_model_fit) ----
  {
    id: 'models.pls.mir_pls',
    type: 'MIRPLS',
    name: 'MIR-PLS',
    category: 'model',
    description: 'Multiple Inverse Regression PLS — runs SIMPLS on (Y, X) and pseudo-inverts the Y→X map to get X→Y coefficients; predicts via the centred coefficient form.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_estimators_mir_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.mb_pls',
    type: 'MBPLS',
    name: 'MB-PLS',
    category: 'model',
    description: 'Multi-block PLS over the full spectrum as a single block — block-weighted SIMPLS returning input-space coefficients with a fitted affine intercept (predicts on raw X).',
    icon: 'Boxes',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_estimators_mb_pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.missing_aware_nipals',
    type: 'MissingAwareNIPALS',
    name: 'Missing-aware PLS',
    category: 'model',
    description: 'NIPALS PLS that tolerates missing (NaN) entries in the spectra — same centred coefficient form as PLS, robust to gaps in the input matrix.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent variables.' },
    ],
    n4m: { fit: 'n4m_estimators_missing_aware_nipals_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.ecr',
    type: 'ECR',
    name: 'ECR',
    category: 'model',
    description: 'Elastic Component Regression — α interpolates between PCR (0) and PLS (1), returning an input-space coefficient triple.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_components', label: 'Components', type: 'int', default: 10, min: 1, max: 40, help: 'Number of latent components.' },
      { name: 'alpha', label: 'α (PCR↔PLS)', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05, help: '0 = PCR-like, 1 = PLS-like.' },
    ],
    n4m: { fit: 'n4m_estimators_ecr_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
  {
    id: 'models.pls.o2pls',
    type: 'O2PLS',
    name: 'O2PLS',
    category: 'model',
    description: 'Bidirectional orthogonal PLS (Trygg & Wold) — separates joint predictive variation from X- and Y-orthogonal variation, returning input-space coefficients.',
    icon: 'GitBranch',
    task: 'regression',
    advanced: true,
    params: [
      { name: 'n_predictive', label: 'Predictive comps', type: 'int', default: 2, min: 1, max: 40, help: 'Joint predictive components.' },
      { name: 'n_x_orthogonal', label: 'X-orthogonal comps', type: 'int', default: 1, min: 0, max: 40, help: 'X-orthogonal components removed.' },
      { name: 'n_y_orthogonal', label: 'Y-orthogonal comps', type: 'int', default: 1, min: 0, max: 40, help: 'Y-orthogonal components removed.' },
    ],
    n4m: { fit: 'n4m_estimators_o2pls_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
]

// Split operators — a single train/test split applied BEFORE cross-validation,
// overriding the dataset's partition (the FIRST split). Numerics in libn4m via
// computeSplit → n4m_wasm_split → the n4m_split_* splitters.
export const SPLIT_NODES: NodeDef[] = [
  {
    id: 'split.kennard_stone',
    type: 'KennardStone',
    name: 'Kennard–Stone',
    category: 'split',
    description: 'Kennard–Stone — deterministic train/test split that maximises X-space coverage (picks the most mutually distant spectra into the train set).',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
    ],
    n4m: { fit: 'n4m_model_selection_kennard_stone_create', transform: 'n4m_model_selection_kennard_stone_split' },
  },
  {
    id: 'split.spxy',
    type: 'SPXY',
    name: 'SPXY',
    category: 'split',
    description: 'SPXY — Kennard–Stone using joint X-and-Y distance, so the split spans both spectral and reference-value space. Deterministic.',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
    ],
    n4m: { fit: 'n4m_model_selection_spxy_create', transform: 'n4m_model_selection_spxy_split' },
  },
  {
    id: 'split.kmeans',
    type: 'KMeans',
    name: 'K-means',
    category: 'split',
    description: 'K-means++ clustering split — samples test rows across clusters of the X space for a representative held-out set.',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 1e9, help: 'Random seed (k-means++ init).' },
      { name: 'max_iter', label: 'Max iter', type: 'int', default: 100, min: 1, max: 1000 },
    ],
    n4m: { fit: 'n4m_model_selection_kmeans_create', transform: 'n4m_model_selection_kmeans_split' },
  },
  {
    id: 'split.kbins_stratified',
    type: 'KBinsStratified',
    name: 'K-bins stratified',
    category: 'split',
    description: 'Stratified split on binned Y — bins the target then samples test rows proportionally from each bin, so the test set matches the target distribution.',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 1e9 },
      { name: 'n_bins', label: 'Bins', type: 'int', default: 5, min: 2, max: 20, help: 'Number of Y bins to stratify over.' },
      { name: 'strategy', label: 'Bin edges', type: 'select', default: 0, options: [
        { value: 0, label: 'uniform' }, { value: 1, label: 'quantile' },
      ] },
    ],
    n4m: { fit: 'n4m_model_selection_kbins_stratified_create', transform: 'n4m_model_selection_kbins_stratified_split' },
  },
  {
    id: 'split.data_twinning',
    type: 'DataTwinning',
    name: 'SPlit (twinning)',
    category: 'split',
    description: 'SPlit / data twinning — deterministic X-space split that builds a statistically "twin" test set with balanced multivariate coverage of the training set.',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 1e9 },
    ],
    n4m: { fit: 'n4m_model_selection_data_twinning_create', transform: 'n4m_model_selection_data_twinning_split' },
  },
  {
    id: 'split.systematic_circular',
    type: 'SystematicCircular',
    name: 'Systematic circular',
    category: 'split',
    description: 'Systematic circular split on the target — walks the Y-ordered samples in a circular stride so the test set spans the full target range. Deterministic.',
    icon: 'Split',
    params: [
      { name: 'test_size', label: 'Test fraction', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.05, help: 'Fraction of samples held out as the test set.' },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 1e9 },
    ],
    n4m: { fit: 'n4m_model_selection_systematic_circular_create', transform: 'n4m_model_selection_systematic_circular_split' },
  },
]

// DAG / structure operators — the structural + generator container set. Each is
// a real, executable operator that lowers to a dag-ml step and runs through the
// existing leakage-safe feature-union (concat) + variant machinery (no new
// numerics). `type` is the ContainerNode.container token the editor builds;
// `dag.studioNodeType` is the nirs4all-studio NodeType it corresponds to
// (validated by scripts/validate-catalog.mjs against ../../nirs4all-studio's
// NodeType union). These carry no libn4m ABI symbols (n4m.fit = null) — they are
// orchestration, not numerics.
export const DAG_NODES: NodeDef[] = [
  {
    id: 'dag.branch',
    type: 'Branch',
    name: 'Branch',
    category: 'dag',
    subcategory: 'parallel',
    description:
      'Parallel paths (duplication mode): the input is duplicated into each branch, every branch runs its own preprocessing sub-chain, and the branch outputs are concatenated column-wise into one feature matrix that feeds the model (classic NIRS multi-preprocessing fusion). Leakage-safe — each branch is fit on the training fold only.',
    icon: 'GitBranch',
    params: [],
    n4m: { fit: null },
    dag: { container: 'branch', studioNodeType: 'branch.parallel' },
  },
  {
    id: 'dag.concat_transform',
    type: 'ConcatTransform',
    name: 'Concat-transform',
    category: 'dag',
    subcategory: 'parallel',
    description:
      'Feature fusion: runs ≥2 preprocessing sub-chains on the same input and concatenates their outputs column-wise (dag-ml ConcatTransform). The canonical column-wise feature merge — like Branch, but emitted as dag-ml\'s native concat_transform node.',
    icon: 'Combine',
    params: [],
    n4m: { fit: null },
    dag: { container: 'concat_transform', studioNodeType: 'container.concat_transform' },
  },
  {
    id: 'dag.merge',
    type: 'Merge',
    name: 'Merge',
    category: 'dag',
    subcategory: 'combine',
    description:
      'Combine the branch outputs into one feature matrix by concatenating their columns (dag-ml MergeSources, axis=features). Runs ≥2 sub-chains and merges their feature blocks column-wise before the model — makes the fusion of parallel paths explicit. Note: this is feature concatenation, not prediction stacking (merge.predictions / stacking ensembles need ensembling — see roadmap).',
    icon: 'GitMerge',
    params: [],
    n4m: { fit: null },
    dag: { container: 'merge', studioNodeType: 'merge.sources' },
  },
  {
    id: 'dag.generator.or',
    type: 'GeneratorOr',
    name: 'Generator: OR',
    category: 'dag',
    subcategory: 'generator',
    description:
      'Alternatives → one variant per option (dag-ml Generator, OR mode). Each alternative is a sub-pipeline tried as its own variant; dag-ml expands them, cross-validates each, and selects the best. Reuses the existing per-variant FIT_CV + selection.',
    icon: 'Shuffle',
    params: [],
    n4m: { fit: null },
    dag: { container: 'generator', mode: 'or', studioNodeType: 'generator.or' },
  },
  {
    id: 'dag.generator.cartesian',
    type: 'GeneratorCartesian',
    name: 'Generator: Cartesian',
    category: 'dag',
    subcategory: 'generator',
    description:
      'Cross-product of axes → every combination as a variant (dag-ml Generator, Cartesian mode). Each axis is a set of alternatives; dag-ml expands the cartesian product, cross-validates each variant, and selects the best.',
    icon: 'Grid3x3',
    params: [],
    n4m: { fit: null },
    dag: { container: 'generator', mode: 'cartesian', studioNodeType: 'generator.cartesian' },
  },
]

export const ALL_NODES: NodeDef[] = [...PREPROCESSING_NODES, ...MODEL_NODES, ...SPLIT_NODES, ...DAG_NODES]

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

/** The dag-node catalog entry for a structural container kind (+ generator mode). */
export function dagNodeFor(container: string, mode?: string): NodeDef | undefined {
  return DAG_NODES.find((n) => n.dag?.container === container && (mode === undefined || n.dag?.mode === mode))
}
