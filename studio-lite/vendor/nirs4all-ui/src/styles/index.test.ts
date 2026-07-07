import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NIRS4ALL_CSS_TOKENS,
  NIRS4ALL_STYLE_ASSETS,
  getNirs4allCssVariable,
  getNirs4allStyleAsset,
} from "./index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("nirs4all-ui/styles", () => {
  it("declares shipped style and motion assets", () => {
    expect(NIRS4ALL_STYLE_ASSETS.map((asset) => asset.id)).toEqual([
      "default-theme",
      "spectra-motion",
    ]);
    expect(getNirs4allStyleAsset("default-theme").packageExport)
      .toBe("nirs4all-ui/assets/styles/nirs4all-default.css");
  });

  it("keeps declared visual assets present and usable", () => {
    for (const asset of NIRS4ALL_STYLE_ASSETS) {
      const content = readFileSync(resolve(repositoryRoot, asset.path), "utf8");
      expect(content.length).toBeGreaterThan(200);
      expect(content).toContain(asset.kind === "css" ? "--n4-color-primary" : "<svg");
    }
  });

  it("exposes stable CSS token names", () => {
    expect(NIRS4ALL_CSS_TOKENS).toContain("n4-color-primary");
    expect(getNirs4allCssVariable("n4-radius")).toBe("var(--n4-radius)");
  });
});
