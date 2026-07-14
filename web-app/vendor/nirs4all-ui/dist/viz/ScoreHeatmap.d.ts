export interface ScoreHeatmapProps {
    /** Row (y) labels, index-aligned to `values`. */
    rows: readonly string[];
    /** Column (x) labels, index-aligned to each `values` row. */
    cols: readonly string[];
    /** `values[rowIdx][colIdx]`; non-finite entries render as blank cells. */
    values: ReadonlyArray<readonly number[]>;
    /** Maps a 0..1 intensity to a fill (default viridis). */
    colorScale?: (t: number) => string;
    showValues?: boolean;
    valueFormat?: (v: number) => string;
    /** Fixed intensity domain; computed from finite values when omitted. */
    min?: number;
    max?: number;
    width?: number;
    /** Auto-sized from the row count when omitted. */
    height?: number;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * 2D performance heatmap (model × preprocessing scores) — the Studio Inspector
 * matrix view. Cells are colored by normalized value through `colorScale`,
 * non-finite entries drop out as blanks, and a compact gradient legend keys the
 * scale. Pure inline SVG; hosts pass labels + a values matrix.
 */
export declare function ScoreHeatmap({ rows, cols, values, colorScale, showValues, valueFormat, min, max, width, height, xLabel, yLabel, title, className, }: ScoreHeatmapProps): import("react").JSX.Element;
//# sourceMappingURL=ScoreHeatmap.d.ts.map