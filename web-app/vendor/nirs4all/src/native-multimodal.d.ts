import type {NativePipelineRecipe, NativePipelineOptions} from './native-pipeline.js';
export interface NativeSourcePolicy {
  source_id: string;
  encoder: 'identity' | 'ragged_summary';
  missing_policy: 'reject' | 'zero_with_indicator';
}
/** Native CPU profile: ordered IO sources, Methods encoders and per-target DAG models. */
export class NativeMultimodal {
  readonly config: Record<string, unknown>;
  readonly outcomes: Record<string, unknown>[];
  toNativeJSON(): string;
  predict(data: unknown, options?: NativePipelineOptions): Promise<unknown>;
  export(path: string): Promise<string>;
  retrain(data: unknown, options?: NativePipelineOptions): Promise<NativeMultimodal>;
  static load(nativeJson: string, options?: NativePipelineOptions): Promise<NativeMultimodal>;
}
export function runMultimodal(data: unknown, pipeline: NativePipelineRecipe,
  sourcePolicies: NativeSourcePolicy[], options?: NativePipelineOptions): Promise<NativeMultimodal>;
