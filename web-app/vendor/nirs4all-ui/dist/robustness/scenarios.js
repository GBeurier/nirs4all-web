import { getKeywordRegistryEntry, isKeywordRegistryDocument, } from "../keywordRegistry/index.js";
export const ROBUSTNESS_SCENARIO_KINDS = [
    "observed",
    "prediction_bias",
    "prediction_noise",
    "spectral_noise",
    "spectral_offset",
    "spectral_scale",
    "spectral_slope",
    "spectral_shift",
];
export const ROBUSTNESS_STOCHASTIC_SCENARIO_KINDS = [
    "prediction_noise",
    "spectral_noise",
];
export const ROBUSTNESS_SCENARIO_DISTRIBUTIONS = [
    "normal",
    "uniform",
];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function labelScenarioKind(kind) {
    return kind.replace(/_/g, " ");
}
export function isRobustnessScenarioKind(value) {
    return (typeof value === "string"
        && ROBUSTNESS_SCENARIO_KINDS.includes(value));
}
export function isRobustnessStochasticScenarioKind(value) {
    return (typeof value === "string"
        && ROBUSTNESS_STOCHASTIC_SCENARIO_KINDS.includes(value));
}
export function isRobustnessScenarioDistribution(value) {
    return (typeof value === "string"
        && ROBUSTNESS_SCENARIO_DISTRIBUTIONS.includes(value));
}
export function getRobustnessScenarioKindOptions() {
    return scenarioKindOptionsFromKinds(ROBUSTNESS_SCENARIO_KINDS);
}
function scenarioKindOptionsFromKinds(kinds) {
    return kinds.map((kind) => ({
        label: labelScenarioKind(kind),
        requiresExplicitPredictor: kind.startsWith("spectral_"),
        stochastic: isRobustnessStochasticScenarioKind(kind),
        value: kind,
    }));
}
function scenarioKindEnumFromRegistry(registry) {
    const entry = getKeywordRegistryEntry(registry, "robustness.scenarios");
    const valueSchema = entry?.value_schema;
    const items = isRecord(valueSchema?.items) ? valueSchema.items : undefined;
    const properties = isRecord(items?.properties) ? items.properties : undefined;
    const kind = isRecord(properties?.kind) ? properties.kind : undefined;
    return Array.isArray(kind?.enum) ? kind.enum : undefined;
}
function scenarioDistributionEnumFromRegistry(registry) {
    const entry = getKeywordRegistryEntry(registry, "robustness.scenarios");
    const valueSchema = entry?.value_schema;
    const items = isRecord(valueSchema?.items) ? valueSchema.items : undefined;
    const properties = isRecord(items?.properties) ? items.properties : undefined;
    const distribution = isRecord(properties?.distribution) ? properties.distribution : undefined;
    return Array.isArray(distribution?.enum) ? distribution.enum : undefined;
}
export function getRobustnessScenarioKindOptionsFromRegistry(registry) {
    if (!isKeywordRegistryDocument(registry))
        return getRobustnessScenarioKindOptions();
    const scenarioKinds = scenarioKindEnumFromRegistry(registry)
        ?.filter(isRobustnessScenarioKind);
    if (scenarioKinds === undefined || scenarioKinds.length === 0) {
        return getRobustnessScenarioKindOptions();
    }
    return scenarioKindOptionsFromKinds(scenarioKinds);
}
function scenarioDistributionOptionsFromDistributions(distributions, enabled) {
    return distributions.map((distribution) => ({
        disabled: !enabled,
        label: distribution,
        value: distribution,
    }));
}
export function getRobustnessScenarioDistributionOptions(kind) {
    const enabled = isRobustnessStochasticScenarioKind(kind);
    return scenarioDistributionOptionsFromDistributions(ROBUSTNESS_SCENARIO_DISTRIBUTIONS, enabled);
}
export function getRobustnessScenarioDistributionOptionsFromRegistry(registry, kind) {
    if (!isKeywordRegistryDocument(registry))
        return getRobustnessScenarioDistributionOptions(kind);
    const distributions = scenarioDistributionEnumFromRegistry(registry)
        ?.filter(isRobustnessScenarioDistribution);
    if (distributions === undefined || distributions.length === 0) {
        return getRobustnessScenarioDistributionOptions(kind);
    }
    return scenarioDistributionOptionsFromDistributions(distributions, isRobustnessStochasticScenarioKind(kind));
}
export function validateRobustnessScenarioDraft(value) {
    if (!isRecord(value)) {
        return [
            {
                code: "kind_required",
                message: "Robustness scenario must be an object with a supported kind.",
                path: "kind",
            },
        ];
    }
    const issues = [];
    const kind = value.kind;
    const distribution = value.distribution;
    if (kind === undefined || kind === null || kind === "") {
        issues.push({
            code: "kind_required",
            message: "Scenario kind is required.",
            path: "kind",
        });
    }
    else if (!isRobustnessScenarioKind(kind)) {
        issues.push({
            code: "kind_unsupported",
            message: `Unsupported robustness scenario kind: ${String(kind)}.`,
            path: "kind",
        });
    }
    if (value.severity !== undefined
        && (typeof value.severity !== "number" || !Number.isFinite(value.severity))) {
        issues.push({
            code: "severity_not_number",
            message: "Scenario severity must be a finite number when provided.",
            path: "severity",
        });
    }
    if (distribution !== undefined) {
        if (typeof distribution !== "string") {
            issues.push({
                code: "distribution_not_string",
                message: "Scenario distribution must be a string when provided.",
                path: "distribution",
            });
        }
        else if (!isRobustnessScenarioDistribution(distribution)) {
            issues.push({
                code: "distribution_unsupported",
                message: `Unsupported robustness scenario distribution: ${distribution}.`,
                path: "distribution",
            });
        }
        else if (!isRobustnessStochasticScenarioKind(kind)) {
            issues.push({
                code: "distribution_not_allowed",
                message: "Scenario distribution is accepted only for prediction_noise and spectral_noise.",
                path: "distribution",
            });
        }
    }
    return issues;
}
export function isValidRobustnessScenarioDraft(value) {
    return validateRobustnessScenarioDraft(value).length === 0;
}
//# sourceMappingURL=scenarios.js.map