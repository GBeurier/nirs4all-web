/**
 * Shared NIRS4ALL brand definitions and deterministic SVG generators.
 *
 * This module is pure TypeScript: no DOM, no React, no filesystem access.
 * Hosts can use the asset paths for packaged files or generate inline SVG
 * strings when they need app-local marks.
 */
export type Nirs4allBrandId = "nirs4all" | "nirs4all-core" | "nirs4all-ui" | "nirs4all-providers";
export type Nirs4allBrandVariant = "icon" | "horizontal" | "stacked";
export interface Nirs4allBrandPalette {
    primary: string;
    secondary: string;
    accent: string;
    dark: string;
    surface: string;
}
export interface Nirs4allBrandAssets {
    icon: string;
    horizontal: string;
    stacked: string;
}
export interface Nirs4allBrandDefinition {
    id: Nirs4allBrandId;
    name: string;
    shortName: string;
    packageName: string;
    role: string;
    description: string;
    palette: Nirs4allBrandPalette;
    assets: Nirs4allBrandAssets;
    tags: readonly string[];
}
export interface GenerateNirs4allBrandSvgOptions {
    variant?: Nirs4allBrandVariant;
    title?: string;
    dark?: boolean;
    animated?: boolean;
}
export declare const NIRS4ALL_BRANDS: readonly [{
    readonly id: "nirs4all";
    readonly name: "NIRS4ALL";
    readonly shortName: "n4a";
    readonly packageName: "nirs4all";
    readonly role: "Ecosystem umbrella";
    readonly description: "Shared identity for NIRS4ALL applications, docs, releases, and custom hosts.";
    readonly palette: {
        readonly primary: "#058E96";
        readonly secondary: "#00A5D2";
        readonly accent: "#E9362D";
        readonly dark: "#0f172a";
        readonly surface: "#ffffff";
    };
    readonly assets: {
        readonly icon: "assets/brands/nirs4all/icon.svg";
        readonly horizontal: "assets/brands/nirs4all/horizontal.svg";
        readonly stacked: "assets/brands/nirs4all/stacked.svg";
    };
    readonly tags: readonly ["ecosystem", "docs", "custom-host"];
}, {
    readonly id: "nirs4all-core";
    readonly name: "nirs4all-core";
    readonly shortName: "n4o";
    readonly packageName: "nirs4all";
    readonly role: "Portable aggregate runtime";
    readonly description: "Low-level aggregate used by native, Python, R, WASM, Rust, MATLAB, and custom hosts.";
    readonly palette: {
        readonly primary: "#E9362D";
        readonly secondary: "#058E96";
        readonly accent: "#E9362D";
        readonly dark: "#10233a";
        readonly surface: "#ffffff";
    };
    readonly assets: {
        readonly icon: "assets/brands/nirs4all-core/icon.svg";
        readonly horizontal: "assets/brands/nirs4all-core/horizontal.svg";
        readonly stacked: "assets/brands/nirs4all-core/stacked.svg";
    };
    readonly tags: readonly ["core", "runtime", "bindings"];
}, {
    readonly id: "nirs4all-ui";
    readonly name: "nirs4all-ui";
    readonly shortName: "n4u";
    readonly packageName: "nirs4all-ui";
    readonly role: "Reusable visual system";
    readonly description: "Shared React components, visual tokens, brand assets, and app-host UI contracts.";
    readonly palette: {
        readonly primary: "#2563eb";
        readonly secondary: "#058E96";
        readonly accent: "#E9362D";
        readonly dark: "#172554";
        readonly surface: "#ffffff";
    };
    readonly assets: {
        readonly icon: "assets/brands/nirs4all-ui/icon.svg";
        readonly horizontal: "assets/brands/nirs4all-ui/horizontal.svg";
        readonly stacked: "assets/brands/nirs4all-ui/stacked.svg";
    };
    readonly tags: readonly ["ui", "studio", "web"];
}, {
    readonly id: "nirs4all-providers";
    readonly name: "nirs4all-providers";
    readonly shortName: "n4v";
    readonly packageName: "nirs4all-providers";
    readonly role: "Soft-import provider bridge";
    readonly description: "Optional provider clients for datasets, repositories, archives, and publication surfaces.";
    readonly palette: {
        readonly primary: "#D946EF";
        readonly secondary: "#058E96";
        readonly accent: "#E9362D";
        readonly dark: "#2e1065";
        readonly surface: "#ffffff";
    };
    readonly assets: {
        readonly icon: "assets/brands/nirs4all-providers/icon.svg";
        readonly horizontal: "assets/brands/nirs4all-providers/horizontal.svg";
        readonly stacked: "assets/brands/nirs4all-providers/stacked.svg";
    };
    readonly tags: readonly ["providers", "datasets", "repository"];
}];
export declare function isNirs4allBrandId(value: string): value is Nirs4allBrandId;
export declare function getNirs4allBrandDefinition(id: Nirs4allBrandId): Nirs4allBrandDefinition;
export declare function listNirs4allBrands(): readonly Nirs4allBrandDefinition[];
export declare function getNirs4allBrandAssetPath(brand: Nirs4allBrandId | Nirs4allBrandDefinition, variant: Nirs4allBrandVariant): string;
export declare function generateNirs4allBrandSvg(brand: Nirs4allBrandId | Nirs4allBrandDefinition, options?: GenerateNirs4allBrandSvgOptions): string;
//# sourceMappingURL=index.d.ts.map