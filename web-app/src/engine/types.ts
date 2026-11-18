// The shared engine contract — the keystone every workstream builds against.
// UI (dataset/pipeline/results), the catalog, the data hooks, and the engine
// implementations all speak these types so nothing diverges. The shipped engine
// is dag-ml-wasm (driving libn4m); a JS stub implements the same interface to
// unblock the UI until the Rust execution binding lands.

import type { RtError } from './rt';
import type { RtResultWire } from './rt-result';

export type TaskType = 'regression' | 'binary' | 'multiclass';
export type Partition = 'train' | 'test' | 'predict';

// ---------------------------------------------------------------------------
// Dataset (a browser-materialized view of a nirs4all-io DatasetSpec)
// ---------------------------------------------------------------------------
export interface DatasetIdentity {
  basis: 'declared' | 'positional';
  sampleIdColumn?: string;
  observationIdColumn?: string;
  groupColumn?: string;
  /** why the identity is positional */
  reason?: string;
}

/** Host-boundary key under which the complete original nirs4all-io record (masks and
 *  identity included), its spec, analysis and input bytes are retained BY REFERENCE on a
 *  dataset ingested through io. A symbol key, so `{ ...ds }` keeps the reference while the
 *  structured clone sent to the engine worker carries none of it (no copy, no leak). */
export const IO_RECORD: unique symbol = Symbol.for('nirs4all.web.io-record');

/** One target column of the owner target table (nirs4all-io `y.columns`), carried for every
 *  target of the dataset. `values` and `labels` are the owner's logical values under its
 *  validity mask; nothing is imputed, dropped or re-read here. */
export interface DatasetTarget {
  name: string;
  /** nirs4all-io column kind */
  kind: 'numeric' | 'classification_integer' | 'classification_string';
  /** owner numeric value per row (length nSamples). NaN where the owner mask reports a missing
   *  value, where the row's partition carries no target, and for every row of a text-label column */
  values: Float64Array;
  /** owner text label per row of a `classification_string` column ('' where missing) */
  labels?: string[];
  /** rows the owner reports without a value for this target (all partitions) */
  missing: number;
  /** why the target cannot be used as it is (e.g. the owner read it as numbers in one partition and
   *  as text labels in another). The dataset still loads; this target then carries no value. */
  issue?: string;
  /** the user's task-type choice for this target (absent: inferred) */
  taskType?: TaskType;
}

/** Feature cells nirs4all-io reports missing (owner validity mask; NaN in `X`). */
export interface MissingFeatures {
  cells: number;
  /** rows with at least one missing cell */
  rows: number;
  /** feature columns with at least one missing cell */
  columns: number;
}

/** What a run does with train/test samples that have no value for its target: left out of fitting
 *  and scoring (natively, by the engine), or the run stops. A launch choice with a visible default. */
export type MissingValuePolicy = 'exclude_samples' | 'refuse';

/** What a run does with missing spectral values (NA in X). Asked explicitly when the dataset has
 *  some — there is no default — and applied to the run's own view, never to the loaded dataset:
 *  remove the affected samples, replace the values with a method nirs4all-io supports (within each
 *  spectrum; io refuses statistics across samples), or leave them as they are for the pipeline. */
export type MissingSpectraChoice =
  | { action: 'remove_samples' }
  | { action: 'replace'; method: 'forward_fill' | 'backward_fill' | 'value'; value?: number }
  | { action: 'keep' };

/** The launch choices of a run and what they left out of it (counted before the run). */
export interface RunDataSelection {
  /** the target the run models */
  target: string;
  missingValues: MissingValuePolicy;
  /** train/test rows without a value for the target: never fitted or scored */
  missingTargets: number;
  /** the choice made for missing spectral values (absent: the spectra are complete) */
  missingSpectra?: MissingSpectraChoice;
  /** missing spectral cells of the dataset, and the rows that hold them */
  missingCells: number;
  incompleteSamples: number;
  /** rows left out of the run's view because of a missing spectral value */
  excludedSamples: number;
  /** missing spectral cells replaced by nirs4all-io in the run's view */
  replacedCells: number;
  /** labelled rows the run fits on, and scores as the held-out test set */
  train: number;
  test: number;
}

