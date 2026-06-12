export interface Upstream {
  key: 'dag_ml' | 'dag_ml_data' | 'formats' | 'io' | 'datasets' | 'methods';
  candidates: readonly string[];
  role: string;
}

export interface UpstreamProxy {
  key: Upstream['key'];
  import(): Promise<unknown>;
}

export interface PipelineDefinition {
  name: string;
  description: string;
  random_state?: number;
  pipeline: unknown[];
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
  type: 'PLSRegression';
  n_components: number;
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
  preprocessing: { type: string; params: number[] }[];
  variants: PortableVariantResult[];
  selected: PortableVariantResult;
  model: PortablePlsModel;
  targets: number[];
}

export interface PortablePredictionResult {
  data: number[];
  rows: number;
  cols: number;
}

export const upstreams: readonly Upstream[];
export const portableOperatorClasses: readonly string[];

export function upstream(name: string): Upstream | null;
export function importUpstream(name: string): Promise<unknown>;
export function loadFormats(): Promise<unknown>;
export function loadIo(): Promise<unknown>;
export function loadDatasets(): Promise<unknown>;
export function loadMethods(): Promise<unknown>;
export function loadDagMl(): Promise<unknown>;
export function loadDagMlData(): Promise<unknown>;
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

export function loadPipelineDefinition(source: string | unknown[] | Record<string, unknown>): PipelineDefinition;
export function portableClassNames(definition: PipelineDefinition | unknown[] | Record<string, unknown>): string[];
export function parseExecutionPlan(source: string | PipelineDefinition | unknown[] | Record<string, unknown>): {
  splitter: { type: 'KennardStone'; params: Record<string, unknown> } | null;
  preprocessing: { type: 'StandardNormalVariate' | 'SavitzkyGolay'; params: number[] }[];
  nComponents: number[];
};
export function runPortablePipeline(
  source: string | PipelineDefinition | unknown[] | Record<string, unknown>,
  dataset: PortableMatrixDataset,
  options?: { methods?: unknown },
): Promise<PortableExecutionResult>;
export function predictPortablePipeline(
  fitted: PortableExecutionResult | { preprocessing?: { type: string; params: number[] }[]; model?: PortablePlsModel },
  dataset: Omit<PortableMatrixDataset, 'y'>,
  options?: { methods?: unknown },
): Promise<PortablePredictionResult>;
