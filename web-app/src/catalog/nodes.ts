import {
  NATIVE_AUGMENTATION_NODES,
  NATIVE_FILTER_NODES,
  NATIVE_MODEL_NODES,
  NATIVE_PREPROCESSING_NODES,
  NATIVE_SPLIT_NODES,
} from './native'
import type { NodeDef } from './types'

// Native nirs4all-methods preprocessing, sample filters, augmentation, models
// and splits come from the n4m manifest (./native) and run through the generic
// n4m role API. The hand-written entries below are the models the manifest does
// not describe: the ml.js estimators and PLS Canonical / SVD (legacy libn4m
// dispatcher). Their `n4m` ABI symbols are checked by `scripts/validate-catalog.mjs`.

export const PREPROCESSING_NODES: NodeDef[] = NATIVE_PREPROCESSING_NODES
export const FILTER_NODES: NodeDef[] = NATIVE_FILTER_NODES
export const AUGMENTATION_NODES: NodeDef[] = NATIVE_AUGMENTATION_NODES

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

export const SPLIT_NODES: NodeDef[] = NATIVE_SPLIT_NODES

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

export const ALL_NODES: NodeDef[] = [...PREPROCESSING_NODES, ...FILTER_NODES, ...AUGMENTATION_NODES, ...MODEL_NODES, ...SPLIT_NODES, ...DAG_NODES]

/** Node categories a pipeline's main chain (`steps`) may hold: preprocessing and
 *  the train-only row operators. Container branches hold preprocessing only. */
export const MAIN_CHAIN_CATEGORIES: readonly string[] = ['preprocessing', 'filter', 'augmentation']

const BY_TYPE = new Map(ALL_NODES.map((n) => [n.type, n]))
export function nodeByType(type: string): NodeDef | undefined {
  return BY_TYPE.get(type)
}
export function modelsForTask(task: 'regression' | 'binary' | 'multiclass'): NodeDef[] {
  // Regression keeps only regression/any models. Classification adds the native
  // classifiers (task 'binary') plus every native regressor, which classifies
  // through one-hot targets + argmax (single-target methods refuse that natively).
  if (task === 'regression') return MODEL_NODES.filter((m) => m.task === 'any' || m.task === 'regression')
  return MODEL_NODES.filter((m) => m.task === 'any' || m.task === task || (task === 'multiclass' && m.task === 'binary') || m.native?.role === 'regressor')
}
/** default params object for a node type (params the manifest leaves unset are omitted) */
export function defaultParams(type: string): Record<string, unknown> {
  const def = BY_TYPE.get(type)
  if (!def) return {}
  return Object.fromEntries(def.params.filter((p) => p.default !== undefined).map((p) => [p.name, p.default]))
}

/** The dag-node catalog entry for a structural container kind (+ generator mode). */
export function dagNodeFor(container: string, mode?: string): NodeDef | undefined {
  return DAG_NODES.find((n) => n.dag?.container === container && (mode === undefined || n.dag?.mode === mode))
}
