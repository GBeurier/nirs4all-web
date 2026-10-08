export { runBrowserPipeline, loadBrowserPipeline, predictBrowserPipeline, BrowserNativePipeline } from './browser-native-pipeline.js';
export { openExperiment } from './result-view.js';
export type { ExperimentResult, NativePredictionRow, NativeResultReport } from './result-view.js';
export { Workflow, run, predict, retrain, exportWorkflow, load } from './workflow.js';
export type { WorkflowOptions, WorkflowExport, WorkflowPrediction, DagWorkflowReplayResult } from './workflow.js';

export interface Upstream {
  key: 'dag_ml' | 'dag_ml_data' | 'formats' | 'io' | 'datasets' | 'methods';
  candidates: readonly string[];
  role: string;
}

export interface UpstreamProxy {
  key: Upstream['key'];
  import(): Promise<unknown>;
}

export interface LocalImplementationRegistry {
  register_loss(lossReference: unknown, implementation: unknown): unknown;
  register_metric(metricReference: unknown, implementation: unknown): unknown;
  bind_training_loss(nodeTask: unknown, roleIndex?: number): unknown;
}

export interface LocalImplementationRegistryModule<T extends LocalImplementationRegistry = LocalImplementationRegistry> {
  LocalImplementationRegistry: new () => T;
}

export interface PipelineDefinition {
  name: string;
  description: string;
  random_state?: number;
  pipeline: unknown[];
}

export type RuntimeSurface = 'python' | 'javascript_wasm' | 'rust' | 'matlab_octave';
export type CapabilityLevel = 'metadata' | 'plan' | 'execute-local' | 'execute-remote' | 'parity-validated';

export interface RuntimeContract {
  surface: RuntimeSurface;
  pipelineExecution: CapabilityLevel;
  pipelineEntrypoint: string;
  serializedModelPredict: boolean;
  predictEntrypoint: string | null;
}

export interface ArtifactContract {
  id: 'conformal.calibrated_result' | 'robustness.summary' | 'tuning.summary' | 'tuning.ordered_search_space' | 'keyword.registry';
  schema: string;
  producer: 'full-python-nirs4all';
  consumerLevel: Readonly<Record<RuntimeSurface, 'metadata'>>;
  pythonSurface: string;
  portableClaim: 'not-exposed-in-nirs4all-core' | 'summary-json-contract-only' | 'search-space-json-contract-only' | 'registry-json-contract-only';
  optionalPayloadFields: readonly string[];
  publishedConstants?: Readonly<Record<string, readonly string[]>>;
  requiredRegistryEntries: readonly string[];
}

export interface ControllerCapability {
  id: string;
  kind: 'splitter' | 'transform' | 'model' | 'pipeline';
  domain: Upstream['key'];
  label: string;
  operatorClasses: readonly string[];
  ports: {
    inputs: readonly string[];
    outputs: readonly string[];
  };
  parameters: readonly string[];
  runtime: Readonly<Record<RuntimeSurface, CapabilityLevel>>;
  executionPath: 'portable_pipeline' | 'run_portable_pipeline';
  composes?: readonly string[];
}

export interface CapabilityManifest {
  schema: 'nirs4all-core.capabilities.v1';
  aggregate: 'nirs4all-core';
  runtimeSurfaces: readonly RuntimeSurface[];
  runtimeContracts: readonly RuntimeContract[];
  artifactContracts: readonly ArtifactContract[];
  portableOperatorClasses: readonly string[];
  controllers: readonly ControllerCapability[];
}

export interface PortableMatrixDataset {
  X: Float64Array | number[] | readonly number[] | readonly (readonly number[])[];
  y: Float64Array | number[] | readonly number[] | readonly (readonly number[])[];
  rows?: number;
  cols?: number;
  n_samples?: number;
  n_features?: number;
}

export interface PortableSplitResult {
  kind: 'all' | 'KennardStone';
  trainIndices: number[];
  testIndices: number[];
}

export interface PortableVariantResult {
  n_components: number;
  rmse: number;
  predictions: number[];
}

