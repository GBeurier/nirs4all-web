import { formatMetricValue } from "../score/index.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isNullableString(value) {
    return value === null || typeof value === "string";
}
function isNumberArray(value) {
    return Array.isArray(value) && value.every(isFiniteNumber);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isSha256Fingerprint(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function isOptionalString(value) {
    return value === undefined || typeof value === "string";
}
export function isCalibrationReplaySource(value) {
    return (isRecord(value)
        && typeof value.dataset_backed === "boolean"
        && typeof value.kind === "string"
        && isOptionalString(value.predictor_bundle)
        && isOptionalString(value.predictor_chain_id)
        && isOptionalString(value.predictor_fingerprint)
        && isOptionalString(value.predictor_type)
        && typeof value.requires_model_replay === "boolean"
        && typeof value.route === "string"
        && value.version === 1
        && isOptionalString(value.workspace_path));
}
export function isTuningCalibrationSource(value) {
    return (isRecord(value)
        && typeof value.score_data_role === "string"
        && typeof value.score_data_used === "boolean"
        && typeof value.source === "string");
}
export function isConformalGuaranteeStatus(value) {
    return (isRecord(value)
        && typeof value.artifact_fingerprint === "string"
        && isNumberArray(value.calibrated_coverages)
        && typeof value.calibration_data_fingerprint === "string"
        && (value.calibration_replay_source === undefined || isCalibrationReplaySource(value.calibration_replay_source))
        && isNumberArray(value.coverage)
        && typeof value.effective_engine === "string"
        && typeof value.guarantee === "string"
        && isStringArray(value.invalidation_reasons)
        && isStringArray(value.limitations)
        && typeof value.method === "string"
        && typeof value.multi_target === "string"
        && isNullableString(value.predictor_fingerprint)
        && typeof value.requested_engine === "string"
        && typeof value.scope === "string"
        && isNullableString(value.source_calibrated_result_fingerprint)
        && (value.status === "active" || value.status === "invalidated")
        && typeof value.unit === "string"
        && value.version === 1);
}
export function isConformalIntervalRecord(value) {
    return (isRecord(value)
        && isFiniteNumber(value.coverage)
        && isNumberArray(value.lower)
        && isFiniteNumber(value.qhat)
        && isNumberArray(value.upper)
        && value.lower.length === value.upper.length);
}
export function isCalibratedPredictionBlock(value) {
    if (!isRecord(value)
        || !Array.isArray(value.intervals)
        || !value.intervals.every(isConformalIntervalRecord)
        || typeof value.method !== "string"
        || typeof value.unit !== "string"
        || !isNumberArray(value.y_pred)) {
        return false;
    }
    const yPred = value.y_pred;
    return value.intervals.every((interval) => interval.lower.length === yPred.length);
}
export function isCalibratedRunResultArtifact(value) {
    return (isRecord(value)
        && isRecord(value.artifact)
        && (value.fingerprint === undefined || typeof value.fingerprint === "string")
        && isRecord(value.metadata)
        && isCalibratedPredictionBlock(value.prediction)
        && isStringArray(value.sample_ids)
        && (value.sample_ids.length === 0 || value.sample_ids.length === value.prediction.y_pred.length)
        && value.version === 1);
}
export function isDagMlConformalPresentationV1(value) {
    if (!isRecord(value)
        || typeof value.binding_id !== "string"
        || value.binding_id.length === 0
        || !isSha256Fingerprint(value.calibration_fingerprint)
        || !Array.isArray(value.intervals)
        || !isSha256Fingerprint(value.package_fingerprint)
        || !isNumberArray(value.point_predictions)
        || !isSha256Fingerprint(value.presentation_fingerprint)
        || !isSha256Fingerprint(value.replay_outcome_fingerprint)
        || !isStringArray(value.sample_ids)
        || value.sample_ids.length !== value.point_predictions.length
        || value.sample_ids.some((sampleId) => sampleId.length === 0)
        || new Set(value.sample_ids).size !== value.sample_ids.length
        || value.schema_version !== 1
        || typeof value.target_name !== "string"
        || value.target_name.length === 0) {
        return false;
    }
    const pointPredictions = value.point_predictions;
    const intervals = value.intervals;
    const seenCoverages = new Set();
    return intervals.every((interval) => {
        if (!isRecord(interval)
            || !isFiniteNumber(interval.coverage)
            || interval.coverage <= 0
            || interval.coverage >= 1
            || seenCoverages.has(interval.coverage)
            || !Array.isArray(interval.lower)
            || !Array.isArray(interval.upper)
            || interval.lower.length !== pointPredictions.length
            || interval.upper.length !== pointPredictions.length
            || !(interval.qhat === null || isFiniteNumber(interval.qhat))) {
            return false;
        }
        const lowerBounds = interval.lower;
        const upperBounds = interval.upper;
        seenCoverages.add(interval.coverage);
        return lowerBounds.every((lower, index) => {
            const upper = upperBounds[index];
            const point = pointPredictions[index];
            if (lower === null || upper === null)
                return lower === null && upper === null;
            return isFiniteNumber(point) && isFiniteNumber(lower) && isFiniteNumber(upper) && lower <= point && point <= upper;
        });
    });
}
export function isConformalMetricSet(value) {
    return (isRecord(value)
        && isFiniteNumber(value.coverage)
        && isFiniteNumber(value.coverage_gap)
        && (value.fingerprint === undefined || typeof value.fingerprint === "string")
        && isFiniteNumber(value.mean_interval_score)
        && isFiniteNumber(value.mean_width)
        && isFiniteNumber(value.median_width)
        && Number.isInteger(value.n_covered)
        && typeof value.n_covered === "number"
        && Number.isInteger(value.n_missed_above)
        && typeof value.n_missed_above === "number"
        && Number.isInteger(value.n_missed_below)
        && typeof value.n_missed_below === "number"
        && Number.isInteger(value.n_samples)
        && typeof value.n_samples === "number"
        && value.n_samples > 0
        && value.n_covered >= 0
        && value.n_missed_above >= 0
        && value.n_missed_below >= 0
        && value.n_covered + value.n_missed_above + value.n_missed_below === value.n_samples
        && isFiniteNumber(value.observed_coverage)
        && typeof value.unit === "string"
        && value.version === 1);
}
export function parseCalibratedRunResultArtifact(value) {
    if (!isCalibratedRunResultArtifact(value)) {
        throw new TypeError("Expected a nirs4all CalibratedRunResult.to_dict() payload.");
    }
    return value;
}
/** Parse the closed, DAG-ML-owned conformal presentation wire contract. */
export function parseDagMlConformalPresentationV1(value) {
    if (!isDagMlConformalPresentationV1(value)) {
        throw new TypeError("Expected a validated DAG-ML conformal presentation v1 payload.");
    }
    return value;
}
export function parseConformalMetricSet(value) {
    if (!isConformalMetricSet(value)) {
        throw new TypeError("Expected a nirs4all ConformalMetricSet.to_dict() payload.");
    }
    return value;
}
export function getConformalGuaranteeStatus(artifact) {
    const status = artifact.metadata.conformal_guarantee_status;
    return isConformalGuaranteeStatus(status) ? status : null;
}
export function getCalibrationReplaySource(artifact) {
    const statusSource = getConformalGuaranteeStatus(artifact)?.calibration_replay_source;
    if (statusSource !== undefined)
        return statusSource;
    const metadataSource = artifact.metadata.calibration_replay_source;
    return isCalibrationReplaySource(metadataSource) ? metadataSource : null;
}
export function getTuningCalibrationSource(artifact) {
    const metadataSource = artifact.metadata.tuning_calibration_source;
    return isTuningCalibrationSource(metadataSource) ? metadataSource : null;
}
export function formatConformalCoverage(coverage) {
    if (coverage >= 0 && coverage <= 1) {
        const percent = coverage * 100;
        return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
    }
    return String(coverage);
}
export function formatCalibrationReplaySource(source) {
    if (source === null || source === undefined)
        return "unknown replay source";
    const labels = {
        dataset_predictor: "dataset predictor",
        dataset_predictor_bundle: "dataset predictor bundle",
        dataset_predictor_chain_id: "dataset workspace chain",
        dataset_predictor_result: "dataset predictor result",
        dataset_y_pred: "dataset provided predictions",
        explicit_replayed_arrays: "provided arrays",
        predict_result: "PredictResult",
        replayed_arrays: "provided arrays",
        tuple_replayed_arrays: "tuple provided arrays",
    };
    const label = labels[source.kind] ?? source.kind.replace(/_/g, " ");
    return source.dataset_backed ? `${label} via ${source.route}` : label;
}
export function formatTuningCalibrationSource(source) {
    if (source === null || source === undefined)
        return "unknown tuning calibration source";
    if (source.source === "tuning.winner" && source.score_data_used === false) {
        return "tuning winner; score_data ranked trials only";
    }
    const role = source.score_data_role ? `; score_data=${source.score_data_role}` : "";
    return `${source.source}${role}`;
}
export function createConformalGuaranteeView(status, tuningCalibrationSource = null) {
    const tuningSource = tuningCalibrationSource ?? null;
    if (status === null || status === undefined) {
        return {
            calibrationReplayLabel: "unknown replay source",
            calibrationReplaySource: null,
            coverageLabel: "—",
            effectiveEngine: "unknown",
            invalidationReasons: [],
            label: "No conformal guarantee metadata",
            limitations: [],
            method: "unknown",
            requestedEngine: "unknown",
            scope: "unknown",
            status: "unknown",
            tone: "muted",
            tuningCalibrationLabel: formatTuningCalibrationSource(tuningSource),
            tuningCalibrationSource: tuningSource,
            unit: "unknown",
        };
    }
    const calibrationReplaySource = status.calibration_replay_source ?? null;
    return {
        calibrationReplayLabel: formatCalibrationReplaySource(calibrationReplaySource),
        calibrationReplaySource,
        coverageLabel: status.coverage.map(formatConformalCoverage).join(", "),
        effectiveEngine: status.effective_engine,
        invalidationReasons: status.invalidation_reasons,
        label: status.status === "active" ? "Active conformal guarantee" : "Invalidated conformal guarantee",
        limitations: status.limitations,
        method: status.method,
        requestedEngine: status.requested_engine,
        scope: status.scope,
        status: status.status,
        tone: status.status === "active" ? "success" : "error",
        tuningCalibrationLabel: formatTuningCalibrationSource(tuningSource),
        tuningCalibrationSource: tuningSource,
        unit: status.unit,
    };
}
export function createConformalGuaranteeViewForArtifact(artifact) {
    const status = getConformalGuaranteeStatus(artifact);
    const tuningCalibrationSource = getTuningCalibrationSource(artifact);
    const view = createConformalGuaranteeView(status, tuningCalibrationSource);
    const calibrationReplaySource = getCalibrationReplaySource(artifact);
    if (calibrationReplaySource === null) {
        return view;
    }
    return {
        ...view,
        calibrationReplayLabel: formatCalibrationReplaySource(calibrationReplaySource),
        calibrationReplaySource,
    };
}
export function createConformalIntervalSummaryRows(artifact) {
    return [...artifact.prediction.intervals]
        .sort((left, right) => left.coverage - right.coverage)
        .map((interval) => {
        const widths = interval.upper.map((upper, index) => upper - (interval.lower[index] ?? upper));
        const meanWidth = widths.length === 0
            ? null
            : widths.reduce((total, width) => total + width, 0) / widths.length;
        return {
            coverage: interval.coverage,
            coverageLabel: formatConformalCoverage(interval.coverage),
            meanWidth,
            meanWidthLabel: meanWidth === null ? "—" : formatMetricValue(meanWidth),
            nSamples: interval.lower.length,
            qhat: interval.qhat,
            qhatLabel: formatMetricValue(interval.qhat),
        };
    });
}
export function createConformalPredictionRows(artifact) {
    const intervals = [...artifact.prediction.intervals].sort((left, right) => left.coverage - right.coverage);
    return artifact.prediction.y_pred.map((yPred, index) => ({
        index,
        intervals: intervals.map((interval) => {
            const lower = interval.lower[index] ?? yPred;
            const upper = interval.upper[index] ?? yPred;
            const width = upper - lower;
            return {
                coverage: interval.coverage,
                coverageLabel: formatConformalCoverage(interval.coverage),
                lower,
                lowerLabel: formatMetricValue(lower),
                upper,
                upperLabel: formatMetricValue(upper),
                width,
                widthLabel: formatMetricValue(width),
            };
        }),
        sampleId: artifact.sample_ids[index] ?? null,
        yPred,
        yPredLabel: formatMetricValue(yPred),
    }));
}
/**
 * Attach already-materialized DAG-ML intervals to their exact prediction
 * identities.  This conversion is intentionally lossless: it preserves the
 * producer's sample and interval ordering and refuses an unbounded cell that
 * the current table view cannot truthfully render.
 */
export function createConformalPredictionRowsFromDagMlPresentation(presentation) {
    const finiteIntervals = presentation.intervals.map((interval) => {
        if (interval.qhat === null || interval.lower.some(value => value === null) || interval.upper.some(value => value === null)) {
            throw new TypeError("DAG-ML conformal presentation contains an unbounded interval that this table view cannot render.");
        }
        return interval;
    });
    return presentation.point_predictions.map((yPred, index) => ({
        index,
        intervals: finiteIntervals.map((interval) => {
            const lower = interval.lower[index];
            const upper = interval.upper[index];
            if (lower === undefined || upper === undefined) {
                throw new TypeError("DAG-ML conformal presentation interval cardinality does not match point predictions.");
            }
            const width = upper - lower;
            return {
                coverage: interval.coverage,
                coverageLabel: formatConformalCoverage(interval.coverage),
                lower,
                lowerLabel: formatMetricValue(lower),
                upper,
                upperLabel: formatMetricValue(upper),
                width,
                widthLabel: formatMetricValue(width),
            };
        }),
        sampleId: presentation.sample_ids[index] ?? null,
        yPred,
        yPredLabel: formatMetricValue(yPred),
    }));
}
function uniqueSortedCoverages(coverages) {
    return [...new Set(coverages)].sort((left, right) => left - right);
}
export function createConformalCoverageOptions(artifact) {
    const status = getConformalGuaranteeStatus(artifact);
    const materializedCoverages = new Set(artifact.prediction.intervals.map((interval) => interval.coverage));
    const calibratedCoverages = new Set(status?.calibrated_coverages ?? []);
    const selectedCoverages = new Set(status?.coverage ?? []);
    return uniqueSortedCoverages([
        ...materializedCoverages,
        ...calibratedCoverages,
        ...selectedCoverages,
    ]).map((coverage) => {
        const materialized = materializedCoverages.has(coverage);
        return {
            calibrated: calibratedCoverages.has(coverage),
            coverage,
            disabled: !materialized,
            label: formatConformalCoverage(coverage),
            materialized,
            selected: selectedCoverages.has(coverage),
        };
    });
}
function coverageStripTone(option) {
    if (option.selected)
        return "selected";
    if (option.materialized)
        return "materialized";
    if (option.calibrated)
        return "calibrated";
    return "unavailable";
}
export function createConformalCoverageStrip(options, intervals = []) {
    const intervalByCoverage = new Map(intervals.map(interval => [interval.coverage, interval]));
    const finiteUnitCoverages = options
        .map(option => option.coverage)
        .filter(coverage => Number.isFinite(coverage) && coverage >= 0 && coverage <= 1);
    const minCoverage = finiteUnitCoverages.length > 0 ? Math.min(...finiteUnitCoverages) : 0;
    const maxCoverage = finiteUnitCoverages.length > 0 ? Math.max(...finiteUnitCoverages) : 1;
    const span = maxCoverage - minCoverage;
    const denominator = Math.max(options.length - 1, 1);
    return options.map((option, index) => {
        const interval = intervalByCoverage.get(option.coverage);
        const positionPercent = Number.isFinite(option.coverage) && option.coverage >= 0 && option.coverage <= 1 && span > 0
            ? ((option.coverage - minCoverage) / span) * 100
            : (index / denominator) * 100;
        return {
            calibrated: option.calibrated,
            coverage: option.coverage,
            coverageLabel: option.label,
            materialized: option.materialized,
            meanWidthLabel: interval?.meanWidthLabel ?? null,
            positionPercent,
            qhatLabel: interval?.qhatLabel ?? null,
            selected: option.selected,
            tone: coverageStripTone(option),
        };
    });
}
function conformalMetricGapDirection(metric) {
    if (metric.coverage_gap < 0)
        return "under";
    if (metric.coverage_gap > 0)
        return "over";
    return "exact";
}
export function createConformalMetricRow(metric) {
    return {
        coverage: metric.coverage,
        coverageGap: metric.coverage_gap,
        coverageGapLabel: formatMetricValue(metric.coverage_gap),
        coverageLabel: formatConformalCoverage(metric.coverage),
        meanIntervalScore: metric.mean_interval_score,
        meanIntervalScoreLabel: formatMetricValue(metric.mean_interval_score),
        meanWidth: metric.mean_width,
        meanWidthLabel: formatMetricValue(metric.mean_width),
        medianWidth: metric.median_width,
        medianWidthLabel: formatMetricValue(metric.median_width),
        missedAbove: metric.n_missed_above,
        missedBelow: metric.n_missed_below,
        nCovered: metric.n_covered,
        nSamples: metric.n_samples,
        observedCoverage: metric.observed_coverage,
        observedCoverageLabel: formatConformalCoverage(metric.observed_coverage),
        coverageGapDirection: conformalMetricGapDirection(metric),
        unit: metric.unit,
    };
}
export function createConformalMetricRows(metrics) {
    return [...metrics]
        .sort((left, right) => left.coverage - right.coverage)
        .map(createConformalMetricRow);
}
//# sourceMappingURL=result.js.map