export interface MaterializedDataset {
  /** the retained original io record (see IO_RECORD); opaque here, typed in data/wasm-io.ts */
  [IO_RECORD]?: unknown;
  /** every target column nirs4all-io assembled, in owner order. `y`, `targetName`, `taskType`,
   *  `classes`, `yRaw` and `labelsRaw` are the projection of ONE of them (`targetName`): the
   *  view target before a run, the launch target for a run (`data/targets.ts`). Absent for a
   *  dataset that did not come from io. */
  targets?: DatasetTarget[];
  /** missing feature cells reported by the owner (absent: X is complete) */
  missingFeatures?: MissingFeatures;
  /** row-major, length nSamples * nFeatures */
  X: Float64Array;
  nSamples: number;
  nFeatures: number;
  /** spectral axis, length nFeatures (wavelengths or 0..n-1 index fallback) */
  axis: number[];
  axisUnit: string; // 'nm' | 'cm-1' | 'index' | ...
  /** column names from a non-numeric header, length nFeatures (absent: the
   *  columns are named by `axis`, or anonymous when axisUnit is 'index') */
  featureNames?: string[];
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
  /** user-visible sample identity (UI, exports). Replicate scans may repeat it;
   *  the engine addresses rows by their canonical row identity (`s{row}`). */
  sampleIds: string[];
  /** header of the column `sampleIds` were read from (absent: generated ids) */
  sampleIdColumn?: string;
  /** repetition column (nirs4all `repetition`): the metadata column — or
   *  `sampleIdColumn` — naming the physical sample of each spectrum. Opt-in;
   *  when set, CV keeps a sample's repetitions in one fold. */
  repetition?: string;
  /** Explicit metadata roles, aligned with X; absent means undeclared. */
  groupIds?: (string | null)[];
  originIds?: (string | null)[];
  repetitionIds?: (string | null)[];
  augmented?: boolean[];
  /** per-sample partition assignment, length nSamples */
  partitions: Partition[];
  /** nirs4all-io's original partition name of each row (length nSamples), kept for display and exports */
  partitionNames?: string[];
  /** io name of the single held-out partition mapped to `test` (e.g. `val`); evaluation only, never used for selection */
  heldOutName?: string;
  /** io's declared observation identity per row (absent: io declared none; `s{i}` is only an execution row handle) */
  observationIds?: (string | null)[];
  /** How `sampleIds` were obtained. `positional`: io declared no usable sample key, so every row is its
   *  own sample identified by partition and row position (not a scientific identifier). */
  identity?: DatasetIdentity;
  /** optional per-sample metadata columns (from an uploaded metadata file).
   *  Never enters X/y. Reserved relation columns also populate the explicit
   *  group/origin/repetition roles used by dag-ml-data and native CV;
   *  used for colouring/inspection. Each column's `values` has length nSamples,
   *  in the same owner-declared partition and within-partition row order as X. */
  metadata?: { name: string; kind: 'numeric' | 'categorical'; values: (number | string | null)[] }[];
  /** optional externally-defined folds (else the engine builds KFold from cv.folds) */
  folds?: { foldId: number; valSampleIds: string[] }[];
}

// ---------------------------------------------------------------------------
// Pipeline DSL (the internal, serializable representation; can grow to a graph)
// ---------------------------------------------------------------------------
// --- generators / sweeps (all optional; existing flat pipelines stay valid) ---
// These map 1:1 onto dag-ml's per-step `param_generators` + `variants` and the
// DSL-level `generation_strategy` / `max_variants`. Variant expansion and
// selection happen in dag-ml (Rust → WASM); these types only carry the user's
// intent to the compiler. See toCompatDsl in dagml.ts.
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
/** @deprecated Legacy import-only shape. normalizeImportedPipeline migrates this
 *  to explicit model sweeps because the browser build does not ship Optuna. */
