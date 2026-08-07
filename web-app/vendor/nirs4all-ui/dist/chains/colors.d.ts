/**
 * Color mapping for the chain-effect explorer.
 *
 * Reuses the canonical nirs4all `viz` teal system as the single source of truth
 * (same hues as {@link file://../viz/PipelineFlow.tsx PipelineFlow} and the DAG
 * viewer), so the explorer sits inside the existing design language. Two color
 * jobs only:
 * - **role identity** → the categorical brand hues (small chips beside a text
 *   label, so identity is never color-alone);
 * - **effect polarity** → the brand diverging ramp pivoted on the analysis
 *   baseline (better = cool/blue, worse = warm/red, gray at the baseline). The
 *   diverging ramp is CVD-safe and every cell also prints its value.
 */
import type { ChainStepRole } from "./types.js";
export declare const CHAIN_ROLE_COLORS: Readonly<Record<ChainStepRole, string>>;
/** Resolve a role color, honoring per-host overrides. */
export declare function roleColor(role: ChainStepRole, overrides?: Partial<Record<ChainStepRole, string>>): string;
/**
 * Diverging color for a goodness value relative to the baseline.
 * `value > baseline` (better) → cool/blue; `value < baseline` (worse) → warm/red;
 * `≈ baseline` → neutral gray. `halfRange` sets the saturation span.
 */
export declare function effectColor(value: number, baseline: number, halfRange: number): string;
/** Ink for text drawn on top of an {@link effectColor} fill. */
export declare function effectTextColor(value: number, baseline: number, halfRange: number): string;
//# sourceMappingURL=colors.d.ts.map