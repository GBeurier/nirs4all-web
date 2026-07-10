import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import {
  NIRS4ALL_BRANDS,
  generateNirs4allBrandSvg,
  getNirs4allBrandAssetPath,
  getNirs4allBrandDefinition,
  isNirs4allBrandId,
  listNirs4allBrands,
} from "./index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorPath = resolve(repositoryRoot, "scripts/generate-brand-assets.mjs");

interface GeneratorBrand {
  id: string;
  name: string;
  shortName: string;
  role: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    dark: string;
    surface: string;
  };
}

function readGeneratorBrands(): GeneratorBrand[] {
  const source = readFileSync(generatorPath, "utf8");
  const match = source.match(/const brands = (\[[\s\S]*?\]);\n\nfunction escapeXml/);
  if (!match?.[1]) {
    throw new Error("Unable to locate brand definitions in generate-brand-assets.mjs");
  }
  return vm.runInNewContext(`(${match[1]})`) as GeneratorBrand[];
}

describe("nirs4all-ui/brand", () => {
  it("publishes the expected reusable brand definitions", () => {
    expect(listNirs4allBrands().map((brand) => brand.id)).toEqual([
      "nirs4all",
      "nirs4all-core",
      "nirs4all-ui",
      "nirs4all-providers",
      "nirs4all-quality",
    ]);
    expect(isNirs4allBrandId("nirs4all-core")).toBe(true);
    expect(isNirs4allBrandId("unknown")).toBe(false);
    expect(getNirs4allBrandDefinition("nirs4all-ui").role).toBe("Reusable visual system");
    expect(getNirs4allBrandDefinition("nirs4all-quality").tags).toContain("lab");
  });

  it("keeps every declared brand asset present in the package", () => {
    for (const brand of NIRS4ALL_BRANDS) {
      for (const variant of ["icon", "horizontal", "stacked"] as const) {
        const path = getNirs4allBrandAssetPath(brand, variant);
        const asset = readFileSync(resolve(repositoryRoot, path), "utf8");
        expect(path).toBe(`assets/brands/${brand.id}/${variant}.svg`);
        expect(asset).toContain("<svg");
        expect(asset).toContain(brand.name);
      }
    }
  });

  it("keeps generated brand assets and mirrored definitions in sync", () => {
    execFileSync(process.execPath, [generatorPath, "--check"], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });

    const generatorBrands = readGeneratorBrands();
    expect(generatorBrands.map((brand) => brand.id)).toEqual(NIRS4ALL_BRANDS.map((brand) => brand.id));

    for (const generatorBrand of generatorBrands) {
      if (!isNirs4allBrandId(generatorBrand.id)) {
        throw new Error(`Unknown generator brand id: ${generatorBrand.id}`);
      }
      const packageBrand = getNirs4allBrandDefinition(generatorBrand.id);
      expect({
        id: packageBrand.id,
        name: packageBrand.name,
        shortName: packageBrand.shortName,
        role: packageBrand.role,
        palette: packageBrand.palette,
      }).toEqual(generatorBrand);
    }
  });

  it("generates deterministic inline svg marks", () => {
    const horizontal = generateNirs4allBrandSvg("nirs4all-core");
    const icon = generateNirs4allBrandSvg("nirs4all-ui", { variant: "icon", animated: true });
    const stacked = generateNirs4allBrandSvg("nirs4all-providers", { variant: "stacked", dark: true });
    const animatedHorizontal = generateNirs4allBrandSvg("nirs4all-core", {
      variant: "horizontal",
      animated: true,
    });

    expect(horizontal).toContain("nirs4all-core");
    expect(horizontal).toContain("Portable aggregate runtime");
    expect(icon).toContain("repeatCount=\"indefinite\"");
    expect(icon).toContain("id=\"nirs4all-ui-icon-wave\"");
    expect(icon).toContain("stroke-dasharray=\"42 38\"");
    expect(icon).not.toContain("href=\"#icon-wave\"");
    expect(animatedHorizontal).toContain("id=\"nirs4all-core-horizontal-wave\"");
    expect(stacked).toContain("#ffffff");
  });
});
