import type { WorkflowOptions } from './workflow.js';
export interface BrowserTuneOptions extends Omit<WorkflowOptions, 'components' | 'preprocessing'> {
  trials?: number; sampler?: 'random' | 'tpe' | 'sobol' | 'lhs'; metric?: 'rmse' | 'mae' | 'r2';
  checkpoint?: BrowserTuningResult | Record<string, unknown>;
  /** Atomically store the paired native checkpoint and N4MOPT bytes before returning. */
  persist?: (snapshot: Record<string, unknown>) => void;
  storageKey?: string;
}
export class BrowserTuningResult {
  readonly packageJson: string;
  readonly search: Record<string, unknown>;
  readonly snapshot: Record<string, unknown>;
  readonly config: Record<string, unknown>;
  trials(): Record<string, unknown>[];
  compare(query?: { trialIndex?: number; partition?: string; foldId?: string; level?: string }): Record<string, unknown>[];
  summary(): Record<string, unknown>;
  resume(data: unknown, options: BrowserTuneOptions): Promise<BrowserTuningResult>;
  predict(data: unknown, options?: BrowserTuneOptions): Promise<Record<string, unknown>>;
  export(options?: BrowserTuneOptions): Promise<Record<string, unknown>>;
}
/** Native Methods WASM optimizer + native DAG scheduler and initial full-refit package. */
export function tuneBrowser(data: unknown, options: BrowserTuneOptions): Promise<BrowserTuningResult>;
export function loadBrowserTuning(record: unknown, options?: BrowserTuneOptions): Promise<BrowserTuningResult>;
