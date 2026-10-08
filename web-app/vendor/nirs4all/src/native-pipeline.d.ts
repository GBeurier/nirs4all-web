export interface NativePipelineStep { method_id: string; role: 'transformer' | 'selector' | 'regressor' | 'classifier'; params?: Record<string, unknown>; }
export interface NativePipelineRecipe { steps: NativePipelineStep[]; candidates: Record<string, unknown>[]; }
export interface NativePipelineOptions { cli?: string; methodsLibrary?: string; sourceId?: string; runId?: string; io?: unknown; }
/** Node CPU host. Portable JSON contains native N4ME states; no .n4a claim. */
export class NativePipeline {
  readonly config: Record<string, unknown>;
  readonly outcome: Record<string, unknown>;
  toNativeJSON(): string;
  predict(X: number[][], options?: NativePipelineOptions & {sampleIds?: string[]}): Promise<unknown>;
  export(path: string): Promise<string>;
  retrain(data: unknown, options?: NativePipelineOptions): Promise<NativePipeline>;
  static load(nativeJson: string, options?: NativePipelineOptions): Promise<NativePipeline>;
}
export function runPipeline(data: unknown, pipeline: NativePipelineRecipe, options?: NativePipelineOptions): Promise<NativePipeline>;