export interface PortablePlsModel {
  type: 'PLSRegression' | 'Ridge' | 'RidgePLS' | 'RobustPLS' | 'CPPLS' | 'SparseSIMPLS' | 'ECR' | 'ContinuumRegression' | 'MIRPLS' | 'FusedSparsePLS' | 'BaggingPLS' | 'BoostingPLS' | 'RandomSubspacePLS' | 'NPLS' | 'MBPLS' | 'GroupSparsePLS';
  n_components: number;
  params?: number[];
  coefficients: number[];
  xMean: number[];
  yMean: number[];
  intercept: number[] | null;
  n_features: number;
  n_targets: number;
}

export interface PortableExecutionResult {
  name: string;
  rows: number;
  cols: number;
  split: PortableSplitResult;
  preprocessing: PortablePreprocessingStep[];
  /** Training-only one-shot native X augmentation; never replayed at predict time. */
  train_augmentation?: { kind: string; values: number[]; seed: number };
  variants: PortableVariantResult[];
  selected: PortableVariantResult;
  model: PortablePlsModel;
  targets: number[];
  /** Present on current runs; older persisted results may omit this metadata. */
  evaluation?: {
    scope: 'training' | 'selection_validation';
    independent_test: false;
  };
}

export interface PortablePreprocessingStep {
  type: string;
  params: number[] | {
    method: string;
    n_components: number;
    method_params: Record<string, number | boolean | number[]>;
  };
  /** Fitted Methods state. Older stateless results may omit it. */
  state?: number[];
}

export interface PortablePredictionResult {
  data: number[];
  rows: number;
  cols: number;
}

export interface ArchiveV2ReplayDataset {
  X: Float64Array | readonly number[] | readonly (readonly number[])[];
  rows?: number;
  cols?: number;
  n_samples?: number;
  n_features?: number;
  sampleIds?: readonly string[];
  sample_ids?: readonly string[];
}

export interface JsEstimatorDataset {
  sampleIds: string[];
  X: Float64Array | number[] | number[][];
  y?: Float64Array | number[];
  cols?: number;
  n_features?: number;
}

export interface JsEstimator {
  fit?(X: number[][], y: number[]): unknown;
  train?(X: number[][], y: number[]): unknown;
  predict(X: number[][]): number[] | Float64Array | Promise<number[] | Float64Array>;
  toJSON?(): unknown;
}

export interface DagMlModelControllerModule {
  derive_controller_manifest_json(specJson: string): string;
  validate_controller_manifest_json(manifestJson: string): void;
}

export interface JsEstimatorControllerOptions {
  dagMl: DagMlModelControllerModule;
  controllerId: string;
  controllerVersion?: string;
  createEstimator(context: { params: Record<string, unknown>; seed: number; exactSeed: string | null }): JsEstimator;
  restoreEstimator?: (model: unknown) => JsEstimator;
  dataset: JsEstimatorDataset & { y: Float64Array | number[] };
  foldSet: {
    sample_ids: string[];
    folds: { fold_id: string; train_sample_ids: string[]; validation_sample_ids: string[] }[];
  };
  targetName?: string;
  operatorSelectors?: Record<string, unknown>[];
  paramsForTask?: (params: Record<string, unknown>) => Record<string, unknown>;
}

export interface AsyncJsEstimatorControllerOptions extends Omit<JsEstimatorControllerOptions, 'createEstimator' | 'restoreEstimator'> {
  createEstimator(context: { params: Record<string, unknown>; seed: number; exactSeed: string | null }): JsEstimator | Promise<JsEstimator>;
  restoreEstimator?: (model: unknown) => JsEstimator | Promise<JsEstimator>;
}

export interface AsyncJsEstimatorController {
  manifest: Record<string, unknown>;
  invokeAsync(controllerId: string, taskJson: string, exactSeed: string | null): Promise<string>;
  setPredictionDataset(dataset: JsEstimatorDataset): void;
  fitFull(params?: Record<string, unknown>, seed?: string): Promise<JsEstimator>;
  predict(dataset: JsEstimatorDataset): Promise<number[]>;
  exportModel(): Promise<unknown>;
  importModel(payload: unknown): Promise<void>;
}

