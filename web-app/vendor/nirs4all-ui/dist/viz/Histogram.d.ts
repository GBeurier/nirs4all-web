import { type PlotPadding } from "./geometry.js";
/** A precomputed categorical bar (e.g. one class of a classification target). */
export interface HistogramBar {
    label: string;
    count: number;
}
export interface HistogramProps {
    /** Raw numeric samples, binned internally (regression variant). */
    values?: readonly number[];
    /** Precomputed categorical counts (classification variant). */
    bins?: readonly HistogramBar[];
    variant?: "regression" | "classification";
    /** Number of equal-width bins for the regression variant. */
    binCount?: number;
    barColor?: string;
    /** Draw a dashed vertical mean reference (regression variant only). */
    meanLine?: boolean;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Bar histogram of a target / score / prediction distribution. Regression bins
 * raw `values` into equal-width buckets (optionally with a dashed mean line);
 * classification renders precomputed categorical `bins`. Pure inline SVG — no
 * chart library, no state.
 */
export declare function Histogram({ values, bins, variant, binCount, barColor, meanLine, width, height, padding, xLabel, yLabel, title, className, }: HistogramProps): import("react").JSX.Element;
//# sourceMappingURL=Histogram.d.ts.map