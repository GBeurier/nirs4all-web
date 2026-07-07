/**
 * Shared NIRS4ALL brand definitions and deterministic SVG generators.
 *
 * This module is pure TypeScript: no DOM, no React, no filesystem access.
 * Hosts can use the asset paths for packaged files or generate inline SVG
 * strings when they need app-local marks.
 */

export type Nirs4allBrandId =
  | "nirs4all"
  | "nirs4all-core"
  | "nirs4all-ui"
  | "nirs4all-providers";

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

const SHARED_TEAL_PALETTE = {
  primary: "#0d9488",
  secondary: "#06b6d4",
  accent: "#10b981",
  dark: "#0f172a",
  surface: "#ffffff",
} as const satisfies Nirs4allBrandPalette;

export const NIRS4ALL_BRANDS = [
  {
    id: "nirs4all",
    name: "NIRS4ALL",
    shortName: "n4a",
    packageName: "nirs4all",
    role: "Ecosystem umbrella",
    description: "Shared identity for NIRS4ALL applications, docs, releases, and custom hosts.",
    palette: SHARED_TEAL_PALETTE,
    assets: {
      icon: "assets/brands/nirs4all/icon.svg",
      horizontal: "assets/brands/nirs4all/horizontal.svg",
      stacked: "assets/brands/nirs4all/stacked.svg",
    },
    tags: ["ecosystem", "docs", "custom-host"],
  },
  {
    id: "nirs4all-core",
    name: "nirs4all-core",
    shortName: "core",
    packageName: "nirs4all",
    role: "Portable aggregate runtime",
    description: "Low-level aggregate used by native, Python, R, WASM, Rust, MATLAB, and custom hosts.",
    palette: {
      primary: "#0d9488",
      secondary: "#0891b2",
      accent: "#4f46e5",
      dark: "#10233a",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-core/icon.svg",
      horizontal: "assets/brands/nirs4all-core/horizontal.svg",
      stacked: "assets/brands/nirs4all-core/stacked.svg",
    },
    tags: ["core", "runtime", "bindings"],
  },
  {
    id: "nirs4all-ui",
    name: "nirs4all-ui",
    shortName: "ui",
    packageName: "nirs4all-ui",
    role: "Reusable visual system",
    description: "Shared React components, visual tokens, brand assets, and app-host UI contracts.",
    palette: {
      primary: "#2563eb",
      secondary: "#06b6d4",
      accent: "#e9362d",
      dark: "#172554",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-ui/icon.svg",
      horizontal: "assets/brands/nirs4all-ui/horizontal.svg",
      stacked: "assets/brands/nirs4all-ui/stacked.svg",
    },
    tags: ["ui", "studio", "web"],
  },
  {
    id: "nirs4all-providers",
    name: "nirs4all-providers",
    shortName: "providers",
    packageName: "nirs4all-providers",
    role: "Soft-import provider bridge",
    description: "Optional provider clients for datasets, repositories, archives, and publication surfaces.",
    palette: {
      primary: "#7c3aed",
      secondary: "#0d9488",
      accent: "#f59e0b",
      dark: "#2e1065",
      surface: "#ffffff",
    },
    assets: {
      icon: "assets/brands/nirs4all-providers/icon.svg",
      horizontal: "assets/brands/nirs4all-providers/horizontal.svg",
      stacked: "assets/brands/nirs4all-providers/stacked.svg",
    },
    tags: ["providers", "datasets", "repository"],
  },
] as const satisfies readonly Nirs4allBrandDefinition[];

const BRAND_ID_SET: ReadonlySet<string> = new Set(NIRS4ALL_BRANDS.map((brand) => brand.id));

export function isNirs4allBrandId(value: string): value is Nirs4allBrandId {
  return BRAND_ID_SET.has(value);
}

export function getNirs4allBrandDefinition(id: Nirs4allBrandId): Nirs4allBrandDefinition {
  const brand = NIRS4ALL_BRANDS.find((candidate) => candidate.id === id);
  if (!brand) {
    throw new Error(`Unknown NIRS4ALL brand: ${id}`);
  }
  return brand;
}

export function listNirs4allBrands(): readonly Nirs4allBrandDefinition[] {
  return NIRS4ALL_BRANDS;
}

export function getNirs4allBrandAssetPath(
  brand: Nirs4allBrandId | Nirs4allBrandDefinition,
  variant: Nirs4allBrandVariant,
): string {
  return resolveBrand(brand).assets[variant];
}

