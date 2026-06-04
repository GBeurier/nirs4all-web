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
export interface PipelineStep {
  id: string; // unique instance id
  type: string; // node catalog `type` token (e.g. 'StandardNormalVariate', 'PLS')
  params: Record<string, unknown>;
}
export interface PipelineDSL {
  name: string;
  /** ordered preprocessing chain */
  steps: PipelineStep[];
  /** terminal estimator */
  model: PipelineStep;
  cv: { folds: number; seed: number };
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
  /** cross-validation aggregate over folds */
  cv: ScoreNode;
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
