export interface NativeResultReport {
  variant_id?: string;
  partition: string;
  fold_id?: string | null;
  level?: string;
  metrics: Record<string, number>;
  isWinner: boolean;
  [key: string]: unknown;
}

export interface NativePredictionRow {
  variant_id: string;
  partition: string;
  fold_id: string;
  sample_indices: number[];
  sample_ids: string[] | null;
  y_true: number[];
  y_pred: number[];
  y_proba: number[];
  y_true_shape: number[];
  y_pred_shape: number[];
  y_proba_shape: number[];
  [key: string]: unknown;
}

export interface ExperimentResult {
  /** Hash-checked native JSON projection; JavaScript does not decode Parquet. */
  readonly validationLevel: 'hashed_native_projection';
  /** Closes the JSON prediction projection over the model; Parquet is hash checked. */
  readonly modelPredictionClosure: boolean;
  /** These transport labels are outside the signed scientific prediction contract. */
  readonly unattestedDisplayFields: readonly string[];
  readonly runId: string;
  readonly winnerVariantId: string;
  readonly variantIds: readonly string[];
  readonly selectionMetric: string | null;
  compare(query?: { variantId?: string; partition?: string }): NativeResultReport[];
  predictions(query?: { variantId?: string; partition?: string; foldId?: string }): NativePredictionRow[];
  predictMethods(dataset: unknown, options?: { methods?: unknown }): Promise<unknown>;
}

/** Reopen the fixed experiment inventory from host-provided member bytes. */
export function openExperiment(
  indexBytes: Uint8Array,
  members: Record<string, Uint8Array>,
): Promise<ExperimentResult>;

export interface TrainingResultView {
  readonly runId: string;
  readonly winnerVariantId: string;
  readonly variantIds: readonly string[];
  readonly selectionMetric: string | null;
  readonly validationLevel: 'training_outcome_projection';
  readonly unattestedDisplayFields: readonly string[];
  summary(): Record<string, unknown>;
  compare(query?: { variantId?: string; partition?: string }): NativeResultReport[];
  predictions(query?: { variantId?: string; partition?: string; foldId?: string }): NativePredictionRow[];
}

/** Project an outcome already validated by native workflow execution/loading. */
export function trainingResultView(outcome: Record<string, unknown>, inputSampleIds?: readonly string[]): TrainingResultView;
