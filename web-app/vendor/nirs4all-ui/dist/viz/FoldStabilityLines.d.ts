import { type PlotPadding } from "./geometry.js";
/** One model / chain's cross-validation scores, index-aligned to the fold axis. */
export interface FoldSeries {
    id: string;
    label?: string;
    scores: readonly number[];
    color?: string;
}
export interface FoldStabilityLinesProps {
    series: readonly FoldSeries[];
    /** X-axis fold labels (default "F1".."Fn" from the longest series). */
    foldLabels?: readonly string[];
    /** Draw the emphasized cross-series mean line + min/max envelope (default true). */
    showMean?: boolean;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Per-fold cross-validation stability chart — the Studio Inspector fold-stability
 * view. One faint line per model/chain across the fold axis, with an emphasized
 * cross-series mean line and a shaded min/max envelope highlighting agreement.
 * Pure inline SVG; hosts pass per-fold score arrays.
 */
export declare function FoldStabilityLines({ series, foldLabels, showMean, width, height, padding, yLabel, title, className, }: FoldStabilityLinesProps): import("react").JSX.Element;
//# sourceMappingURL=FoldStabilityLines.d.ts.map