export interface FinetuneSpec {
  enabled: boolean;
  n_trials: number;
  approach?: 'grouped' | 'individual';
  eval_mode?: 'best' | 'mean';
  params: FinetuneParam[];
}

export interface PipelineStep {
  id: string; // unique instance id
  type: string; // node catalog `type` token (e.g. 'n4m:preprocessing.scatter.snv', 'n4m:models.pls.pls_regression')
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
  /** a (possibly empty) preprocessing sub-chain; the recursive step tree lives here.
   *  In a Cartesian generator the branch is an AXIS and each step is one alternative. */
  steps: PipelineStep[];
  /** Cartesian axis only: "no step" is also an alternative (nirs4all `null`) */
  optional?: boolean;
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
  /** Cartesian generator only: sample this many combinations (nirs4all `count`) */
  count?: number;
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
   *  type is a split-category catalog token (an n4m splitter, e.g.
   *  'n4m:splitters.kennard_stone'); a K-fold splitter holds out its first fold. */
  split?: PipelineStep;
  /** ordered main chain: preprocessing plus the train-only row operators
   *  (sample filters, augmentation), which predict never replays */
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
  cv?: { folds: number; seed: number; strategy?: 'auto' | 'sample' | 'group' };
  /** @deprecated Legacy import-only field; runtime ignores it. */
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
  bias?: number;
  rpd?: number;
  rpiq?: number;
  // classification
  accuracy?: number;
  f1?: number;
  // common
  n?: number;
}
export interface PredRow {
  /** original physical sample id (never an execution handle) */
  sampleId: string;
  /** original declared observation id of an observation-level row, when io declared one */
  observationId?: string;
  actual: number;
  predicted: number;
  residual: number;
  actualLabel?: string;
  predictedLabel?: string;
}
/** What a score node's metrics are computed over, and by whom. */
export interface ScoreContext {
  /** `sample`: one unit per physical sample; `observation`: one unit per scan */
  unit: 'sample' | 'observation';
  identityBasis: 'declared' | 'positional';
  /** what keys a physical sample: a declared repetition column, the declared sample id, or the
   *  row itself (explicit positional independent-row profile: no physical identity is known) */
  physicalKey: 'repetition' | 'sample_id' | 'row';
  /** observations (scans) of the scored cohort of this node */
  nObservations: number;
  /** physical samples (scored units) of this node; null when no physical identity is known
   *  (`physicalKey: 'row'`) */
  nPhysicalSamples: number | null;
  /** `host-rows`: existing host metric over rows (one observation per sample);
   *  `dag:sample:<method>`: DAG-ML aggregated scans to physical samples and scored them */
  aggregation: 'host-rows' | 'dag:single-holdout' | `dag:sample:${string}`;
  /** observation-level (raw scan) metrics: `not-computed` when scans are aggregated by
   *  DAG-ML, whose runtime implements no raw parallel metric reports */
  rawObservationMetrics?: 'not-computed';
  /** Owner evaluation scope, distinct from independent-test evaluation. */
  evaluation?: 'selection_validation';
  independent_test?: false;
  metric_profile?: string;
  undefined_metrics?: Record<string, string>;
}
/** One raw (per-scan) prediction block, kept as produced: the DAG-ML FIT_CV observation
 *  block of a fold, or the REFIT replay of the scoring rows. `observation_ids` are execution
 *  handles `s{i}`; `RawObservationEvidence.identity` maps them to the original ids. */
export interface RawObservationBlock {
  partition: string;
  fold_id: string | null;
  observation_ids: string[];
  values: number[][];
  target_names: string[];
}
/** Raw scan-level predictions of the selected pipeline (no metrics are computed on them). */
export interface RawObservationEvidence {
  /** selected variant's FIT_CV validation blocks, one per fold (fold provenance in `fold_id`) */
  cv: RawObservationBlock[];
  /** REFIT replay of the scoring rows (held-out test, or train without a test partition) */
  heldout: RawObservationBlock;
  /** observation handle -> original physical sample id and declared observation id */
  identity: Record<string, { sampleId: string; observationId: string | null }>;
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
  scoreContext?: ScoreContext;
}

