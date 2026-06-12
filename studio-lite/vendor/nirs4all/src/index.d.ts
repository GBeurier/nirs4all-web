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

export const formats: UpstreamProxy;
export const io: UpstreamProxy;
export const datasets: UpstreamProxy;
export const methods: UpstreamProxy;
export const dagMl: UpstreamProxy;
export const dagMlData: UpstreamProxy;

export function loadPipelineDefinition(source: string | unknown[] | Record<string, unknown>): PipelineDefinition;
export function portableClassNames(definition: PipelineDefinition | unknown[] | Record<string, unknown>): string[];
