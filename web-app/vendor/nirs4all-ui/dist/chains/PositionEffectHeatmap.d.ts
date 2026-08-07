import type { ChainStepRole, PositionMatrix } from "./types.js";
export interface PositionEffectHeatmapProps {
    matrix: PositionMatrix;
    width?: number;
    height?: number;
    /** Draw the per-cell sample size under the value. Default `true`. */
    showCounts?: boolean;
    selectedToken?: string | null;
    onSelectToken?: (token: string) => void;
    title?: string;
    hideTitle?: boolean;
    xLabel?: string;
    className?: string;
    roleColors?: Partial<Record<ChainStepRole, string>> | undefined;
}
/**
 * Token × position goodness heatmap — answers "is this step better early, mid,
 * or late (1st vs 2nd)?". Each cell is the median goodness of chains where the
 * row token sits in that position bucket, colored on the diverging effect ramp
 * pivoted at the corpus baseline (cool = better, warm = worse). Cells below the
 * min-count gate drop out as blanks. Pure inline SVG; feed it a
 * {@link PositionMatrix} from `positionMatrix()`.
 */
export declare function PositionEffectHeatmap({ matrix, width, height, showCounts, selectedToken, onSelectToken, title, hideTitle, xLabel, className, roleColors, }: PositionEffectHeatmapProps): import("react").JSX.Element;
//# sourceMappingURL=PositionEffectHeatmap.d.ts.map