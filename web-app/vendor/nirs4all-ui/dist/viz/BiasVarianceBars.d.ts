import { type PlotPadding } from "./geometry.js";
/** One group's bias²/variance decomposition of its prediction error. */
export interface BiasVarianceEntry {
    label: string;
    biasSquared: number;
    variance: number;
}
export interface BiasVarianceBarsProps {
    entries: readonly BiasVarianceEntry[];
    biasColor?: string;
    varianceColor?: string;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Stacked bias²/variance decomposition per group — the Studio Inspector
 * bias-variance view. Each vertical bar stacks variance on top of bias², so the
 * full bar height is the total error and the split shows where it comes from. A
 * two-swatch legend keys the segments. Pure inline SVG; hosts pass the
 * decomposition per group.
 */
export declare function BiasVarianceBars({ entries, biasColor, varianceColor, width, height, padding, yLabel, title, className, }: BiasVarianceBarsProps): import("react").JSX.Element;
//# sourceMappingURL=BiasVarianceBars.d.ts.map