import { getKeywordRegistryEntry, isKeywordRegistryDocument, } from "../keywordRegistry/index.js";
export const ROBUSTNESS_MODES = [
    "clean_frozen",
    "matched_recalibration",
    "structural_refit",
];
export const ROBUSTNESS_EXECUTABLE_MODES = [
    "clean_frozen",
];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function labelRobustnessMode(mode) {
    return mode.replace(/_/g, " ");
}
export function isRobustnessMode(value) {
    return (typeof value === "string"
        && ROBUSTNESS_MODES.includes(value));
}
export function isRobustnessExecutableMode(value) {
    return (typeof value === "string"
        && ROBUSTNESS_EXECUTABLE_MODES.includes(value));
}
function modeOptionsFromModes(modes, executableModes) {
    return modes.map((mode) => {
        const executable = executableModes.includes(mode);
        return {
            disabled: !executable,
            executable,
            label: labelRobustnessMode(mode),
            value: mode,
        };
    });
}
export function getRobustnessModeOptions() {
    return modeOptionsFromModes(ROBUSTNESS_MODES, ROBUSTNESS_EXECUTABLE_MODES);
}
function modeEnumFromRegistry(registry) {
    const entry = getKeywordRegistryEntry(registry, "robustness.mode");
    const valueSchema = entry?.value_schema;
    return Array.isArray(valueSchema?.enum) ? valueSchema.enum : undefined;
}
function executableModeEnumFromRegistry(registry) {
    const entry = getKeywordRegistryEntry(registry, "robustness.mode");
    const valueSchema = entry?.value_schema;
    if (!isRecord(valueSchema))
        return undefined;
    const executableValues = valueSchema["x-executable-values"];
    return Array.isArray(executableValues) ? executableValues : undefined;
}
export function getRobustnessModeOptionsFromRegistry(registry) {
    if (!isKeywordRegistryDocument(registry))
        return getRobustnessModeOptions();
    const modes = modeEnumFromRegistry(registry)?.filter(isRobustnessMode);
    if (modes === undefined || modes.length === 0) {
        return getRobustnessModeOptions();
    }
    const executableModes = executableModeEnumFromRegistry(registry)
        ?.filter(isRobustnessMode);
    return modeOptionsFromModes(modes, executableModes !== undefined && executableModes.length > 0
        ? executableModes
        : ROBUSTNESS_EXECUTABLE_MODES);
}
//# sourceMappingURL=modes.js.map