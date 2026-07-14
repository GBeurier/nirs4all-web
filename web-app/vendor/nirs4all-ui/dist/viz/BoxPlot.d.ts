import { type PlotPadding } from "./geometry.js";
/** One category's raw score distribution (summarized into a box internally). */
export interface BoxPlotGroup {
    label: string;
    values: readonly number[];
    color?: string;
}
export interface BoxPlotProps {
    groups: readonly BoxPlotGroup[];
    width?: number;
    height?: number;
    padding?: PlotPadding;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Box-and-whisker plot per category — a score distribution across categories
 * (Studio's Inspector candlestick view). Each box is a five-number summary with
 * a median line, whiskers over the min→max span, and dots for 1.5·IQR outliers.
 * Pure inline SVG; hosts pass grouped raw values.
 */
export declare function BoxPlot({ groups, width, height, padding, yLabel, title, className, }: BoxPlotProps): import("react").JSX.Element;
//# sourceMappingURL=BoxPlot.d.ts.map