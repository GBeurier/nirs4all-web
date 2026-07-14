/**
 * The canonical NIRS4ALL ecosystem brand manifest.
 *
 * `nirs4all-ui` is the single home of the shared brand kit: the real,
 * designer-made SVG marks for every ecosystem project live under
 * `assets/brands/<id>/` and are vendored here verbatim from the flagship
 * (`nirs4all-org`). Each project has its own distinct mark (a colored squircle
 * tile with a white NIRS spectrum + peak dot and a project wordmark); the
 * shared red accent (`#E9362D`) and teal master (`#058E96`) are constant.
 *
 * This module is pure TypeScript: no DOM, no React, no filesystem. It exposes
 * the manifest and stable asset paths; consumers load the SVG files themselves.
 */
export type Nirs4allBrandId = "nirs4all" | "nirs4all-core" | "nirs4all-ui" | "nirs4all-studio" | "nirs4all-web" | "nirs4all-formats" | "nirs4all-io" | "nirs4all-methods" | "nirs4all-datasets" | "nirs4all-providers" | "nirs4all-benchmarks" | "nirs4all-repository" | "nirs4all-tools" | "nirs4all-papers" | "nirs4all-device" | "nirs4all-cluster" | "nirs4all-quality" | "dag-ml" | "dag-ml-data";
export type Nirs4allBrandVariant = "icon" | "horizontal" | "horizontal-dark" | "stacked" | "stacked-dark";
/** Raster assets shipped alongside the SVG marks for every brand. */
export type Nirs4allBrandRaster = "favicon" | "icon-32" | "icon-180" | "icon-256" | "icon-512" | "og";
export interface Nirs4allBrandPalette {
    /** the brand's tile accent color */
    primary: string;
    /** the constant NIRS4ALL red accent (the "4" and the peak dot) */
    accent: string;
    /** the flagship teal master token */
    master: string;
}
export interface Nirs4allBrandDefinition {
    id: Nirs4allBrandId;
    name: string;
    role: string;
    /** primary accent color of the mark (the squircle tile fill) */
    accent: string;
    palette: Nirs4allBrandPalette;
    tags: readonly string[];
}
export declare const NIRS4ALL_BRANDS: readonly Nirs4allBrandDefinition[];
export declare function isNirs4allBrandId(value: string): value is Nirs4allBrandId;
export declare function getNirs4allBrandDefinition(id: Nirs4allBrandId): Nirs4allBrandDefinition;
export declare function listNirs4allBrands(): readonly Nirs4allBrandDefinition[];
/** Package-relative path to a vendored SVG mark, e.g. `assets/brands/nirs4all-studio/horizontal.svg`. */
export declare function getNirs4allBrandAssetPath(brand: Nirs4allBrandId | Nirs4allBrandDefinition, variant: Nirs4allBrandVariant): string;
/** Package-relative path to a vendored raster asset, e.g. `assets/brands/nirs4all-studio/favicon.ico`. */
export declare function getNirs4allBrandRasterPath(brand: Nirs4allBrandId | Nirs4allBrandDefinition, raster: Nirs4allBrandRaster): string;
//# sourceMappingURL=index.d.ts.map