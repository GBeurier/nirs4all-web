/** One signed feature contribution in a per-sample SHAP decomposition. */
export interface WaterfallContribution {
    label: string;
    value: number;
}
export interface WaterfallChartProps {
    /** Model base value (the expected prediction before any feature is applied). */
    baseValue: number;
    /** Signed per-feature contributions applied in order from `baseValue`. */
    contributions: readonly WaterfallContribution[];
    /** Final prediction (defaults to `baseValue + Σ contributions`). */
    predicted?: number;
    /** Keep the largest `|value|` contributions, preserving original order (default 10). */
    topN?: number;
    valueFormat?: (v: number) => string;
    width?: number;
    /** Auto-sized from the kept row count when omitted. */
    height?: number;
    title?: string;
    className?: string;
}
/**
 * Per-sample SHAP waterfall — the Studio Variable-Importance waterfall. Each
 * feature contribution is a floating horizontal bar from the running total,
 * green when it pushes the prediction up and rose when down, walking from the
 * base value to the prediction. A dashed base reference and a solid prediction
 * reference frame the walk. Pure inline SVG; hosts pass precomputed SHAP values.
 */
export declare function WaterfallChart({ baseValue, contributions, predicted, topN, valueFormat, width, height, title, className, }: WaterfallChartProps): import("react").JSX.Element;
//# sourceMappingURL=WaterfallChart.d.ts.map