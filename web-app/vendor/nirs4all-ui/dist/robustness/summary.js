import { createConformalGuaranteeView, isConformalGuaranteeStatus, } from "../conformal/index.js";
export const ROBUSTNESS_SUMMARY_FORMAT = "nirs4all.robustness.summary";
export const ROBUSTNESS_SUMMARY_SCHEMA_VERSION = 1;
export const ROBUSTNESS_COVERAGE_STATUS_LABELS = {
    ok: "Coverage OK",
    warning: "Coverage warning",
    critical: "Coverage critical",
    unknown: "Coverage unknown",
};
const ROBUSTNESS_MODES = [
    "clean_frozen",
    "matched_recalibration",
    "structural_refit",
];
const ROBUSTNESS_EXECUTION_SCOPES = [
    "baseline",
    "prediction_replay",
    "spectral_replay",
];
const ROBUSTNESS_DEGRADATION_HEATMAP_METRIC_LABELS = {
    coverage_gap: "Coverage gap",
    mae_delta: "MAE Δ",
    rmse_delta: "RMSE Δ",
};
const REQUIRED_NUMERIC_ROW_FIELDS = [
    "bias",
    "delta_bias",
    "delta_mae",
    "delta_max_abs_error",
    "delta_rmse",
    "mae",
    "max_abs_error",
    "rmse",
    "severity",
];
const REQUIRED_NULLABLE_NUMERIC_ROW_FIELDS = [
    "conformal_max_abs_coverage_gap",
    "conformal_mean_width_mean",
    "conformal_min_observed_coverage",
    "mae_ratio",
    "rmse_ratio",
    "worst_slice_value",
];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isNullableFiniteNumber(value) {
    return value === null || isFiniteNumber(value);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isRobustnessMode(value) {
    return typeof value === "string" && ROBUSTNESS_MODES.includes(value);
}
function isOptionalRobustnessExecutionScope(value) {
    return value === undefined || (typeof value === "string" && ROBUSTNESS_EXECUTION_SCOPES.includes(value));
}
function hasValidSummaryRowFields(row) {
    if (typeof row.scenario_label !== "string"
        || !Number.isInteger(row.scenario_index)
        || !Number.isInteger(row.n_samples)
        || !isRecord(row.scenario)
        || (row.worst_slice_key !== null && !isRecord(row.worst_slice_key))
        || (row.worst_slice_label !== null && typeof row.worst_slice_label !== "string")
        || typeof row.worst_slice_metric !== "string"
        || !isOptionalRobustnessExecutionScope(row.execution_scope)
        || (row.requires_spectral_replay !== undefined && typeof row.requires_spectral_replay !== "boolean")) {
        return false;
    }
    for (const field of REQUIRED_NUMERIC_ROW_FIELDS) {
        if (!isFiniteNumber(row[field]))
            return false;
    }
    for (const field of REQUIRED_NULLABLE_NUMERIC_ROW_FIELDS) {
        if (!isNullableFiniteNumber(row[field]))
            return false;
    }
    return true;
}
function isRobustnessSummaryRow(value) {
    return isRecord(value) && hasValidSummaryRowFields(value);
}
function isOptionalConformalGuaranteeStatus(value) {
    return value === undefined || value === null || isConformalGuaranteeStatus(value);
}
function isRobustnessSpectralReplaySource(value) {
    return value === "predictor" || value === "predictor_bundle";
}
function isOptionalRobustnessSpectralReplay(value) {
    if (value === undefined)
        return true;
    if (!isRecord(value))
        return false;
    if (!isRobustnessSpectralReplaySource(value.source)
        || typeof value.route !== "string"
        || value.route.trim().length === 0
        || typeof value.sample_ids_forwarded !== "boolean") {
        return false;
    }
    if (value.predictor_bundle !== undefined && typeof value.predictor_bundle !== "string")
        return false;
    if (value.all_predictions !== undefined && typeof value.all_predictions !== "boolean")
        return false;
    return true;
}
export function isRobustnessSummaryArtifact(value) {
    if (!isRecord(value))
        return false;
    return (value.format === ROBUSTNESS_SUMMARY_FORMAT
        && value.schema_version === ROBUSTNESS_SUMMARY_SCHEMA_VERSION
        && typeof value.fingerprint === "string"
        && value.fingerprint.trim().length > 0
        && isRobustnessMode(value.mode)
        && typeof value.report_version === "number"
        && Number.isInteger(value.report_version)
        && value.report_version >= 1
        && isStringArray(value.slice_by)
        && isOptionalConformalGuaranteeStatus(value.conformal_guarantee_status)
        && isOptionalRobustnessSpectralReplay(value.spectral_replay)
        && Array.isArray(value.summary)
        && value.summary.every(isRobustnessSummaryRow));
}
export function parseRobustnessSummaryArtifact(value) {
    if (isRobustnessSummaryArtifact(value))
        return value;
    throw new TypeError(`Expected ${ROBUSTNESS_SUMMARY_FORMAT} schema v${ROBUSTNESS_SUMMARY_SCHEMA_VERSION} artifact`);
}
export function getRobustnessCoverageStatus(row) {
    const minObserved = row.conformal_min_observed_coverage;
    const maxAbsGap = row.conformal_max_abs_coverage_gap;
    if (minObserved === null && maxAbsGap === null)
        return "unknown";
    if ((minObserved !== null && minObserved < 0.8)
        || (maxAbsGap !== null && maxAbsGap > 0.2)) {
        return "critical";
    }
    if ((minObserved !== null && minObserved < 0.9)
        || (maxAbsGap !== null && maxAbsGap > 0.1)) {
        return "warning";
    }
    return "ok";
}
export function createRobustnessSummaryCards(artifact) {
    return artifact.summary.map((row) => ({
        bias: row.bias,
        coverage: {
            maxAbsGap: row.conformal_max_abs_coverage_gap,
            meanWidth: row.conformal_mean_width_mean,
            minObserved: row.conformal_min_observed_coverage,
        },
        distribution: typeof row.scenario.distribution === "string" && row.scenario.distribution.trim().length > 0
            ? row.scenario.distribution
            : null,
        mae: row.mae,
        maeDelta: row.delta_mae,
        maxAbsError: row.max_abs_error,
        nSamples: row.n_samples,
        rmse: row.rmse,
        rmseDelta: row.delta_rmse,
        scenario: row.scenario,
        scenarioIndex: row.scenario_index,
        scenarioLabel: row.scenario_label,
        executionScope: row.execution_scope,
        requiresSpectralReplay: row.requires_spectral_replay,
        severity: row.severity,
        status: getRobustnessCoverageStatus(row),
        worstSlice: {
            key: row.worst_slice_key,
            label: row.worst_slice_label,
            metric: row.worst_slice_metric,
            value: row.worst_slice_value,
        },
    }));
}
export function getRobustnessDegradationTone(value) {
    if (value > 0)
        return "worse";
    if (value < 0)
        return "improved";
    return "unchanged";
}
export function formatSignedRobustnessSummaryMetric(value, digits = 3) {
    return `${value > 0 ? "+" : ""}${formatRobustnessSummaryMetric(value, digits)}`;
}
export function createRobustnessDegradationRows(cards) {
    return cards.map((card) => ({
        coverageStatus: card.status,
        coverageStatusLabel: ROBUSTNESS_COVERAGE_STATUS_LABELS[card.status],
        maeDelta: card.maeDelta,
        maeDeltaLabel: formatSignedRobustnessSummaryMetric(card.maeDelta),
        maeDeltaTone: getRobustnessDegradationTone(card.maeDelta),
        rmseDelta: card.rmseDelta,
        rmseDeltaLabel: formatSignedRobustnessSummaryMetric(card.rmseDelta),
        rmseDeltaTone: getRobustnessDegradationTone(card.rmseDelta),
        scenarioIndex: card.scenarioIndex,
        scenarioLabel: card.scenarioLabel,
        worstSliceLabel: card.worstSlice.label,
    }));
}
export function createRobustnessWorstSliceRows(cards) {
    return cards.map((card) => {
        const sliceLabel = card.worstSlice.label?.trim() ? card.worstSlice.label : null;
        const metric = card.worstSlice.metric.trim();
        return {
            available: sliceLabel !== null && metric.length > 0,
            metric,
            scenarioIndex: card.scenarioIndex,
            scenarioLabel: card.scenarioLabel,
            sliceKey: card.worstSlice.key,
            sliceLabel,
            value: card.worstSlice.value,
            valueLabel: formatRobustnessSummaryMetric(card.worstSlice.value),
        };
    });
}
function heatmapMetricValue(card, metric) {
    if (metric === "rmse_delta")
        return card.rmseDelta;
    if (metric === "mae_delta")
        return card.maeDelta;
    return card.coverage.maxAbsGap;
}
function heatmapMetricTone(value, metric) {
    if (value === null || !Number.isFinite(value))
        return "unknown";
    if (value === 0)
        return "unchanged";
    if (metric === "coverage_gap")
        return "worse";
    return getRobustnessDegradationTone(value);
}
export function createRobustnessDegradationHeatmap(cards, metrics = ["rmse_delta", "mae_delta", "coverage_gap"]) {
    const finiteValuesByMetric = new Map();
    for (const metric of metrics) {
        finiteValuesByMetric.set(metric, cards
            .map(card => heatmapMetricValue(card, metric))
            .filter((value) => value !== null && Number.isFinite(value)));
    }
    return cards.flatMap(card => metrics.map((metric) => {
        const value = heatmapMetricValue(card, metric);
        const maxAbsValue = Math.max(0, ...((finiteValuesByMetric.get(metric) ?? []).map(item => Math.abs(item))));
        const intensity = value === null || !Number.isFinite(value) || maxAbsValue === 0
            ? 0
            : Math.min(1, Math.abs(value) / maxAbsValue);
        return {
            intensity,
            metric,
            metricLabel: ROBUSTNESS_DEGRADATION_HEATMAP_METRIC_LABELS[metric],
            scenarioIndex: card.scenarioIndex,
            scenarioLabel: card.scenarioLabel,
            tone: heatmapMetricTone(value, metric),
            value,
            valueLabel: value === null || !Number.isFinite(value)
                ? "—"
                : metric === "coverage_gap"
                    ? formatRobustnessSummaryMetric(value)
                    : formatSignedRobustnessSummaryMetric(value),
        };
    }));
}
export function getRobustnessConformalGuaranteeStatus(artifact) {
    return artifact.conformal_guarantee_status ?? null;
}
export function getRobustnessSpectralReplay(artifact) {
    return artifact.spectral_replay ?? null;
}
export function createRobustnessGuaranteeView(artifact) {
    return createConformalGuaranteeView(getRobustnessConformalGuaranteeStatus(artifact));
}
export function formatRobustnessSummaryMetric(value, digits = 3) {
    if (value === null)
        return "—";
    if (!Number.isFinite(value))
        return "—";
    return value.toLocaleString("en", {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
    });
}
//# sourceMappingURL=summary.js.map