export interface JsEstimatorController {
  manifest: Record<string, unknown>;
  invoke(controllerId: string, taskJson: string, exactSeed: string | null): string;
  setPredictionDataset(dataset: JsEstimatorDataset): void;
  fitFull(params?: Record<string, unknown>, seed?: string): JsEstimator;
  predict(dataset: JsEstimatorDataset): number[];
  exportModel(): {
    schema: 'nirs4all.js-estimator-model.v1';
    controllerId: string;
    controllerVersion: string;
    nFeatures: number;
    model: unknown;
  };
  exportModelAsync(): Promise<{
    schema: 'nirs4all.js-estimator-model.v1';
    controllerId: string;
    controllerVersion: string;
    nFeatures: number;
    model: unknown;
  }>;
  importModel(payload: unknown): void;
  importModelAsync(payload: unknown): Promise<void>;
}

export function createDagMlNodeResult(
  task: Record<string, unknown>,
  prediction?: { sampleIds: string[]; values: number[][]; targetNames: string[] } | null,
): Record<string, unknown>;
export function createDagMlModelManifest(options: {
  dagMl: DagMlModelControllerModule;
  controllerId: string;
  controllerVersion?: string;
  operatorSelectors?: Record<string, unknown>[];
  priority?: number;
  artifactPolicy?: 'host_only' | 'serializable' | 'content_addressed' | 'replay_required';
}): Record<string, unknown>;

export function createJsEstimatorController(options: JsEstimatorControllerOptions): JsEstimatorController;
/** Host async phase adapter; not accepted by DAG-ML's synchronous WASM callback. */
export function createAsyncJsEstimatorController(options: AsyncJsEstimatorControllerOptions): AsyncJsEstimatorController;
export function createN4mModelController(
  options: Omit<JsEstimatorControllerOptions, 'controllerId' | 'createEstimator' | 'restoreEstimator'> & {
    controllerId?: string;
    modelType: string;
    methods: {
      fitModel(modelType: string, X: { data: Float64Array; rows: number; cols: number },
        y: { data: Float64Array; rows: number; cols: number }, nComponents: number,
        params: number[]): unknown;
      predictModel(model: unknown, X: { data: Float64Array; rows: number; cols: number }):
        { data: Float64Array; rows: number; cols: number };
    };
  },
): JsEstimatorController;
export function createRandomForestController(
  options: Omit<JsEstimatorControllerOptions, 'controllerId' | 'createEstimator' | 'restoreEstimator'> & {
    controllerId?: string;
    task?: 'regression' | 'classification';
  },
): Promise<JsEstimatorController>;

export interface NativePredictorDescriptorV1 {
  descriptor_type: 'dagml.native_predictor_descriptor.v1';
  schema_version: 1;
  artifact_sha256: string;
  owner_controller: 'controller:methods.pls' | 'controller:methods.ridge';
  format: 'N4MM';
  format_version: 1 | 2;
  writer_abi: Readonly<{ major: number; minor: number; patch: number }>;
  storage_algorithm: number;
  capabilities: number;
  dimensions: Readonly<{
    training_samples: number;
    n_features: number;
    n_targets: number;
    n_components: number;
  }>;
  pipeline?: Readonly<{
    pipeline_type: 'n4m.snv_savgol_smooth.v1';
    schema_version: 1;
    operator_count: 2;
    raw_n_features: number;
    model_n_features: number;
    fingerprint_algorithm: 'fnv1a64.v1';
    native_fingerprint: string;
    savgol_window: number;
    savgol_poly_degree: number;
  }>;
  descriptor_fingerprint: string;
}

export interface ArchiveV2ReplayResult {
  schema: 'nirs4all.core.archive-v2-replay.v1';
  engine: 'nirs4all-methods-wasm';
  fallback: false;
  archiveId: string;
  archiveSha256: string;
  artifactId: string;
  bindingId: string;
  nodeId: string;
  portName: string;
  nativePredictorDescriptor: NativePredictorDescriptorV1;
  sampleIds: readonly string[];
  targetNames: readonly string[];
  data: readonly number[];
  rows: number;
  cols: number;
}

export const upstreams: readonly Upstream[];
export const portableOperatorClasses: readonly string[];
export const runtimeSurfaces: readonly RuntimeSurface[];
export const runtimeContracts: readonly RuntimeContract[];
export const requiredKeywordRegistryEntries: readonly string[];
export const artifactContracts: readonly ArtifactContract[];
export const controllerCapabilities: readonly ControllerCapability[];
export function capabilityManifest(): CapabilityManifest;

