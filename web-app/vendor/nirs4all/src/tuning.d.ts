export type GenerationConstraints = {
  mutex?: { dimension: string; label: string }[][];
  requires?: [{ dimension: string; label: string }, { dimension: string; label: string }][];
  exclude?: [{ dimension: string; label: string }, { dimension: string; label: string }][];
};
export interface GenerateOptions { strategy?: 'cartesian' | 'zip' | 'random'; constraints?: GenerationConstraints; count?: number; seed?: number; maxVariants?: number; }
export function generate(choices: Record<string, unknown[]>, options?: GenerateOptions): Promise<Record<string, unknown>[]>;
export interface TuneOptions {
  trials?: number; seed?: number; sampler?: 'random' | 'tpe' | 'sobol' | 'lhs'; metric?: 'rmse' | 'mae' | 'r2';
  sourceId?: string; checkpoint?: string | NativeTuningResult; methodsLibrary: string; archive: string; runId?: string; cli?: string;
}
export class NativeTuningResult {
  constructor(archivePath: string, outcome: Record<string, unknown>, config: Record<string, unknown>, runtime?: Record<string, unknown>);
  readonly archivePath: string; readonly outcome: Record<string, unknown>;
  readonly config: Record<string, unknown>;
  resume(data: unknown, options: TuneOptions): Promise<NativeTuningResult>;
  trials(): Record<string, unknown>[];
  compare(query?: Record<string, unknown>): Record<string, unknown>[];
  predictions(query?: Record<string, unknown>): Record<string, unknown>[];
  predict(x: number[][], options?: { sampleIds?: string[]; methodsLibrary?: string; cli?: string }): Promise<Record<string, unknown>>;
  export(directory: string): Promise<string>;
}
/** Node frontend for the common native optimizer/checkpoint runtime. */
export function tune(data: unknown, options: TuneOptions): Promise<NativeTuningResult>;
export function loadTuning(directory: string, options?: { cli?: string; methodsLibrary?: string }): Promise<NativeTuningResult>;