/** The input columns a model was fitted on, in order. `names` are what predict
 *  checks (spectral axis values in canonical number form, or header names); a
 *  model without it (index axis, older bundle) takes its input by position. */
export interface FeatureIdentity {
  names: string[];
  /** the numeric spectral axis, when the columns are one */
  axis?: number[];
  unit?: string;
}

/** Opaque fitted pipeline — produced by run(), consumed by predict(). */
export interface FittedPipeline {
  dsl: PipelineDSL;
  taskType: TaskType;
  nFeatures: number;
  /** the fitted input columns; absent: positional input */
  features?: FeatureIdentity;
  classes?: string[];
  /** Detached engine-owned state; owner packages retain their exact JSON strings. */
  state: unknown;
}

export interface RunResult {
  id: string;
  pipelineName: string;
  taskType: TaskType;
  targetName: string;
  /** Primary score. Owner single-holdout runs label this Selection validation and
   *  retain its selection_validation context; it is not an all-training refit score. */
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
  /** per-variant CV scores; the winner dag-ml's selection picked has `selected: true`.
   *  `pipeline` is the variant's effective pipeline (its swept / alternative values
   *  applied), absent when only an imported result's variant id is known. */
  variants?: { variantId: string; label: string; metrics: Metrics; selected: boolean; pipeline?: PipelineDSL }[];
  /** Train/Test rows left out of FIT, CV and scoring because their target is
   *  missing (omitted when every row has a target). They remain predictable. */
  missingTargets?: number;
  /** the launch choices (target, missing-value option) and what they left out, recorded by the host */
  dataSelection?: RunDataSelection;
  /** repeated scans of one physical sample: the selected pipeline's raw per-scan predictions
   *  (FIT_CV folds + REFIT scoring replay) with their original-id mapping; scores are
   *  sample-level DAG-ML scores, and no metric is computed on these rows */
  rawObservationPredictions?: RawObservationEvidence;
  /** typed runtime diagnostics (B-018) — e.g. "ran the libn4m fold chain because the
   *  dag-ml scheduler failed". Present only when the engine degraded; a clean dag-ml
   *  run omits it. Lets runtime consumers tell a fallback from a native execution. */
  diagnostics?: RtError[];
  /** neutral runtime-result wire envelope emitted by the worker for export/parity consumers */
  rtResult?: RtResultWire;
  /** Native robustness evidence publication trace. In browser/WASM this is
   *  fail-closed unless a future persistent prediction-array store is added. */
  robustnessEvidencePublicationTrace?: RobustnessEvidencePublicationTrace;
}

export interface NativeRobustnessEvidencePublicationHandoff {
  kind: 'robustness_evidence_publication_handoff';
  requested: boolean;
  destination: 'result_metadata.robustness_evidence' | string;
  failClosed: boolean;
  keywordIds?: string[];
  requiredEffects?: string[];
  conformalArtifactPolicy?: 'prediction_publisher_does_not_persist_conformal_artifacts' | string;
  alignmentStrategies: Array<'sample_indices' | 'full_dataset_length' | 'unique_metadata_identity' | 'relation_manifest_identity'>;
  publishedFields: [
    'prediction_arrays.X',
    'result_metadata.robustness_evidence.X',
    'result_metadata.robustness_evidence.predictor_bundle',
  ];
}

export interface RobustnessEvidencePublicationTrace {
  kind: 'robustness_evidence_publication_trace';
  publisher: 'nirs4all-web.wasm-local' | string;
  status: 'unsupported_runtime' | 'published' | 'incomplete' | 'failed';
  requested: boolean;
  destination: string;
  failClosed: boolean;
  alignmentStrategies: string[];
  publishedFields: string[];
  published: Record<string, unknown>;
  missing: string[];
  reason?: string;
  runtimeEvidence?: RobustnessEvidenceRuntimeEvidence;
  metadata?: Record<string, unknown>;
}