export function upstream(name: string): Upstream | null;
export function importUpstream(name: string): Promise<unknown>;
export function loadFormats(): Promise<unknown>;
export function loadIo(): Promise<unknown>;
export function loadDatasets(): Promise<unknown>;
export function loadMethods(): Promise<unknown>;
export function loadDagMl(): Promise<unknown>;
export function loadDagMlData(): Promise<unknown>;
export function localImplementationRegistry<T extends LocalImplementationRegistry = LocalImplementationRegistry>(
  dagMlModule?: LocalImplementationRegistryModule<T> | null,
): Promise<T>;
export function loadPortableStack(keys?: readonly string[]): Promise<Record<string, unknown>>;
export function loadMethodsWasm(): Promise<unknown>;
export function methodsWasm(): unknown;
export function loadDagMlWasm(): Promise<unknown>;
export function loadDagMlDataWasm(): Promise<unknown>;
export function loadDatasetsWasm(): Promise<unknown>;
export function loadDataIoWasm(): Promise<{ formats: unknown; io: unknown }>;

export const formats: UpstreamProxy;
export const io: UpstreamProxy;
export const datasets: UpstreamProxy;
export const methods: UpstreamProxy;
export const dagMl: UpstreamProxy;
export const dagMlData: UpstreamProxy;

export function loadPipelineDefinition(
  source: string | unknown[] | Record<string, unknown>,
  options?: { methods?: unknown },
): PipelineDefinition;
export function portableClassNames(definition: PipelineDefinition | unknown[] | Record<string, unknown>): string[];
export function parseExecutionPlan(source: string | PipelineDefinition | unknown[] | Record<string, unknown>): {
  splitter: { type: 'KennardStone'; params: Record<string, unknown> } | null;
  trainAugmentation: {
    kind: string;
    methodsKind: string;
    values: number[];
    seed: number;
  } | null;
  preprocessing: PortablePreprocessingStep[];
  nComponents: number[];
  modelType: PortablePlsModel['type'];
  modelParams: number[];
};
export function runPortablePipeline(
  source: string | PipelineDefinition | unknown[] | Record<string, unknown>,
  dataset: PortableMatrixDataset,
  options?: { methods?: unknown },
): Promise<PortableExecutionResult>;
export function predictPortablePipeline(
  fitted: PortableExecutionResult | { preprocessing?: PortablePreprocessingStep[]; model?: PortablePlsModel },
  dataset: Omit<PortableMatrixDataset, 'y'>,
  options?: { methods?: unknown },
): Promise<PortablePredictionResult>;
export function loadArchiveV2Native(): Promise<unknown>;
/** Native-validated storage only; DAG-ML owns package semantics and trust. */
export interface PortableArchiveV2Payloads {
  archiveId: string;
  archiveSha256: string;
  manifest: Record<string, unknown>;
  members: Readonly<Record<string, Uint8Array>>;
}
export function readPortableArchiveV2(
  archiveBytes: ArrayBuffer | ArrayBufferView,
): Promise<PortableArchiveV2Payloads>;
export function writePortableArchiveV2(
  manifest: Record<string, unknown>,
  members: Readonly<Record<string, ArrayBuffer | ArrayBufferView>>,
): Promise<Uint8Array>;
export function inspectMethodsArchiveV2Predictors(
  archiveBytes: ArrayBuffer | ArrayBufferView,
): Promise<readonly NativePredictorDescriptorV1[]>;
export function replayMethodsArchiveV2(
  archiveBytes: ArrayBuffer | ArrayBufferView,
  dataset: ArchiveV2ReplayDataset,
  options?: { methods?: unknown },
): Promise<ArchiveV2ReplayResult>;

/** Prefix of the language-neutral n4m role step token `n4m:<catalog method id>`. */
export const N4M_ROLE_PREFIX: 'n4m:';
/** Schema of the trained n4m role pipeline envelope shared with Python, R and Rust. */
export const N4M_TRAINED_PIPELINE_SCHEMA: 'nirs4all.n4m.trained_pipeline.v8';

/** A recipe step: `"n4m:<method id>"` or `{ class: "n4m:<method id>", params }`. */
export type N4mRoleStep = string | { class: string; params?: Record<string, unknown> };

export interface N4mRoleRecipe {
  pipeline: N4mRoleStep[];
}

