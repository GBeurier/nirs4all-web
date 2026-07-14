export declare const ROBUSTNESS_SCENARIO_KINDS: readonly ["observed", "prediction_bias", "prediction_noise", "spectral_noise", "spectral_offset", "spectral_scale", "spectral_slope", "spectral_shift"];
export declare const ROBUSTNESS_STOCHASTIC_SCENARIO_KINDS: readonly ["prediction_noise", "spectral_noise"];
export declare const ROBUSTNESS_SCENARIO_DISTRIBUTIONS: readonly ["normal", "uniform"];
export type RobustnessScenarioKind = typeof ROBUSTNESS_SCENARIO_KINDS[number];
export type RobustnessStochasticScenarioKind = typeof ROBUSTNESS_STOCHASTIC_SCENARIO_KINDS[number];
export type RobustnessScenarioDistribution = typeof ROBUSTNESS_SCENARIO_DISTRIBUTIONS[number];
export interface RobustnessScenarioDraft {
    kind?: unknown;
    severity?: unknown;
    distribution?: unknown;
    [key: string]: unknown;
}
export interface RobustnessScenarioValidationIssue {
    code: "kind_required" | "kind_unsupported" | "severity_not_number" | "distribution_not_string" | "distribution_unsupported" | "distribution_not_allowed";
    message: string;
    path: string;
}
export interface RobustnessScenarioDistributionOption {
    disabled: boolean;
    label: string;
    value: RobustnessScenarioDistribution;
}
export interface RobustnessScenarioKindOption {
    label: string;
    requiresExplicitPredictor: boolean;
    stochastic: boolean;
    value: RobustnessScenarioKind;
}
export declare function isRobustnessScenarioKind(value: unknown): value is RobustnessScenarioKind;
export declare function isRobustnessStochasticScenarioKind(value: unknown): value is RobustnessStochasticScenarioKind;
export declare function isRobustnessScenarioDistribution(value: unknown): value is RobustnessScenarioDistribution;
export declare function getRobustnessScenarioKindOptions(): RobustnessScenarioKindOption[];
export declare function getRobustnessScenarioKindOptionsFromRegistry(registry: unknown): RobustnessScenarioKindOption[];
export declare function getRobustnessScenarioDistributionOptions(kind: unknown): RobustnessScenarioDistributionOption[];
export declare function getRobustnessScenarioDistributionOptionsFromRegistry(registry: unknown, kind: unknown): RobustnessScenarioDistributionOption[];
export declare function validateRobustnessScenarioDraft(value: unknown): RobustnessScenarioValidationIssue[];
export declare function isValidRobustnessScenarioDraft(value: unknown): value is RobustnessScenarioDraft;
//# sourceMappingURL=scenarios.d.ts.map