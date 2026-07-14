export type ConformalGuaranteeStatusValue = "active" | "invalidated" | "unknown";
export type ConformalGuaranteeTone = "success" | "error" | "muted";
export interface CalibrationReplaySource {
    dataset_backed: boolean;
    kind: string;
    predictor_bundle?: string;
    predictor_chain_id?: string;
    predictor_fingerprint?: string;
    predictor_type?: string;
    requires_model_replay: boolean;
    route: string;
    version: 1;
    workspace_path?: string;
}
export interface TuningCalibrationSource {
    score_data_role: string;
    score_data_used: boolean;
    source: string;
}
export interface ConformalGuaranteeStatus {
    artifact_fingerprint: string;
    calibrated_coverages: number[];
    calibration_data_fingerprint: string;
    calibration_replay_source?: CalibrationReplaySource;
    coverage: number[];
    effective_engine: string;
    guarantee: string;
    invalidation_reasons: string[];
    limitations: string[];
    method: string;
    multi_target: string;
    predictor_fingerprint: string | null;
    requested_engine: string;
    scope: string;
    source_calibrated_result_fingerprint: string | null;
    status: "active" | "invalidated";
    unit: string;
    version: 1;
}
export interface ConformalGuaranteeView {
    calibrationReplayLabel: string;
    calibrationReplaySource: CalibrationReplaySource | null;
    coverageLabel: string;
    effectiveEngine: string;
    invalidationReasons: string[];
    label: string;
    limitations: string[];
    method: string;
    requestedEngine: string;
    scope: string;
    status: ConformalGuaranteeStatusValue;
    tone: ConformalGuaranteeTone;
    tuningCalibrationLabel: string;
    tuningCalibrationSource: TuningCalibrationSource | null;
    unit: string;
}
export interface ConformalIntervalRecord {
    coverage: number;
    lower: number[];
    qhat: number;
    upper: number[];
}
export interface CalibratedPredictionBlock {
    intervals: ConformalIntervalRecord[];
    method: string;
    unit: string;
    y_pred: number[];
}
export interface CalibratedRunResultArtifact {
    artifact: Record<string, unknown>;
    fingerprint?: string;
    metadata: Record<string, unknown>;
    prediction: CalibratedPredictionBlock;
    sample_ids: string[];
    version: 1;
}
export interface ConformalIntervalSummaryRow {
    coverage: number;
    coverageLabel: string;
    meanWidth: number | null;
    meanWidthLabel: string;
    nSamples: number;
    qhat: number;
    qhatLabel: string;
}
export interface ConformalPredictionIntervalCell {
    coverage: number;
    coverageLabel: string;
    lower: number;
    lowerLabel: string;
    upper: number;
    upperLabel: string;
    width: number;
    widthLabel: string;
}
export interface ConformalPredictionRow {
    index: number;
    intervals: ConformalPredictionIntervalCell[];
    sampleId: string | null;
    yPred: number;
    yPredLabel: string;
}
export interface ConformalCoverageOption {
    calibrated: boolean;
    coverage: number;
    disabled: boolean;
    label: string;
    materialized: boolean;
    selected: boolean;
}
export type ConformalCoverageStripTone = "selected" | "materialized" | "calibrated" | "unavailable";
export interface ConformalCoverageStripSegment {
    calibrated: boolean;
    coverage: number;
    coverageLabel: string;
    materialized: boolean;
    meanWidthLabel: string | null;
    positionPercent: number;
    qhatLabel: string | null;
    selected: boolean;
    tone: ConformalCoverageStripTone;
}
export interface ConformalMetricSet {
    coverage: number;
    coverage_gap: number;
    fingerprint?: string;
    mean_interval_score: number;
    mean_width: number;
    median_width: number;
    n_covered: number;
    n_missed_above: number;
    n_missed_below: number;
    n_samples: number;
    observed_coverage: number;
    unit: string;
    version: 1;
}
export interface ConformalMetricRow {
    coverage: number;
    coverageGap: number;
    coverageGapLabel: string;
    coverageLabel: string;
    meanIntervalScore: number;
    meanIntervalScoreLabel: string;
    meanWidth: number;
    meanWidthLabel: string;
    medianWidth: number;
    medianWidthLabel: string;
    missedAbove: number;
    missedBelow: number;
    nCovered: number;
    nSamples: number;
    observedCoverage: number;
    observedCoverageLabel: string;
    coverageGapDirection: "under" | "over" | "exact";
    unit: string;
}
export declare function isCalibrationReplaySource(value: unknown): value is CalibrationReplaySource;
export declare function isTuningCalibrationSource(value: unknown): value is TuningCalibrationSource;
export declare function isConformalGuaranteeStatus(value: unknown): value is ConformalGuaranteeStatus;
export declare function isConformalIntervalRecord(value: unknown): value is ConformalIntervalRecord;
export declare function isCalibratedPredictionBlock(value: unknown): value is CalibratedPredictionBlock;
export declare function isCalibratedRunResultArtifact(value: unknown): value is CalibratedRunResultArtifact;
export declare function isConformalMetricSet(value: unknown): value is ConformalMetricSet;
export declare function parseCalibratedRunResultArtifact(value: unknown): CalibratedRunResultArtifact;
export declare function parseConformalMetricSet(value: unknown): ConformalMetricSet;
export declare function getConformalGuaranteeStatus(artifact: CalibratedRunResultArtifact): ConformalGuaranteeStatus | null;
export declare function getCalibrationReplaySource(artifact: CalibratedRunResultArtifact): CalibrationReplaySource | null;
export declare function getTuningCalibrationSource(artifact: CalibratedRunResultArtifact): TuningCalibrationSource | null;
export declare function formatConformalCoverage(coverage: number): string;
export declare function formatCalibrationReplaySource(source: CalibrationReplaySource | null | undefined): string;
export declare function formatTuningCalibrationSource(source: TuningCalibrationSource | null | undefined): string;
export declare function createConformalGuaranteeView(status: ConformalGuaranteeStatus | null | undefined, tuningCalibrationSource?: TuningCalibrationSource | null | undefined): ConformalGuaranteeView;
export declare function createConformalGuaranteeViewForArtifact(artifact: CalibratedRunResultArtifact): ConformalGuaranteeView;
export declare function createConformalIntervalSummaryRows(artifact: CalibratedRunResultArtifact): ConformalIntervalSummaryRow[];
export declare function createConformalPredictionRows(artifact: CalibratedRunResultArtifact): ConformalPredictionRow[];
export declare function createConformalCoverageOptions(artifact: CalibratedRunResultArtifact): ConformalCoverageOption[];
export declare function createConformalCoverageStrip(options: readonly ConformalCoverageOption[], intervals?: readonly ConformalIntervalSummaryRow[]): ConformalCoverageStripSegment[];
export declare function createConformalMetricRow(metric: ConformalMetricSet): ConformalMetricRow;
export declare function createConformalMetricRows(metrics: readonly ConformalMetricSet[]): ConformalMetricRow[];
//# sourceMappingURL=result.d.ts.map