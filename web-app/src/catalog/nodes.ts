import { NATIVE_MODEL_NODES, NATIVE_PREPROCESSING_NODES, NATIVE_SPLIT_NODES } from './native'
import type { NodeDef } from './types'
import { AOM_DEFAULT_BANK } from './types'

// Native nirs4all-methods preprocessing, models and splits come from the n4m
// manifest (./native). The hand-written entries below are the ones the manifest
// does not describe the way the staged WASM runs them: ml.js models, the AOM
// family bridges, PLS Canonical / SVD and data twinning. Their `n4m` ABI symbols
// are checked by `scripts/validate-catalog.mjs`.

export const PREPROCESSING_NODES: NodeDef[] = NATIVE_PREPROCESSING_NODES

export const MODEL_NODES: NodeDef[] = [
  {
    id: 'models.mljs.decision_tree_regressor',
    type: 'MlJsDecisionTreeRegressor',
    name: 'Decision tree (ml.js)',
    category: 'model',
    description: 'CART regression from ml.js; model JSON remains specific to ml.js.',
    icon: 'Trees',
    task: 'regression',
    provider: 'mljs',
    params: [
      { name: 'min_samples', label: 'Min. samples', type: 'int', default: 3, min: 1, max: 100 },
      { name: 'max_depth', label: 'Max. depth', type: 'int', default: 20, min: 1, max: 100 },
    ],
    n4m: { fit: null },
  },
  {
    id: 'models.mljs.decision_tree_classifier',
    type: 'MlJsDecisionTreeClassifier',
    name: 'Decision tree classifier (ml.js)',
    category: 'model',
    description: 'CART classification from ml.js; predicts hard class labels.',
    icon: 'Trees',
    task: 'binary',
    provider: 'mljs',
    params: [
      { name: 'min_samples', label: 'Min. samples', type: 'int', default: 3, min: 1, max: 100 },
      { name: 'max_depth', label: 'Max. depth', type: 'int', default: 20, min: 1, max: 100 },
    ],
    n4m: { fit: null },
  },
  {
    id: 'models.mljs.knn_classifier',
    type: 'MlJsKNeighborsClassifier',
    name: 'KNN classifier (ml.js)',
    category: 'model',
    description: 'K-nearest-neighbor classification from ml.js; predicts hard class labels.',
    icon: 'Network',
    task: 'binary',
    provider: 'mljs',
    params: [
      { name: 'n_neighbors', label: 'Neighbors', type: 'int', default: 5, min: 1, max: 100 },
    ],
    n4m: { fit: null },
  },
  {
    id: 'models.mljs.random_forest_regressor',
    type: 'MlJsRandomForestRegressor',
    name: 'Random forest (ml.js)',
    category: 'model',
    description: 'Seeded random forest regression from ml.js; model JSON remains specific to ml.js.',
    icon: 'Trees',
    task: 'regression',
    provider: 'mljs',
    params: [
      { name: 'n_estimators', label: 'Trees', type: 'int', default: 100, min: 1, max: 1000 },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 2147483647 },
    ],
    n4m: { fit: null },
  },
  {
    id: 'models.mljs.random_forest_classifier',
    type: 'MlJsRandomForestClassifier',
    name: 'Random forest classifier (ml.js)',
    category: 'model',
    description: 'Seeded random forest classification from ml.js; predicts hard class labels.',
    icon: 'Trees',
    task: 'binary',
    provider: 'mljs',
    params: [
      { name: 'n_estimators', label: 'Trees', type: 'int', default: 100, min: 1, max: 1000 },
      { name: 'seed', label: 'Seed', type: 'int', default: 42, min: 0, max: 2147483647 },
    ],
    n4m: { fit: null },
  },
  ...NATIVE_MODEL_NODES,

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
      { name: 'n_components', label: 'Max components', type: 'int', default: 5, min: 1, max: 40, help: 'Max latent variables for the internal SIMPLS fits. Start small; increase after checking convergence.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV fold count for the operator screen.' },
      { name: 'operator_bank', label: 'Operator bank', type: 'operators', default: AOM_DEFAULT_BANK, help: 'Strict-linear operators screened by the AOM selector. Picking fewer/different operators changes the fit.' },
    ],
    n4m: { fit: 'n4m_model_selection_aom_pls_select', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
    classifiable: true,
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
      { name: 'n_components', label: 'Max components', type: 'int', default: 5, min: 1, max: 40, help: 'Max latent variables; the screen picks an operator for each one. Increasing this can make the nested search expensive.' },
      { name: 'screen_folds', label: 'Screen CV folds', type: 'int', default: 5, min: 2, max: 10, help: 'Internal-CV fold count for the per-component operator screen.' },
      { name: 'operator_bank', label: 'Operator bank', type: 'operators', default: AOM_DEFAULT_BANK, help: 'Strict-linear operators the per-component selector may pick from.' },
    ],
    n4m: { fit: 'n4m_model_selection_pop_pls_select', predict: 'n4m_wasm_model_predict_from_coeffs' },
    autonomous: true,
    classifiable: true,
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
    classifiable: true,
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
      { name: 'n_components', label: 'Components', type: 'int', default: 1, min: 1, max: 40, help: 'Limited by the number of targets: one component for single-target regression.' },
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
      { name: 'n_components', label: 'Components', type: 'int', default: 1, min: 1, max: 40, help: 'Limited by the number of targets: one component for single-target regression.' },
    ],
    n4m: { fit: 'n4m_model_fit', predict: 'n4m_wasm_model_predict_from_coeffs' },
  },
]

export const SPLIT_NODES: NodeDef[] = [
  ...NATIVE_SPLIT_NODES,
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
  // Regression keeps only regression/any models. Classification adds PLS-DA (task
  // 'binary') plus every `classifiable` regression model (one-hot Y + argmax).
  if (task === 'regression') return MODEL_NODES.filter((m) => m.task === 'any' || m.task === 'regression')
  return MODEL_NODES.filter((m) => m.task === 'any' || m.task === task || (task === 'multiclass' && m.task === 'binary') || m.classifiable)
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