export interface RobustnessEvidenceRuntimeEvidence {
  datasetRows: number;
  datasetFeatures: number;
  refitPredictionCount: number;
  cvPredictionCount: number;
  hasInMemoryModel: boolean;
}

export interface RobustnessEvidencePublisherInput {
  dataset: MaterializedDataset;
  handoff: NativeRobustnessEvidencePublicationHandoff;
  result: RunResult;
  runtimeEvidence: RobustnessEvidenceRuntimeEvidence;
}

export interface RobustnessEvidencePublisherResult {
  publisher?: string;
  published: Record<string, unknown>;
  missing?: string[];
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type RobustnessEvidencePublisher = (
  input: RobustnessEvidencePublisherInput
) => RobustnessEvidencePublisherResult | Promise<RobustnessEvidencePublisherResult>;

export interface RobustnessEvidenceSidecarOptions {
  kind: 'indexeddb';
  dbName?: string;
  storeName?: string;
}

// ---------------------------------------------------------------------------
// Engine facade
// ---------------------------------------------------------------------------
export interface RunProgress {
  phase: 'preprocess' | 'fit_cv' | 'select' | 'refit' | 'predict' | 'done';
  pct: number; // 0..100 — over the whole run, every variant included
  message?: string;
  /** the variant being evaluated (1-based) when the run explores several */
  variant?: { index: number; total: number };
}
/** One entry in the live execution log — every onProgress call becomes an entry. */
export interface RunLogEntry {
  ts: number   // Date.now() in ms (absolute; relative display computed vs. first entry)
  phase: RunProgress['phase']
  pct: number
  message?: string
}
export interface RunOptions {
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
  /** When the dag-ml/WASM scheduler can't run a shape, the engine degrades to the
   *  libn4m fold chain only when explicitly allowed. Default (`false`/omitted)
   *  is strict and throws an `RtErrorException`; `true` records a typed `RtError`
   *  on `RunResult.diagnostics` and returns the diagnosed fallback result (B-018). */
  allowFallback?: boolean;
  /** Optional Studio/native handoff asking the runtime to publish spectral/OOD
   *  replay evidence. Browser/WASM currently records a fail-closed trace because
   *  it has in-memory results but no persistent prediction-array sidecar store
   *  unless a host-sidecar publisher is provided below. */
  robustnessEvidencePublicationHandoff?: NativeRobustnessEvidencePublicationHandoff;
  /** Optional host-sidecar publisher for browser runtimes that do provide a real
   *  persistent prediction-array store. When omitted, the engine keeps the
   *  existing fail-closed `unsupported_runtime` trace. */
  robustnessEvidencePublisher?: RobustnessEvidencePublisher;
  /** Serializable sidecar request for WorkerEngine. Unlike
   *  `robustnessEvidencePublisher`, this can cross `postMessage`; the worker then
   *  creates the concrete publisher in its own runtime context. */
  robustnessEvidenceSidecar?: RobustnessEvidenceSidecarOptions;
}
export interface PredictResult {
  values: Float64Array;
  labels?: string[];
  /** Matrix metadata is present for canonical Archive V2 multi-target replay. */
  rows?: number;
  cols?: number;
  sampleIds?: string[];
  targetNames?: string[];
  engine?: 'nirs4all-methods-wasm';
  fallback?: false;
  archiveSha256?: string;
}
/** A shareable export of a fitted model (the .n4a file). */
export interface ExportOptions {
  /** the user explicitly agreed to share the training spectra some fitted states embed */
  allowTrainingRows: boolean;
}
export interface Engine {
  readonly name: string;
  run(ds: MaterializedDataset, dsl: PipelineDSL, opts?: RunOptions): Promise<RunResult>;
  /** `featureNames`: the input's column names in order (from its header). A
   *  model that records its columns refuses names that differ in content, order
   *  or count; without names the input is taken by position. */
  predict(
    model: FittedPipeline,
    Xnew: Float64Array,
    nSamples: number,
    nFeatures: number,
    featureNames?: string[],
  ): Promise<PredictResult>;
  /** The shareable copy of a model this engine fitted: every state is
   *  re-serialized by its backend, and one that embeds training rows is refused
   *  unless `opts.allowTrainingRows`. The session model is not an export. */
  exportModel(model: FittedPipeline, opts: ExportOptions): Promise<FittedPipeline>;
  /** Model-agnostic attributions of the complete fitted pipeline in raw input space,
   *  computed by the Methods explain session over the same predict dispatch.
   *  Refuses (typed RtError, verb `explain`) models whose predict path cannot score an
   *  arbitrary matrix in a continuous output space (e.g. hard class labels). */
  explain(request: ExplainRequest, opts?: ExplainOptions): Promise<ExplainResponse>;
  /** Several explanations (and optionally the model-intrinsic profiles) in one engine
   *  job: items run in order, each failure is reported per item, never aborting the
   *  others. Progress carries the running item. */
  explainBatch(request: ExplainBatchRequest, opts?: ExplainBatchOptions): Promise<ExplainBatchResponse>;
  /** Model-intrinsic importance profiles (coefficients, VIP, selectivity ratio, latent
   *  weights) in model-input and raw-input space, computed by Methods. */
  importance(request: ImportanceRequest): Promise<ImportanceResponse>;
  /** Aggregate profiles onto one grouping and compare them (Spearman, top-K overlap). */
  compareProfiles(request: CompareProfilesRequest): Promise<CompareProfilesResponse>;
  /** The perturbed rows the explainer sends to the model for one coalition (baseline preview). */
  baselinePreview(request: BaselinePreviewRequest): Promise<BaselinePreviewResponse>;
}

// ---------------------------------------------------------------------------
// Explain (model-agnostic attributions of the complete fitted pipeline)
// ---------------------------------------------------------------------------
// Numerics are owned by the Methods explain session (`explainModel`); the web
// engine only feeds it the existing predict dispatch and wraps its result in the
// `nirs4all.explanation.v1` envelope.
/** `linear_shap` is exact for an affine pipeline (raw-space coefficients from Methods);
 *  `gradient` is a first-order local attribution (central finite differences). */
export type ExplainMethod = 'permutation_shap' | 'kernel_shap' | 'exact_shap' | 'lime' | 'occlusion' | 'gradient' | 'linear_shap';
export type ExplainBaseline = 'background' | 'interpolate' | 'mean';
/** An axis-unit range to explain as one group (e.g. a reference absorption band). */
export interface ExplainAxisRange {
  label: string;
  /** first and last axis coordinate covered (inclusive), in the request axis unit */
  axisStart: number;
  axisEnd: number;
}
export type ExplainGrouping =
  /** one group per feature (only for nFeatures <= 64) */
  | { kind: 'per_feature' }
  /** contiguous fixed-width groups of `width` features (the last may be shorter) */
  | { kind: 'fixed_width'; width: number }
  /** axis ranges (needs a known axis unit) mapped to disjoint feature ranges;
   *  uncovered runs become remainder groups */
  | { kind: 'ranges'; ranges: ExplainAxisRange[]; source?: string };
/** Where the explained / background rows come from. */
export type ExplainRowSource = 'predicted_rows' | 'dataset_test_partition' | 'dataset_train_partition' | 'dataset_rows';
export interface ExplainRows {
  /** row-major nRows x nFeatures, in the model input feature space */
  X: Float64Array;
  nRows: number;
  /** source-partition index of each row (length nRows); never an explained-row index */
  sourceIndices: number[];
  source: ExplainRowSource;
}
/** Recorded spectral axis of the explained features. `unit` null means unknown. */
export interface ExplainAxis {
  values: number[];
  unit: string | null;
}
export interface ExplainRequest {
  /** the same model reference predict uses */
  model: FittedPipeline;
  nFeatures: number;
  /** input column names in order (checked by predict exactly like a Predict file) */
  featureNames?: string[];
  /** candidate rows to explain; at most `maxRows` are subsampled deterministically by `seed` */
  rows: ExplainRows;
  /** background rows; subsampled deterministically to at most `maxBackground` */
  background: ExplainRows;
  method?: ExplainMethod;
  baseline?: ExplainBaseline;
  grouping?: ExplainGrouping;
  nPermutations?: number;
  seed?: number;
  /** default 20 */
  maxRows?: number;
  /** default 50 */
  maxBackground?: number;
  /** selected target column (multi-target models); default 0 */
  outputIndex?: number;
  /** display label of the explained output (target name) */
  outputLabel?: string;
  /** recorded axis metadata only; absent/unknown unit → `feature_index` */
  axis?: ExplainAxis | null;
}
export interface ExplainProgress {
  done: number;
  total: number;
}
export interface ExplainOptions {
  onProgress?: (p: ExplainProgress) => void;
  signal?: AbortSignal;
}
export type ExplanationGroupSource = 'per_feature' | 'fixed_width' | 'ranges' | 'remainder';
export interface ExplanationGroup {
  label: string;
  /** half-open feature index range [feature_start, feature_end) */
  feature_start: number;
  feature_end: number;
  /** first / last axis coordinate covered (inclusive) */
  axis_start: number;
  axis_end: number;
  source: ExplanationGroupSource;
}
/** The `nirs4all.explanation.v1` envelope (Methods docs/explain/explanation_v1.schema.json). */
export interface ExplanationV1 {
  schema: 'nirs4all.explanation.v1';
  kind: string;
  engine: { name: string; version: string; abi?: string };
  exactness: 'exact' | 'sampled' | 'surrogate' | 'perturbation';
  additive: boolean;
  group_aggregation: 'group_game' | 'sum_of_feature_values' | 'none';
  attribution_space: 'raw_input' | 'transformed_features';
  output: { index: number; label: string | null; space: 'target' | 'class_probability' | 'decision' };
  axis: { values: number[]; unit: string | null; kind: 'wavelength' | 'wavenumber' | 'feature_index' };
  feature_names: string[] | null;
  groups: ExplanationGroup[];
  /** `sample_indices[i]` is the source-partition index of explained row i */
  rows: { count: number; sample_indices: number[]; source?: ExplainRowSource };
  /** [row][group][output] */
  attributions: number[][][];
  std_error: number[][][] | null;
  /** [row][output] */
  expected_value: number[][];
  prediction: number[][];
  additivity_max_abs_error: number | null;
  settings: Record<string, number | string | boolean | null>;
  /** per-group over explained rows, for `output_index` (Methods summarizeAttributions);
   *  `mean_signed_std_error` is the Monte-Carlo standard error of `mean_signed` (sampled methods) */
  summary: { output_index: number; mean_abs: number[]; mean_signed: number[]; mean_signed_std_error?: number[] | null };
}
export interface ExplainResponse {
  envelope: ExplanationV1;
  /** raw values of the explained rows (row-major count x nFeatures), for display only */
  explainedX: Float64Array;
  /** model rows evaluated by the explainer */
  evaluations: number;
  /** `gradient` only: the mean local raw-space coefficient profile */
  profile?: ImportanceProfileV1;
  /** wall-clock milliseconds of the explanation (UI time estimates) */
  elapsedMs?: number;
}

export interface ExplainBatchRequest {
  /** explanations sharing rows/background/grouping, run in order */
  explanations: ExplainRequest[];
  /** model-intrinsic profiles, computed first when present */
  importance?: ImportanceRequest | null;
}
export interface ExplainBatchProgress extends ExplainProgress {
  /** index into `explanations` of the running item; -1 for the intrinsic profiles */
  item: number;
}
export interface ExplainBatchOptions {
  onProgress?: (p: ExplainBatchProgress) => void;
  signal?: AbortSignal;
}
export type BatchItemResult<T> = { ok: true; result: T } | { ok: false; error: string; capability?: string };
export interface ExplainBatchResponse {
  importance: BatchItemResult<ImportanceResponse> | null;
  explanations: BatchItemResult<ExplainResponse>[];
}

// ---------------------------------------------------------------------------
// Model-intrinsic importances (`nirs4all.importance_profile.v1`)
// ---------------------------------------------------------------------------
export type ImportanceKind =
  | 'regression_coefficients'
  | 'standardized_coefficients'
  | 'vip'
  | 'selectivity_ratio'
  | 'x_weights'
  | 'x_loadings'
  | 'mean_local_gradient';
export type ImportanceSpace = 'model_input' | 'raw_input';
/** A global importance profile (Methods docs/explain/importance_profile_v1.schema.json). */
export interface ImportanceProfileV1 {
  schema: 'nirs4all.importance_profile.v1';
  kind: ImportanceKind;
  scope: 'global';
  space: ImportanceSpace;
  /** `exact`: a property of the fitted model; `local_mean`: mean of per-row local gradients */
  exactness: 'exact' | 'local_mean';
  signed: boolean;
  /** latent component (0-based) for x_weights / x_loadings */
  component: number | null;
  output: { index: number; label: string | null; space: 'target' };
  axis: { values: number[]; unit: string | null; kind: 'wavelength' | 'wavenumber' | 'feature_index' | 'model_feature' };
  values: number[];
  /** rows the profile was computed on (VIP, SR, standardization, gradient) */
  rows: { count: number; source: string } | null;
  model: { method_id: string; n_components: number | null };
  preprocessing: { steps: string[]; affine: boolean; column_aligned: boolean };
  engine: { name: string; version: string; abi?: string };
  settings: Record<string, number | string | boolean | null>;
}
export interface ImportanceRequest {
  model: FittedPipeline;
  nFeatures: number;
  featureNames?: string[];
  /** rows (raw input space) the model-space statistics use: normally the training partition */
  statRows: ExplainRows;
  outputIndex?: number;
  outputLabel?: string;
  axis?: ExplainAxis | null;
  /** latent components to report weights/loadings for (default: all, at most 10) */
  maxComponents?: number;
}
export interface ImportancePipelineStep {
  type: string;
  affine: boolean;
  columnAligned: boolean;
}
export interface ImportanceRefusal {
  kind: ImportanceKind | 'linear_shap';
  space: ImportanceSpace;
  reason: string;
}
export interface ImportanceResponse {
  profiles: ImportanceProfileV1[];
  pipeline: {
    steps: ImportancePipelineStep[];
    /** every transform is affine: raw-space coefficients are exact */
    affine: boolean;
    /** every transform keeps column j at spectral position j: model-space profiles share the raw axis */
    columnAligned: boolean;
    firstNonAffineStep: string | null;
  };
  /** what could not be computed, and why (shown to the user) */
  refusals: ImportanceRefusal[];
}

/** One profile to compare: group values (an explanation summary on the shared grouping)
 *  or feature values aggregated onto it by Methods with `rule`. */
export interface CompareProfileInput {
  id: string;
  label: string;
  resolution: 'group' | 'feature';
  values: number[];
  rule?: 'sum' | 'mean' | 'sum_abs' | 'mean_abs' | 'max_abs';
}
export interface CompareProfilesRequest {
  nFeatures: number;
  grouping: ExplainGrouping;
  axis?: ExplainAxis | null;
  profiles: CompareProfileInput[];
  topK?: number;
}
export interface CompareProfilesResponse {
  groups: ExplanationGroup[];
  /** [profile][group], in request order */
  aggregated: number[][];
  spearman: (number | null)[][];
  topKJaccard: (number | null)[][];
  topK: number;
}
export interface BaselinePreviewRequest {
  /** one raw row (nFeatures) */
  row: Float64Array;
  nFeatures: number;
  background: ExplainRows;
  maxBackground?: number;
  seed?: number;
  grouping: ExplainGrouping;
  axis?: ExplainAxis | null;
  absentGroups: number[];
  baseline: ExplainBaseline;
}
export interface BaselinePreviewResponse {
  groups: ExplanationGroup[];
  /** row-major perturbed rows (one, or one per background row for `background`) */
  rows: Float64Array;
  nRows: number;
}
