import { type PlotPadding } from "./geometry.js";
/** One projected sample in a 2D embedding (PCA / UMAP / t-SNE). */
export interface PcaPoint {
    x: number;
    y: number;
    group?: string;
    value?: number;
    color?: string;
}
export interface PcaScatterProps {
    points: readonly PcaPoint[];
    /** How to color points: by categorical group, continuous value, or partition. */
    colorMode?: "group" | "value" | "partition";
    /** Explicit group → color overrides (group mode). */
    groupColors?: Record<string, string>;
    /** Explained variance fractions → axis labels `PC1 (xx%)` / `PC2 (yy%)`. */
    explained?: readonly [number, number];
    xLabel?: string;
    yLabel?: string;
    pointRadius?: number;
    pointOpacity?: number;
    width?: number;
    height?: number;
    padding?: PlotPadding;
    /** Small swatch legend (top-right); defaults on for categorical modes. */
    legend?: boolean;
    title?: string;
    className?: string;
}
/**
 * 2D projection scatter (PCA / UMAP) colored by categorical group, continuous
 * value, or train/validation/test partition — the Studio Playground and Web PCA
 * panel. Pure inline SVG; hosts pass already-projected points.
 */
export declare function PcaScatter({ points, colorMode, groupColors, explained, xLabel, yLabel, pointRadius, pointOpacity, width, height, padding, legend, title, className, }: PcaScatterProps): import("react").JSX.Element;
//# sourceMappingURL=PcaScatter.d.ts.map