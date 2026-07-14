export const TUNING_ORDERED_SEARCH_SPACE_FORMAT = "nirs4all.tuning.ordered_search_space";
export const TUNING_ORDERED_SEARCH_SPACE_SCHEMA_VERSION = 1;
export const TUNING_ORDERED_SEARCH_SPACE_SCHEMA_ID = "https://nirs4all.org/schemas/tuning-ordered-search-space/v1";
function isRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}
function isFingerprint(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
export function isJsonNativeValue(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return true;
    if (typeof value === "number")
        return Number.isFinite(value);
    if (Array.isArray(value))
        return value.every(isJsonNativeValue);
    if (!isRecord(value))
        return false;
    return Object.values(value).every(isJsonNativeValue);
}
function isSegmentsForPath(segments, path) {
    return (Array.isArray(segments)
        && segments.length > 0
        && segments.every(isNonEmptyString)
        && segments.join(".") === path);
}
export function isTuningSearchSpaceParameter(value) {
    return (isRecord(value)
        && Number.isInteger(value.index)
        && typeof value.index === "number"
        && value.index >= 0
        && isNonEmptyString(value.path)
        && isSegmentsForPath(value.segments, value.path)
        && isJsonNativeValue(value.spec));
}
export function isTuningParameterPatch(value) {
    return (isRecord(value)
        && isNonEmptyString(value.path)
        && isSegmentsForPath(value.segments, value.path)
        && isJsonNativeValue(value.value));
}
function hasUniquePaths(values) {
    const paths = values.map((value) => value.path);
    return paths.length === new Set(paths).size;
}
function hasOrderedIndexes(parameters) {
    return parameters.every((parameter, position) => parameter.index === position);
}
function forceParamsAreSubset(parameters, forceParams) {
    const parameterPaths = new Set(parameters.map((parameter) => parameter.path));
    return forceParams.every((patch) => parameterPaths.has(patch.path));
}
export function isOrderedTuningSearchSpaceArtifact(value) {
    if (!isRecord(value)
        || value.format !== TUNING_ORDERED_SEARCH_SPACE_FORMAT
        || value.schema_version !== TUNING_ORDERED_SEARCH_SPACE_SCHEMA_VERSION
        || !isFingerprint(value.fingerprint)
        || !isFingerprint(value.tuning_fingerprint)
        || !Array.isArray(value.parameters)
        || !Array.isArray(value.force_params)
        || !value.parameters.every(isTuningSearchSpaceParameter)
        || !value.force_params.every(isTuningParameterPatch)) {
        return false;
    }
    return (hasOrderedIndexes(value.parameters)
        && hasUniquePaths(value.parameters)
        && hasUniquePaths(value.force_params)
        && forceParamsAreSubset(value.parameters, value.force_params));
}
export function parseOrderedTuningSearchSpaceArtifact(value) {
    if (isOrderedTuningSearchSpaceArtifact(value))
        return value;
    throw new TypeError("Expected a nirs4all.tuning.ordered_search_space payload.");
}
export function formatTuningSearchSpaceValue(value) {
    if (value === null)
        return "null";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    return JSON.stringify(value);
}
export function createTuningSearchSpacePreview(artifact) {
    const forcedValues = new Map(artifact.force_params.map((patch) => [patch.path, patch.value]));
    const parameters = artifact.parameters.map((parameter) => {
        const forced = forcedValues.has(parameter.path);
        const forcedValue = forced ? forcedValues.get(parameter.path) : null;
        return {
            forced,
            forcedValue,
            forcedValueLabel: forced ? formatTuningSearchSpaceValue(forcedValue) : null,
            index: parameter.index,
            path: parameter.path,
            segments: parameter.segments,
            spec: parameter.spec,
            specLabel: formatTuningSearchSpaceValue(parameter.spec),
        };
    });
    return {
        fingerprint: artifact.fingerprint,
        forceParamCount: artifact.force_params.length,
        forceParams: artifact.force_params,
        format: artifact.format,
        parameterCount: artifact.parameters.length,
        parameters,
        schemaId: TUNING_ORDERED_SEARCH_SPACE_SCHEMA_ID,
        schemaVersion: artifact.schema_version,
        tuningFingerprint: artifact.tuning_fingerprint,
    };
}
//# sourceMappingURL=searchSpace.js.map