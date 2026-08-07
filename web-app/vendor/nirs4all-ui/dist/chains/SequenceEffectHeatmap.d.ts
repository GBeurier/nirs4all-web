import type { ChainStepRole, SequenceMatrix } from "./types.js";
export interface SequenceEffectHeatmapProps {
    matrix: SequenceMatrix;
    width?: number;
    height?: number;
    /** Draw the per-cell sample size under the value. Default `false`. */
    showCounts?: boolean;
    title?: string;
    hideTitle?: boolean;
    className?: string;
    roleColors?: Partial<Record<ChainStepRole, string>> | undefined;
}
/**
 * Predecessor × successor goodness matrix — answers order questions like "is
 * MSC better *after* SNV?". `cells[pred][succ]` is the median goodness of chains
 * where the row token occurs before the column token, on the diverging effect
 * ramp pivoted at the baseline. The diagonal and count-gated pairs are blank.
 * Read a cell as "row → column". Pure inline SVG; feed a {@link SequenceMatrix}
 * from `sequenceMatrix()`.
 */
export declare function SequenceEffectHeatmap({ matrix, width, height, showCounts, title, hideTitle, className, roleColors, }: SequenceEffectHeatmapProps): import("react").JSX.Element;
//# sourceMappingURL=SequenceEffectHeatmap.d.ts.map