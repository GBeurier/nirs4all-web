/** A single SHAP contribution for one sample against one feature. */
export interface BeeswarmPoint {
    shap: number;
    featureValue: number;
}
/** One feature row: every sample's SHAP value + raw feature value. */
export interface BeeswarmFeature {
    label: string;
    points: readonly BeeswarmPoint[];
}
export interface ShapBeeswarmProps {
    features: readonly BeeswarmFeature[];
    width?: number;
    /** Auto-sized from the feature count when omitted. */
    height?: number;
    pointRadius?: number;
    title?: string;
    className?: string;
    xLabel?: string;
}
/**
 * SHAP beeswarm: one horizontal row per feature with a dot per sample placed by
 * its SHAP value and colored (blue→neutral→red) by the sample's normalized
 * feature value. A dashed zero reference line separates negative from positive
 * contributions. Jitter is deterministic (index-derived, never random) so the
 * markup is stable across renders. Pure inline SVG.
 */
export declare function ShapBeeswarm({ features, width, height, pointRadius, title, className, xLabel, }: ShapBeeswarmProps): import("react").JSX.Element;
//# sourceMappingURL=ShapBeeswarm.d.ts.map