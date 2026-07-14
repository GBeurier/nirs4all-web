import { formatMetricValue } from "../score/index.js";
export const TUNING_SUMMARY_FORMAT = "nirs4all.tuning.summary";
export const TUNING_SUMMARY_SCHEMA_VERSION = 1;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isTuningEngine(value) {
    return value === "optuna" || value === "n4m";
}
function isTuningDirection(value) {
    return value === "minimize" || value === "maximize";
}
function isNullableString(value) {
    return value === null || typeof value === "string";
}
function isNullableInteger(value) {
    return value === null || (Number.isInteger(value) && typeof value === "number");
}
export function isDagMLTuningSpec(value) {
    return (isRecord(value)
        && isTuningDirection(value.direction)
        && isTuningEngine(value.engine)
        && typeof value.metric === "string"
        && value.metric.length > 0
        && Number.isInteger(value.n_trials)
        && typeof value.n_trials === "number"
        && value.n_trials > 0
        && isNullableString(value.pruner)
        && typeof value.resume === "boolean"
        && isNullableString(value.sampler)
        && isNullableInteger(value.seed)
        && isRecord(value.space)
        && isNullableString(value.storage)
        && isNullableString(value.study_name));
}
export function isTuningTrialResult(value) {
    return (isRecord(value)
        && isRecord(value.diagnostics)
        && Number.isInteger(value.number)
        && typeof value.number === "number"
        && isRecord(value.params)
        && typeof value.state === "string"
        && value.state.length > 0
        && (value.value === null || isFiniteNumber(value.value)));
}
export function isTuningSummaryTrial(value) {
    return (isRecord(value)
        && Number.isInteger(value.number)
        && typeof value.number === "number"
        && value.number >= 0
        && (value.diagnostics === undefined || isRecord(value.diagnostics))
        && typeof value.state === "string"
        && value.state.length > 0
        && (value.value === null || isFiniteNumber(value.value)));
}
export function isTuningSummaryPersistence(value) {
    return (isRecord(value)
        && typeof value.optimizer_state_resume_supported === "boolean"
        && typeof value.resume === "boolean"
        && typeof value.storage_configured === "boolean"
        && isNullableString(value.study_name));
}
export function isTuningResultArtifact(value) {
    return (isRecord(value)
        && isRecord(value.best_params)
        && isFiniteNumber(value.best_value)
        && (value.fingerprint === undefined || typeof value.fingerprint === "string")
        && typeof value.optimizer === "string"
        && value.optimizer.length > 0
        && Array.isArray(value.trials)
        && value.trials.every(isTuningTrialResult)
        && isDagMLTuningSpec(value.tuning));
}
function isTrialStates(value) {
    return (isRecord(value)
        && Object.entries(value).every(([key, count]) => key.length > 0 && Number.isInteger(count) && typeof count === "number" && count >= 0));
}
export function isTuningSummaryArtifact(value) {
    return (isRecord(value)
        && isRecord(value.best_params)
        && isFiniteNumber(value.best_value)
        && isTuningDirection(value.direction)
        && isTuningEngine(value.engine)
        && typeof value.fingerprint === "string"
        && value.fingerprint.length > 0
        && value.format === TUNING_SUMMARY_FORMAT
        && typeof value.metric === "string"
        && value.metric.length > 0
        && Number.isInteger(value.n_trials)
        && typeof value.n_trials === "number"
        && value.n_trials >= 0
        && typeof value.optimizer === "string"
        && value.optimizer.length > 0
        && (value.persistence === undefined || isTuningSummaryPersistence(value.persistence))
        && (value.pruner === undefined || isNullableString(value.pruner))
        && (value.sampler === undefined || isNullableString(value.sampler))
        && value.schema_version === TUNING_SUMMARY_SCHEMA_VERSION
        && (value.seed === undefined || isNullableInteger(value.seed))
        && isTrialStates(value.trial_states)
        && Array.isArray(value.trials)
        && value.trials.every(isTuningSummaryTrial)
        && value.version === 1);
}
export function parseTuningResultArtifact(value) {
    if (!isTuningResultArtifact(value)) {
        throw new TypeError("Expected a nirs4all TuningResult.to_dict() payload.");
    }
    return value;
}
export function parseTuningSummaryArtifact(value) {
    if (!isTuningSummaryArtifact(value)) {
        throw new TypeError("Expected a nirs4all.tuning.summary payload.");
    }
    return value;
}
export function normalizeTuningTrialStatus(state) {
    const normalized = state?.trim().toUpperCase();
    if (normalized === "COMPLETE" || normalized === "COMPLETED")
        return "complete";
    if (normalized === "FAIL" || normalized === "FAILED")
        return "failed";
    if (normalized === "RUNNING")
        return "running";
    if (normalized === "PRUNED")
        return "pruned";
    if (normalized === "WAITING" || normalized === "PENDING" || normalized === "QUEUED")
        return "waiting";
    return "unknown";
}
export function getTuningTrialTone(status) {
    switch (status) {
        case "complete":
            return "success";
        case "failed":
            return "error";
        case "pruned":
            return "warning";
        case "running":
            return "info";
        case "waiting":
        case "unknown":
            return "muted";
    }
}
function labelStatus(status) {
    switch (status) {
        case "complete":
            return "Complete";
        case "failed":
            return "Failed";
        case "pruned":
            return "Pruned";
        case "running":
            return "Running";
        case "waiting":
            return "Waiting";
        case "unknown":
            return "Unknown";
    }
}
function isBestTrial(trial, artifact) {
    if (trial.value === null || trial.value !== artifact.best_value)
        return false;
    return Object.entries(artifact.best_params).every(([key, value]) => Object.is(trial.params[key], value));
}
function labelParams(params) {
    const entries = Object.entries(params);
    if (entries.length === 0)
        return "—";
    return entries
        .map(([key, value]) => `${key}=${formatParamValue(value)}`)
        .join(", ");
}
function formatParamValue(value) {
    if (value === null)
        return "null";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    return JSON.stringify(value);
}
export function createTuningStudySummary(artifact) {
    const statuses = artifact.trials.map((trial) => normalizeTuningTrialStatus(trial.state));
    return {
        bestParams: artifact.best_params,
        bestValue: artifact.best_value,
        bestValueLabel: formatMetricValue(artifact.best_value, artifact.tuning.metric),
        completeTrials: statuses.filter((status) => status === "complete").length,
        direction: artifact.tuning.direction,
        failedTrials: statuses.filter((status) => status === "failed").length,
        fingerprint: artifact.fingerprint ?? null,
        metric: artifact.tuning.metric,
        nTrials: artifact.trials.length,
        optimizer: artifact.optimizer,
        pruner: artifact.tuning.pruner,
        prunedTrials: statuses.filter((status) => status === "pruned").length,
        runningTrials: statuses.filter((status) => status === "running").length,
        sampler: artifact.tuning.sampler,
        searchSpaceSize: Object.keys(artifact.tuning.space).length,
        seed: artifact.tuning.seed,
        studyName: artifact.tuning.study_name,
    };
}
function trialStateCount(artifact, status) {
    return Object.entries(artifact.trial_states).reduce((total, [state, count]) => (normalizeTuningTrialStatus(state) === status ? total + count : total), 0);
}
export function createTuningSummaryCard(artifact) {
    const knownTrialCount = (trialStateCount(artifact, "complete")
        + trialStateCount(artifact, "failed")
        + trialStateCount(artifact, "pruned")
        + trialStateCount(artifact, "running")
        + trialStateCount(artifact, "waiting"));
    return {
        bestParams: artifact.best_params,
        bestValue: artifact.best_value,
        bestValueLabel: formatMetricValue(artifact.best_value, artifact.metric),
        completeTrials: trialStateCount(artifact, "complete"),
        direction: artifact.direction,
        engine: artifact.engine,
        failedTrials: trialStateCount(artifact, "failed"),
        fingerprint: artifact.fingerprint,
        metric: artifact.metric,
        nTrials: artifact.n_trials,
        optimizer: artifact.optimizer,
        optimizerStateResumeSupported: artifact.persistence?.optimizer_state_resume_supported ?? null,
        persistence: artifact.persistence ?? null,
        pruner: artifact.pruner ?? null,
        prunedTrials: trialStateCount(artifact, "pruned"),
        resume: artifact.persistence?.resume ?? null,
        runningTrials: trialStateCount(artifact, "running"),
        sampler: artifact.sampler ?? null,
        seed: artifact.seed ?? null,
        storageConfigured: artifact.persistence?.storage_configured ?? null,
        studyName: artifact.persistence?.study_name ?? null,
        unknownTrials: Math.max(0, artifact.n_trials - knownTrialCount),
    };
}
export function createTuningTrialRows(artifact) {
    return [...artifact.trials]
        .sort((left, right) => left.number - right.number)
        .map((trial) => {
        const status = normalizeTuningTrialStatus(trial.state);
        return {
            diagnostics: trial.diagnostics,
            isBest: isBestTrial(trial, artifact),
            number: trial.number,
            params: trial.params,
            paramsLabel: labelParams(trial.params),
            status,
            statusLabel: labelStatus(status),
            tone: getTuningTrialTone(status),
            value: trial.value,
            valueLabel: trial.value === null ? "—" : formatMetricValue(trial.value, artifact.tuning.metric),
        };
    });
}
export function createTuningSummaryTrialRows(artifact) {
    return [...artifact.trials]
        .sort((left, right) => left.number - right.number)
        .map((trial) => {
        const status = normalizeTuningTrialStatus(trial.state);
        return {
            diagnostics: trial.diagnostics ?? {},
            number: trial.number,
            status,
            statusLabel: labelStatus(status),
            tone: getTuningTrialTone(status),
            value: trial.value,
            valueLabel: trial.value === null ? "—" : formatMetricValue(trial.value, artifact.metric),
        };
    });
}
//# sourceMappingURL=result.js.map