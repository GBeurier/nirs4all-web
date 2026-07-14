import type { RobustnessMode } from "./summary.js";
export declare const ROBUSTNESS_MODES: readonly ["clean_frozen", "matched_recalibration", "structural_refit"];
export declare const ROBUSTNESS_EXECUTABLE_MODES: readonly ["clean_frozen"];
export type RobustnessExecutableMode = typeof ROBUSTNESS_EXECUTABLE_MODES[number];
export interface RobustnessModeOption {
    disabled: boolean;
    executable: boolean;
    label: string;
    value: RobustnessMode;
}
export declare function isRobustnessMode(value: unknown): value is RobustnessMode;
export declare function isRobustnessExecutableMode(value: unknown): value is RobustnessExecutableMode;
export declare function getRobustnessModeOptions(): RobustnessModeOption[];
export declare function getRobustnessModeOptionsFromRegistry(registry: unknown): RobustnessModeOption[];
//# sourceMappingURL=modes.d.ts.map