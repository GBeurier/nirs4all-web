import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

describe("nirs4all-ui/brand", () => {
  it("publishes the expected reusable brand definitions", () => {
    expect(listNirs4allBrands().map((brand) => brand.id)).toEqual([
      "nirs4all",
      "nirs4all-core",
      "nirs4all-ui",
      "nirs4all-providers",
    ]);
    expect(isNirs4allBrandId("nirs4all-core")).toBe(true);
    expect(isNirs4allBrandId("unknown")).toBe(false);
    expect(getNirs4allBrandDefinition("nirs4all-ui").role).toBe("Reusable visual system");
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

  it("generates deterministic inline svg marks", () => {
    const horizontal = generateNirs4allBrandSvg("nirs4all-core");
    const icon = generateNirs4allBrandSvg("nirs4all-ui", { variant: "icon", animated: true });
    const stacked = generateNirs4allBrandSvg("nirs4all-providers", { variant: "stacked", dark: true });

    expect(horizontal).toContain("nirs4all-core");
    expect(horizontal).toContain("Portable aggregate runtime");
    expect(icon).toContain("repeatCount=\"indefinite\"");
    expect(stacked).toContain("#ffffff");
  });
});