export function generateNirs4allBrandSvg(
  brand: Nirs4allBrandId | Nirs4allBrandDefinition,
  options: GenerateNirs4allBrandSvgOptions = {},
): string {
  const resolved = resolveBrand(brand);
  const variant = options.variant ?? "horizontal";

  if (variant === "icon") {
    return buildIconSvg(resolved, options);
  }
  if (variant === "stacked") {
    return buildStackedSvg(resolved, options);
  }
  return buildHorizontalSvg(resolved, options);
}

function resolveBrand(brand: Nirs4allBrandId | Nirs4allBrandDefinition): Nirs4allBrandDefinition {
  return typeof brand === "string" ? getNirs4allBrandDefinition(brand) : brand;
}

function buildIconSvg(brand: Nirs4allBrandDefinition, options: GenerateNirs4allBrandSvgOptions): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-icon-title`;
  const textColor = options.dark ? "#ffffff" : brand.palette.dark;
  const surface = options.dark ? brand.palette.dark : brand.palette.surface;
  const animation = options.animated ? waveAnimation("icon-wave") : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  <rect width="128" height="128" rx="24" fill="${surface}"/>
  <path d="M20 78C31 45 44 44 58 70s26 25 50-20" fill="none" stroke="${brand.palette.primary}" stroke-width="9" stroke-linecap="round"/>
  <path id="icon-wave" d="M20 90C36 74 48 74 64 89s29 17 44-4" fill="none" stroke="${brand.palette.secondary}" stroke-width="5" stroke-linecap="round" opacity=".82"/>
  ${animation}
  <circle cx="98" cy="39" r="10" fill="${brand.palette.accent}"/>
  <text x="64" y="112" fill="${textColor}" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" text-anchor="middle">${escapeXml(brand.shortName)}</text>
</svg>`;
}

function buildHorizontalSvg(
  brand: Nirs4allBrandDefinition,
  options: GenerateNirs4allBrandSvgOptions,
): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-horizontal-title`;
  const textColor = options.dark ? "#ffffff" : brand.palette.dark;
  const mutedColor = options.dark ? "#cbd5e1" : "#475569";
  const surface = options.dark ? brand.palette.dark : brand.palette.surface;
  const animation = options.animated ? waveAnimation("horizontal-wave") : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 132" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  <rect width="520" height="132" rx="22" fill="${surface}"/>
  <g transform="translate(24 18)">
    <rect width="96" height="96" rx="20" fill="${brand.palette.primary}" opacity=".12"/>
    <path d="M14 58C25 28 37 28 49 54s24 26 40-15" fill="none" stroke="${brand.palette.primary}" stroke-width="8" stroke-linecap="round"/>
    <path id="horizontal-wave" d="M14 72C29 58 39 59 53 72s25 14 37-2" fill="none" stroke="${brand.palette.secondary}" stroke-width="5" stroke-linecap="round"/>
    ${animation}
    <circle cx="78" cy="28" r="8" fill="${brand.palette.accent}"/>
  </g>
  <text x="146" y="61" fill="${textColor}" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">${escapeXml(brand.name)}</text>
  <text x="146" y="92" fill="${mutedColor}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(brand.role)}</text>
</svg>`;
}

function buildStackedSvg(brand: Nirs4allBrandDefinition, options: GenerateNirs4allBrandSvgOptions): string {
  const title = escapeXml(options.title ?? brand.name);
  const titleId = `${brand.id}-stacked-title`;
  const textColor = options.dark ? "#ffffff" : brand.palette.dark;
  const mutedColor = options.dark ? "#cbd5e1" : "#475569";
  const surface = options.dark ? brand.palette.dark : brand.palette.surface;
  const animation = options.animated ? waveAnimation("stacked-wave") : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 236" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">${title}</title>
  <rect width="280" height="236" rx="24" fill="${surface}"/>
  <g transform="translate(80 26)">
    <rect width="120" height="120" rx="28" fill="${brand.palette.primary}" opacity=".12"/>
    <path d="M18 73C32 36 47 35 64 68s32 33 56-18" fill="none" stroke="${brand.palette.primary}" stroke-width="10" stroke-linecap="round"/>
    <path id="stacked-wave" d="M18 91C37 72 51 74 68 91s35 18 52-3" fill="none" stroke="${brand.palette.secondary}" stroke-width="6" stroke-linecap="round"/>
    ${animation}
    <circle cx="96" cy="38" r="10" fill="${brand.palette.accent}"/>
  </g>
  <text x="140" y="178" fill="${textColor}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" text-anchor="middle">${escapeXml(brand.name)}</text>
  <text x="140" y="205" fill="${mutedColor}" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" text-anchor="middle">${escapeXml(brand.role)}</text>
</svg>`;
}

function waveAnimation(targetId: string): string {
  return `<animate href="#${targetId}" attributeName="stroke-dashoffset" values="0;-80" dur="9s" repeatCount="indefinite"/>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
