/** One ranked feature / wavelength-region contribution. */
export interface ImportanceItem {
    label: string;
    value: number;
    color?: string;
}
export interface FeatureImportanceBarProps {
    items: readonly ImportanceItem[];
    /** Sort by value descending and keep the top N (default 12). */
    topN?: number;
    barColor?: string;
    valueFormat?: (v: number) => string;
    width?: number;
    /** Auto-sized from `topN` when omitted. */
    height?: number;
    title?: string;
    className?: string;
}
/**
 * Ranked horizontal-bar chart of the most important features / wavelength
 * regions — the Studio Variable-Importance view. Sorts by value, keeps the top
 * N, left-labels each bar and prints its value on the right. Pure inline SVG;
 * hosts pass precomputed importances.
 */
export declare function FeatureImportanceBar({ items, topN, barColor, valueFormat, width, height, title, className, }: FeatureImportanceBarProps): import("react").JSX.Element;
//# sourceMappingURL=FeatureImportanceBar.d.ts.map