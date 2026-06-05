// The shared engine contract — the keystone every workstream builds against.
// UI (dataset/pipeline/results), the catalog, the data hooks, and the engine
// implementations all speak these types so nothing diverges. The shipped engine
// is dag-ml-wasm (driving libn4m); a JS stub implements the same interface to
// unblock the UI until the Rust execution binding lands.

export type TaskType = 'regression' | 'binary' | 'multiclass';
export type Partition = 'train' | 'test' | 'predict';

// ---------------------------------------------------------------------------
// Dataset (a browser-materialized view of a nirs4all-io DatasetSpec)
// ---------------------------------------------------------------------------
export interface MaterializedDataset {
  /** row-major, length nSamples * nFeatures */
  X: Float64Array;
  nSamples: number;
  nFeatures: number;
  /** spectral axis, length nFeatures (wavelengths or 0..n-1 index fallback) */
  axis: number[];
  axisUnit: string; // 'nm' | 'cm-1' | 'index' | ...
  /** numeric target: value (regression) or class index (classification) */
  y: Float64Array;
  targetName: string;
  taskType: TaskType;
  /** original labels for classification (length nSamples), parallel to y */
  classes?: string[]
  /** original numeric target before any task encoding (NaN for non-numeric labels) — lets the UI re-encode on task-type change */
  yRaw?: Float64Array
  /** original raw target cells as strings (length nSamples) */
  labelsRaw?: string[];
  /** stable per-sample identity — joins are keyed by this, never by row order */
  sampleIds: string[];
  /** per-sample partition assignment, length nSamples */
  partitions: Partition[];
  /** optional externally-defined folds (else the engine builds KFold from cv.folds) */
  folds?: { foldId: number; valSampleIds: string[] }[];
}

// ---------------------------------------------------------------------------
// Pipeline DSL (the internal, serializable representation; can grow to a graph)
// ---------------------------------------------------------------------------
// --- generators / finetune (all optional; existing flat pipelines stay valid) ---
// These map 1:1 onto dag-ml's per-step `param_generators` + `variants`, the model
// `tuning` spec, and the DSL-level `generation_strategy` / `max_variants`. Variant
// expansion and selection happen in dag-ml (Rust → WASM); these types only carry
// the user's intent to the compiler. See toCompatDsl in dagml.ts.
export type SweepType = 'range' | 'log_range' | 'or';
export interface ParamSweep {
  type: SweepType;
  /** range / log_range bounds */
  from?: number;
  to?: number;
  step?: number;
  /** log_range value count (also caps range) */
  count?: number;
  /** or: explicit discrete values */
  choices?: (string | number | boolean)[];
}
export interface StepVariant {
  label: string;
  /** catalog `type` token of the alternative operator */
  type: string;
  params: Record<string, unknown>;
}
export type FinetuneParamType = 'int' | 'float' | 'log_float' | 'categorical';
export interface FinetuneParam {
  name: string;
  type: FinetuneParamType;
  low?: number;
  high?: number;
  /** discretizing step for `float` (and override for `int`) → lowers to a `range` generator */
  step?: number;
  /** sample count for `log_float` → lowers to a `log_range` generator */
  count?: number;
  choices?: (string | number)[];
}
export interface FinetuneSpec {
  enabled: boolean;
  n_trials: number;
  approach?: 'grouped' | 'individual';
  eval_mode?: 'best' | 'mean';
  params: FinetuneParam[];
}

export interface PipelineStep {
  id: string; // unique instance id
  type: string; // node catalog `type` token (e.g. 'StandardNormalVariate', 'PLS')
  params: Record<string, unknown>;
  /** per-param sweeps → dag-ml `param_generators` (or/range/log_range) */
  sweeps?: Record<string, ParamSweep>;
  /** labelled alternatives → dag-ml per-step `variants` */
  variants?: StepVariant[];
}

// ---------------------------------------------------------------------------
// DAG containers (a FOLDABLE recursive step tree) — the structural / generator
// operator set, matching nirs4all-studio's NodeType (branch | concat_transform |
// merge | generator) and dag-ml's PipelineDslStep variants. A container holds
// nested sub-pipelines (`branches`) and renders as a collapsible, indented tree
// node in the editor (not inline lanes). Each maps to a runnable dag-ml step:
//   - 'branch'   (mode duplication)  → input duplicated into each branch, the
//                                       branch outputs concatenated column-wise.
//   - 'concat_transform'             → the canonical column-wise feature fusion
//                                       (dag-ml ConcatTransform).
//   - 'merge'    (output_as features)→ explicit combine of the branch outputs
//                                       into one feature matrix (dag-ml Merge).
//   - 'generator'(or | cartesian)    → variant expansion over the contained
//                                       sub-pipelines / param axes (dag-ml
//                                       Generator); reuses the existing variant
//                                       machinery.
// ---------------------------------------------------------------------------
/** The structural container kinds — 1:1 with nirs4all-studio NodeType tokens. */
export type ContainerType = 'branch' | 'concat_transform' | 'merge' | 'generator';
/** dag-ml PipelineDslGeneratorMode (Or | Cartesian) — only for generator containers. */
export type GeneratorMode = 'or' | 'cartesian';
/** dag-ml PipelineDslMergeOutput — what a merge container emits. */
export type MergeOutput = 'features' | 'predictions';

/** A single branch of a container: an id + its own preprocessing sub-chain.
 *  Maps to dag-ml's PipelineDslConcatBranch / PipelineDslBranch (id + steps). */
export interface PipelineBranch {
  id: string;
  /** a (possibly empty) preprocessing sub-chain; the recursive step tree lives here */
  steps: PipelineStep[];
}

