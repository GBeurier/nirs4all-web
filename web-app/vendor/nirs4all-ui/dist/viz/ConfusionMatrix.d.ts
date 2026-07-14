export interface ConfusionMatrixProps {
    /** Class labels, index-aligned to matrix rows (true) and columns (predicted). */
    labels: readonly string[];
    /** `matrix[trueClass][predClass]` raw counts. */
    matrix: ReadonlyArray<readonly number[]>;
    /** Shade each cell by its share of the true-class row instead of the global max. */
    normalize?: boolean;
    width?: number;
    height?: number;
    /** Cell fill given the 0..1 intensity and whether the cell is on the diagonal. */
    cellColor?: (intensity: number, isDiagonal: boolean) => string;
    showCounts?: boolean;
    xLabel?: string;
    yLabel?: string;
    title?: string;
    className?: string;
}
/**
 * Classification confusion matrix as intensity-shaded cells (teal diagonal,
 * amber off-diagonal) — the Studio Inspector / Web results classification view.
 * Pure inline SVG; hosts pass labels + a counts matrix.
 */
export declare function ConfusionMatrix({ labels, matrix, normalize, width, height, cellColor, showCounts, xLabel, yLabel, title, className, }: ConfusionMatrixProps): import("react").JSX.Element;
//# sourceMappingURL=ConfusionMatrix.d.ts.map