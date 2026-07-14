/**
 * Shared visualization palette for the nirs4all `viz` domain.
 *
 * Pure data + pure color math: no DOM, no React. These are the canonical
 * "teal system" chart colors used across nirs4all Studio and the Web/WASM
 * client, exposed so every presentational chart in this package (and its
 * hosts) draws from one source of truth. Components read these as defaults but
 * always accept explicit color overrides so hosts can retheme.
 */
/** Named brand-ramp colors (verbatim from the nirs4all-org teal system). */
export declare const N4_VIZ_COLORS: {
    readonly teal: "#0d9488";
    readonly tealDark: "#0f766e";
    readonly tealLight: "#2dd4bf";
    readonly cyan: "#06b6d4";
    readonly indigo: "#4f46e5";
    readonly green: "#10b981";
    readonly amber: "#d97706";
    readonly rose: "#e11d48";
    readonly violet: "#7c3aed";
    readonly slate: "#64748b";
};
/** Ordered categorical series (mirrors `--chart-1..5` in the shared theme). */
export declare const N4_CHART_SERIES: readonly ["#0d9488", "#06b6d4", "#4f46e5", "#10b981", "#d97706"];
/**
 * Wide categorical palette for group-colored scatter/topology views (mirrors
 * Studio's `INSPECTOR_GROUP_COLORS`).
 */
export declare const N4_CATEGORICAL: readonly ["#0d9488", "#2563eb", "#d97706", "#e11d48", "#7c3aed", "#059669", "#ea580c", "#0284c7", "#db2777", "#65a30d"];
/** Canonical train / validation / test partition colors. */
export declare const N4_PARTITION_COLORS: {
    readonly train: "#0d9488";
    readonly validation: "#4f46e5";
    readonly test: "#d97706";
};
export type PartitionKey = keyof typeof N4_PARTITION_COLORS;
/** Resolve a categorical color by index, wrapping around the palette. */
export declare function categoricalColor(index: number, palette?: readonly string[]): string;
/** Interpolate a stop-based color ramp; `t` is clamped to [0, 1]. */
export declare function rampAt(stops: readonly string[], t: number): string;
/** Sequential teal→amber ramp (used for continuous coloring by value). */
export declare const N4_SEQUENTIAL_STOPS: readonly ["#0f766e", "#0d9488", "#06b6d4", "#84cc16", "#d97706"];
/** Perceptual viridis approximation for heatmap intensity. */
export declare const N4_VIRIDIS_STOPS: readonly ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
/** Diverging blue→neutral→red ramp for signed SHAP values. */
export declare const N4_DIVERGING_STOPS: readonly ["#2563eb", "#e2e8f0", "#e11d48"];
export declare function sequentialColor(t: number): string;
export declare function viridisColor(t: number): string;
export declare function divergingColor(t: number): string;
//# sourceMappingURL=theme.d.ts.map