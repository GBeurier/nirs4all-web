import { type ConformalGuaranteeStatus, type ConformalGuaranteeView } from "../conformal/index.js";
export type { ConformalGuaranteeStatus, ConformalGuaranteeView } from "../conformal/index.js";
export declare const ROBUSTNESS_SUMMARY_FORMAT: "nirs4all.robustness.summary";
export declare const ROBUSTNESS_SUMMARY_SCHEMA_VERSION: 1;
export type RobustnessMode = "clean_frozen" | "matched_recalibration" | "structural_refit";
export type RobustnessCoverageStatus = "ok" | "warning" | "critical" | "unknown";
export type RobustnessScenarioRecord = Record<string, unknown>;
export type RobustnessExecutionScope = "baseline" | "prediction_replay" | "spectral_replay";
export type RobustnessSpectralReplaySource = "predictor" | "predictor_bundle";
export interface RobustnessSpectralReplay {
    all_predictions?: boolean;
    predictor_bundle?: string;
    route: string;
    sample_ids_forwarded: boolean;
    source: RobustnessSpectralReplaySource;
}
export interface RobustnessSummaryRow {
    bias: number;
    conformal_max_abs_coverage_gap: number | null;
    conformal_mean_width_mean: number | null;
    conformal_min_observed_coverage: number | null;
    delta_bias: number;
    delta_mae: number;
    delta_max_abs_error: number;
    delta_rmse: number;
    execution_scope?: RobustnessExecutionScope;
    mae: number;
    mae_ratio: number | null;
    max_abs_error: number;
    n_samples: number;
    requires_spectral_replay?: boolean;
    rmse: number;
    rmse_ratio: number | null;
    scenario: RobustnessScenarioRecord;
    scenario_index: number;
    scenario_label: string;
    severity: number;
    worst_slice_key: RobustnessScenarioRecord | null;
    worst_slice_label: string | null;
    worst_slice_metric: string;
    worst_slice_value: number | null;
    [key: string]: unknown;
}
export interface RobustnessSummaryArtifact {
    conformal_guarantee_status?: ConformalGuaranteeStatus | null;
    fingerprint: string;
    format: typeof ROBUSTNESS_SUMMARY_FORMAT;
    mode: RobustnessMode;
    report_version: number;
    schema_version: typeof ROBUSTNESS_SUMMARY_SCHEMA_VERSION;
    slice_by: string[];
    spectral_replay?: RobustnessSpectralReplay;
    summary: RobustnessSummaryRow[];
}
export interface RobustnessSummaryCardCoverage {
    maxAbsGap: number | null;
    meanWidth: number | null;
    minObserved: number | null;
}
export interface RobustnessSummaryCardWorstSlice {
    key: RobustnessScenarioRecord | null;
    label: string | null;
    metric: string;
    value: number | null;
}
export interface RobustnessSummaryCard {
    bias: number;
    coverage: RobustnessSummaryCardCoverage;
    distribution: string | null;
    mae: number;
    maeDelta: number;
    maxAbsError: number;
    nSamples: number;
    rmse: number;
    rmseDelta: number;
    scenarioIndex: number;
    scenarioLabel: string;
    scenario: RobustnessScenarioRecord;
    executionScope?: RobustnessExecutionScope | undefined;
    requiresSpectralReplay?: boolean | undefined;
    severity: number;
    status: RobustnessCoverageStatus;
    worstSlice: RobustnessSummaryCardWorstSlice;
}
export type RobustnessDegradationTone = "improved" | "unchanged" | "worse";
export type RobustnessDegradationHeatmapMetric = "rmse_delta" | "mae_delta" | "coverage_gap";
export type RobustnessDegradationHeatmapTone = RobustnessDegradationTone | "unknown";
export interface RobustnessDegradationRow {
    coverageStatus: RobustnessCoverageStatus;
    coverageStatusLabel: string;
    maeDelta: number;
    maeDeltaLabel: string;
    maeDeltaTone: RobustnessDegradationTone;
    rmseDelta: number;
    rmseDeltaLabel: string;
    rmseDeltaTone: RobustnessDegradationTone;
    scenarioIndex: number;
    scenarioLabel: string;
    worstSliceLabel: string | null;
}
export interface RobustnessDegradationHeatmapCell {
    intensity: number;
    metric: RobustnessDegradationHeatmapMetric;
    metricLabel: string;
    scenarioIndex: number;
    scenarioLabel: string;
    tone: RobustnessDegradationHeatmapTone;
    value: number | null;
    valueLabel: string;
}
export interface RobustnessWorstSliceRow {
    available: boolean;
    metric: string;
    scenarioIndex: number;
    scenarioLabel: string;
    sliceKey: RobustnessScenarioRecord | null;
    sliceLabel: string | null;
    value: number | null;
    valueLabel: string;
}
export declare const ROBUSTNESS_COVERAGE_STATUS_LABELS: Record<RobustnessCoverageStatus, string>;
export declare function isRobustnessSummaryArtifact(value: unknown): value is RobustnessSummaryArtifact;
export declare function parseRobustnessSummaryArtifact(value: unknown): RobustnessSummaryArtifact;
export declare function getRobustnessCoverageStatus(row: Pick<RobustnessSummaryRow, "conformal_max_abs_coverage_gap" | "conformal_min_observed_coverage">): RobustnessCoverageStatus;
export declare function createRobustnessSummaryCards(artifact: RobustnessSummaryArtifact): RobustnessSummaryCard[];
export declare function getRobustnessDegradationTone(value: number): RobustnessDegradationTone;
export declare function formatSignedRobustnessSummaryMetric(value: number, digits?: number): string;
export declare function createRobustnessDegradationRows(cards: readonly RobustnessSummaryCard[]): RobustnessDegradationRow[];
export declare function createRobustnessWorstSliceRows(cards: readonly RobustnessSummaryCard[]): RobustnessWorstSliceRow[];
export declare function createRobustnessDegradationHeatmap(cards: readonly RobustnessSummaryCard[], metrics?: readonly RobustnessDegradationHeatmapMetric[]): RobustnessDegradationHeatmapCell[];
export declare function getRobustnessConformalGuaranteeStatus(artifact: RobustnessSummaryArtifact): ConformalGuaranteeStatus | null;
export declare function getRobustnessSpectralReplay(artifact: RobustnessSummaryArtifact): RobustnessSpectralReplay | null;
export declare function createRobustnessGuaranteeView(artifact: RobustnessSummaryArtifact): ConformalGuaranteeView;
export declare function formatRobustnessSummaryMetric(value: number | null, digits?: number): string;
//# sourceMappingURL=summary.d.ts.map