export interface N4mRoleState {
  method_id: string;
  n4me_base64: string;
  sha256: string;
  /** The state embeds training rows (exported only with `allowTrainingRows`); absent in older envelopes. */
  contains_training_rows?: boolean;
  class_names?: (string | number)[];
}

export interface N4mTrainedPipelineEnvelope {
  schema: 'nirs4all.n4m.trained_pipeline.v8';
  recipe: N4mRoleRecipe;
  n_features: number;
  /** Fitted input column names, in order, when the fit had names. */
  feature_names?: string[];
  states: N4mRoleState[];
}

export interface N4mRoleDataset {
  X: Float64Array | number[] | readonly number[] | readonly (readonly number[])[];
  rows: number;
  cols: number;
  /** Column names: stored at fit, then renamed or reordered columns are refused. Without them, columns are positional. */
  featureNames?: string[];
}

export interface N4mRoleTrainingDataset extends N4mRoleDataset {
  /**
   * Responses of a final regressor (a vector, or one row of targets per sample) or labels of a
   * final classifier (integer ids, or names mapped in sorted order).
   */
  y: Float64Array | readonly number[] | readonly (readonly number[])[] | readonly (string | number)[];
}

export type N4mRolePrediction =
  | { data: number[]; rows: number; cols: number }
  | { labels: (string | number)[]; rows: number };

export interface N4mRoleCapability {
  token: string;
  methodId: string;
  roles: string[];
  nodeKinds: string[];
  parameters: string[];
}

/**
 * A fitted recipe of n4m role steps, portable as N4ME states. The recipe runs in the native
 * Methods role pipeline (ABI 2.14); this class reads and writes the envelope.
 */
export class N4mRolePipeline {
  readonly recipe: N4mRoleRecipe;
  readonly nFeatures: number;
  /** Fitted input column names, in order (undefined: positional input). */
  readonly featureNames: string[] | undefined;
  /** The fitted `@nirs4all/methods` RolePipeline (transform, decisionFunction, predictProba, stepsInfo). */
  readonly pipeline: unknown;
  static fit(recipe: N4mRoleRecipe, dataset: N4mRoleTrainingDataset, options?: { methods?: unknown }): Promise<N4mRolePipeline>;
  static fromJSON(source: string | N4mTrainedPipelineEnvelope, options?: { methods?: unknown }): Promise<N4mRolePipeline>;
  /** The envelope; a state embedding training rows is refused unless `allowTrainingRows` is set. */
  toJSON(options?: { allowTrainingRows?: boolean } | string): N4mTrainedPipelineEnvelope;
  predict(dataset: N4mRoleDataset): N4mRolePrediction;
  retrain(dataset: N4mRoleTrainingDataset, options?: { methods?: unknown }): Promise<N4mRolePipeline>;
  dispose(): void;
}

/** Methods estimators usable as role recipe steps, read from the Methods manifest. */
export function n4mRoleCapabilities(options?: { methods?: unknown }): Promise<N4mRoleCapability[]>;
export { dataset, MultimodalPredictor } from './multimodal.js';
export { generate, tune, NativeTuningResult, loadTuning } from './tuning.js';
export { tuneBrowser, loadBrowserTuning, BrowserTuningResult } from './browser-tuning.js';
export type { BrowserTuneOptions } from './browser-tuning.js';
export type { GenerateOptions, GenerationConstraints, TuneOptions } from './tuning.js';
export { CalibratedWorkflow, calibrate, predictCalibrated, conformalMetrics, exportCalibrated, loadCalibrated } from './conformal.js';
export type { PublicDatasetRecord, PublicDataset, MultimodalOptions, MultimodalPrediction } from './multimodal.js';

export { robustness } from './robustness.js';

export { predictMultimodalArchive } from './multimodal-archive.js';

export { openWorkspace } from './workspace.js';
export type { WorkspaceSnapshot } from './workspace.js';
export { NativePipeline, runPipeline } from "./native-pipeline.js";

export { NativeMultimodal, runMultimodal } from "./native-multimodal.js";

export type { NativePipelineStep, NativePipelineRecipe, NativePipelineOptions } from "./native-pipeline.js";
export type { NativeSourcePolicy } from "./native-multimodal.js";
export type { BrowserNativeDatasetRecord, BrowserNativeStep, BrowserNativeRecipe, BrowserNativePipelineOptions } from "./browser-native-pipeline.js";
