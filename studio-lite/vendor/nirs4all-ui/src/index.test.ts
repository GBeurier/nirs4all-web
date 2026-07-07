import { describe, expect, it } from "vitest";

import * as root from "./index.js";

describe("nirs4all-ui root barrel", () => {
  it("exposes reusable UI, view-model, brand, and style namespaces", () => {
    expect(typeof root.components.DatasetPreviewCard).toBe("function");
    expect(typeof root.dataset.buildDatasetPreview).toBe("function");
    expect(typeof root.runtime.buildRuntimeResultStatusView).toBe("function");
    expect(typeof root.score.formatMetricValue).toBe("function");
    expect(root.brand.NIRS4ALL_BRANDS.length).toBeGreaterThanOrEqual(4);
    expect(root.styles.NIRS4ALL_STYLE_ASSETS.map((asset) => asset.id)).toContain("default-theme");
  });
});
