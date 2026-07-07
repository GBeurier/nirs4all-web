/**
 * Shared visual style manifests for NIRS4ALL hosts.
 *
 * Static CSS and motion files are shipped under `assets/`; this module exposes
 * typed paths and token names without importing CSS at runtime.
 */
export type Nirs4allStyleAssetId = "default-theme" | "spectra-motion";
export type Nirs4allStyleAssetKind = "css" | "svg-motion";
export interface Nirs4allStyleAsset {
    id: Nirs4allStyleAssetId;
    kind: Nirs4allStyleAssetKind;
    path: string;
    packageExport: string;
    description: string;
}
export declare const NIRS4ALL_STYLE_ASSETS: readonly [{
    readonly id: "default-theme";
    readonly kind: "css";
    readonly path: "assets/styles/nirs4all-default.css";
    readonly packageExport: "nirs4all-ui/assets/styles/nirs4all-default.css";
    readonly description: "Default NIRS4ALL design tokens, surface classes, badges, grids, and runtime affordances.";
}, {
    readonly id: "spectra-motion";
    readonly kind: "svg-motion";
    readonly path: "assets/motion/nirs-spectra.svg";
    readonly packageExport: "nirs4all-ui/assets/motion/nirs-spectra.svg";
    readonly description: "Reusable animated NIR spectra motif for docs, splash surfaces, and app empty states.";
}];
export declare const NIRS4ALL_CSS_TOKENS: readonly ["n4-color-primary", "n4-color-primary-hover", "n4-color-cyan", "n4-color-indigo", "n4-color-success", "n4-color-warning", "n4-color-danger", "n4-color-bg", "n4-color-bg-alt", "n4-color-surface", "n4-color-border", "n4-color-text", "n4-color-muted", "n4-radius", "n4-radius-sm", "n4-shadow", "n4-font-sans", "n4-font-display", "n4-font-mono"];
export type Nirs4allCssToken = (typeof NIRS4ALL_CSS_TOKENS)[number];
export declare const NIRS4ALL_DEFAULT_THEME: {
    readonly colors: {
        readonly primary: "#0d9488";
        readonly primaryHover: "#0f766e";
        readonly cyan: "#06b6d4";
        readonly indigo: "#4f46e5";
        readonly success: "#10b981";
        readonly warning: "#d97706";
        readonly danger: "#e11d48";
        readonly background: "#faf7f0";
        readonly surface: "#ffffff";
        readonly border: "#e2e8f0";
        readonly text: "#0f172a";
        readonly muted: "#475569";
    };
    readonly radius: {
        readonly default: "8px";
        readonly small: "6px";
    };
    readonly fonts: {
        readonly sans: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif";
        readonly display: "IBM Plex Sans, Inter, -apple-system, system-ui, sans-serif";
        readonly mono: "JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace";
    };
};
export declare function getNirs4allStyleAsset(id: Nirs4allStyleAssetId): Nirs4allStyleAsset;
export declare function getNirs4allCssVariable(token: Nirs4allCssToken): string;
//# sourceMappingURL=index.d.ts.map