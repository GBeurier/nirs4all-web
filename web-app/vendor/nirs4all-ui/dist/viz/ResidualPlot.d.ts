import { type PlotPadding } from "./geometry.js";
import { type PartitionKey } from "./theme.js";
/** One residual observation: residual vs. predicted (actual − predicted if `residual` absent). */
export interface ResidualPoint {
    predicted: number;
    residual?: number;
    actual?: number;
    partition?: PartitionKey;
    color?: string;
}
export interface ResidualPlotProps {
    points: readonly ResidualPoint[];
    width?: number;
    height?: number;
    padding?: PlotPadding;
    /** Draw dashed ±2σ reference lines around zero (default true). */
    sigmaBand?: boolean;
    pointRadius?: number;
    pointOpacity?: number;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Residual (y) vs. predicted (x) scatter with a solid zero reference and dashed
 * ±2σ bands — the residual-diagnostic view from Studio's Inspector. Pure inline
 * SVG; hosts pass points (residual or actual) and (optionally) precomputed
 * colors.
 */
export declare function ResidualPlot({ points, width, height, padding, sigmaBand, pointRadius, pointOpacity, xLabel, yLabel, title, className, }: ResidualPlotProps): import("react").JSX.Element;
//# sourceMappingURL=ResidualPlot.d.ts.map