/** ONE structural container node in the recursive pipeline tree. It is applied
 *  to the (preprocessed) input AFTER `steps` and BEFORE the model; its branches
 *  are nested sub-pipelines the foldable tree expands/collapses. */
export interface ContainerNode {
  id: string;
  /** which structural operator this is (validated against the catalog `dag` bucket) */
  container: ContainerType;
  /** parallel sub-pipelines (≥2 for branch/concat/merge; ≥2 alternatives for an OR generator) */
  branches: PipelineBranch[];
  /** generator only: OR (one-of per variant) vs CARTESIAN (cross-product of axes) */
  mode?: GeneratorMode;
  /** merge only: combine branch outputs as feature concat (default) or predictions */
  output?: MergeOutput;
}

/** v1 back-compat shim: the old single inline feature-union block (one branch
 *  array). normalizeImportedPipeline / loadSession migrate it to a `branch`
 *  ContainerNode so old .n4a / persisted sessions still restore. */
export interface BranchBlock {
  branches: PipelineBranch[];
}

export interface PipelineDSL {
  name: string;
  /** optional train/test split operator applied BEFORE cross-validation: it
   *  overrides the dataset's partition (its test rows are held out of CV, the
   *  train rows feed the CV fold builder). At most one, runs before the model.
   *  type is a split-category catalog token (KennardStone / SPXY / KMeans /
   *  KBinsStratified). */
  split?: PipelineStep;
  /** ordered preprocessing chain */
  steps: PipelineStep[];
  /** optional recursive DAG container tree (branch / concat_transform / merge /
   *  generator), applied AFTER `steps` and BEFORE the model. Each container holds
   *  nested sub-pipelines and renders as a foldable tree node. */
  containers?: ContainerNode[];
  /** DEPRECATED — the old single inline feature-union block. Read on restore and
   *  migrated to `containers`; never written by the editor. */
  branch?: BranchBlock;
  /** terminal estimator — OPTIONAL: a pipeline can be preprocessing-only
   *  (transform preview) or split+preproc with no model. The engine refuses to
   *  score/run a no-model pipeline; the editor surfaces a clear guard. */
  model?: PipelineStep;
  /** cross-validation (the SECOND split, right after train/test) — OPTIONAL.
   *  When ABSENT the run is REFIT-ONLY: the pipeline is fit on the train rows and
   *  scored on the test partition (or train if none) with no CV / OOF / CV score
   *  node. When present, dag-ml builds the KFold fold_set and runs FIT_CV. */
  cv?: { folds: number; seed: number };
  /** model hyperparameter search → dag-ml model `tuning` */
  finetune?: FinetuneSpec;
  /** DSL-level cartesian/zip expansion → `generation_strategy` / `max_variants` */
  generation?: { strategy: 'cartesian' | 'zip'; maxVariants?: number };
}

// ---------------------------------------------------------------------------
// Results (mirrors a dag-ml ExecutionBundle, shaped for the UI)
// ---------------------------------------------------------------------------
export interface Metrics {
  // regression
  rmse?: number;
  r2?: number;
  mae?: number;
  // classification
  accuracy?: number;
  f1?: number;
  // common
  n?: number;
}
export interface PredRow {
  sampleId: string;
  actual: number;
  predicted: number;
  residual: number;
  actualLabel?: string;
  predictedLabel?: string;
}
export interface Confusion {
  labels: string[];
  matrix: number[][]; // [trueClass][predClass]
}
export type ScoreKind = 'refit' | 'cv' | 'fold';
export interface ScoreNode {
  id: string;
  name: string;
  kind: ScoreKind;
  metrics: Metrics;
  predictions: PredRow[];
  confusion?: Confusion;
  status: 'completed' | 'running' | 'failed';
}

/** Opaque fitted pipeline — produced by run(), consumed by predict(). */
export interface FittedPipeline {
  dsl: PipelineDSL;
  taskType: TaskType;
  nFeatures: number;
  classes?: string[];
  /** engine-specific serialized state (preprocessing states + model coeffs) */
  state: unknown;
}

export interface RunResult {
  id: string;
  pipelineName: string;
  taskType: TaskType;
  targetName: string;
  /** model refit on all training data, scored on the held-out test partition (or train if none) */
  refit: ScoreNode;
  /** cross-validation aggregate over folds — OPTIONAL: omitted for a refit-only
   *  run (pipeline.cv absent). When omitted, `folds` is empty too. */
  cv?: ScoreNode;
  folds: ScoreNode[];
  seed: number;
  /** which engine produced this ('stub-js-pls' | 'dag-ml-wasm' | ...) */
  engine: string;
  /** the selection/lineage metric recorded canonically by the engine */
  scoreMetric: keyof Metrics;
  lineage?: unknown;
  bundleJson?: unknown;
  model: FittedPipeline;
  createdAt: string;
  /** number of variants dag-ml expanded + evaluated (omitted / 1 for a single-variant run) */
  variantCount?: number;
  /** per-variant CV scores; the winner dag-ml's selection picked has `selected: true` */
  variants?: { variantId: string; label: string; metrics: Metrics; selected: boolean }[];
}

// ---------------------------------------------------------------------------
// Engine facade
// ---------------------------------------------------------------------------
export interface RunProgress {
  phase: 'preprocess' | 'fit_cv' | 'select' | 'refit' | 'predict' | 'done';
  pct: number; // 0..100
  message?: string;
}
export interface RunOptions {
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
}
export interface PredictResult {
  values: Float64Array;
  labels?: string[];
}
export interface Engine {
  readonly name: string;
  run(ds: MaterializedDataset, dsl: PipelineDSL, opts?: RunOptions): Promise<RunResult>;
  predict(
    model: FittedPipeline,
    Xnew: Float64Array,
    nSamples: number,
    nFeatures: number,
  ): Promise<PredictResult>;
}
