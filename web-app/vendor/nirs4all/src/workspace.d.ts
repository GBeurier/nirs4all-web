import type { NativePredictionRow, NativeResultReport } from './result-view.js';
export interface WorkspaceSnapshot {
  readonly validationLevel: 'hashed_sdk_snapshot_and_native_experiments';
  readonly sdkSchemaVersion: number;
  readonly closed: boolean;
  close(): void;
  runs(): Array<{ runId: string; sdkRunId: string; winnerVariantId: string; variantIds: string[] }>;
  compare(runId: string, query?: { variantId?: string; partition?: string }): NativeResultReport[];
  predictions(runId: string, query?: { variantId?: string; partition?: string; foldId?: string }): NativePredictionRow[];
  predictMethods(runId: string, data: unknown, options?: { methods?: unknown }): Promise<unknown>;
  export(): { indexBytes: Uint8Array; members: Record<string, Uint8Array> };
}
/** SQLite/Parquet bytes are hash checked; native experiments are semantically validated. */
export function openWorkspace(indexBytes: Uint8Array, members: Record<string, Uint8Array>): Promise<WorkspaceSnapshot>;
