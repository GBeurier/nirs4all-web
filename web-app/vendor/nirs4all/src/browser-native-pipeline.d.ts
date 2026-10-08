/** JSON transport shape; native IO validates the complete dataset contract. */
export interface BrowserNativeDatasetRecord {
  schema: 'nirs4all.dataset.v1' | 'nirs4all.dataset.v2';
  schema_version: 1 | 2;
  dataset: {
    schema: 'nirs4all.multimodal-dataset';
    schema_version: 1;
    name: string;
    sample_ids: string[];
    sources: object[];
    y: object | null;
    groups: object | null;
    partitions: object;
    target_names?: string[];
    task_type?: 'regression' | 'classification' | null;
    source_alignment?: 'strict' | 'left';
    target_mask?: object | null;
    independent_unit_ids?: string[];
    repetition_ids?: string[];
  };
  origin_ids: string[];
  fold_ids: (string | null)[];
}
export interface BrowserNativeStep { method_id: string; role: 'transformer' | 'selector' | 'regressor' | 'classifier'; params?: Record<string, unknown>; }
export interface BrowserNativeRecipe { steps: BrowserNativeStep[]; candidates: Record<string, unknown>[]; }
export interface BrowserNativePipelineOptions { pipeline: BrowserNativeRecipe; sourceId?: string; seed?: number; folds?: number; runId?: string; dagMl?: unknown; methods?: unknown; io?: unknown; estimatorAdapter?: unknown; }
export declare class BrowserNativePipeline {
  readonly config: { source_id: string; pipeline: BrowserNativeRecipe };
  readonly outcome: Record<string, unknown>;
  export(): string;
  predict(value: BrowserNativeDatasetRecord, options?: Partial<BrowserNativePipelineOptions>): Promise<Record<string, unknown>>;
  retrain(value: BrowserNativeDatasetRecord, options?: Partial<BrowserNativePipelineOptions>): Promise<BrowserNativePipeline>;
  compare(query?: Record<string, unknown>): unknown;
}
export declare function runBrowserPipeline(value: BrowserNativeDatasetRecord, options: BrowserNativePipelineOptions): Promise<BrowserNativePipeline>;
export declare function loadBrowserPipeline(text: string, options?: Partial<BrowserNativePipelineOptions>): Promise<BrowserNativePipeline>;
export declare function predictBrowserPipeline(model: BrowserNativePipeline, value: BrowserNativeDatasetRecord, options?: Partial<BrowserNativePipelineOptions>): Promise<Record<string, unknown>>;
