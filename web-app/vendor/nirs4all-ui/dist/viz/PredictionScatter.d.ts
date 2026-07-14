import type { ReactNode } from "react";
import { type PlotPadding } from "./geometry.js";
import { type PartitionKey } from "./theme.js";
/** A single predicted-vs-observed observation. */
export interface PredictionPoint {
    actual: number;
    predicted: number;
    partition?: PartitionKey;
    color?: string;
    label?: string;
}
export interface PredictionScatterProps {
    points: readonly PredictionPoint[];
    width?: number;
    height?: number;
    padding?: PlotPadding;
    /** Draw the dashed y = x identity line (default true). */
    identityLine?: boolean;
    /** Draw the ordinary-least-squares regression fit (default false). */
    regressionLine?: boolean;
    /** Optional R² / RMSE readout rendered as a corner badge. */
    metrics?: {
        r2?: number;
        rmse?: number;
    } | null;
    pointRadius?: number;
    pointOpacity?: number;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    className?: string;
    children?: ReactNode;
}
/**
 * Predicted-vs-observed (parity) scatter with a dashed identity line and an
 * optional regression fit — the core regression-diagnostic chart from Studio's
 * Inspector and the Web results view. Pure inline SVG; hosts pass points and
 * (optionally) precomputed metrics.
 */
export declare function PredictionScatter({ points, width, height, padding, identityLine, regressionLine, metrics, pointRadius, pointOpacity, xLabel, yLabel, title, className, children, }: PredictionScatterProps): import("react").JSX.Element;
//# sourceMappingURL=PredictionScatter.d.ts.map