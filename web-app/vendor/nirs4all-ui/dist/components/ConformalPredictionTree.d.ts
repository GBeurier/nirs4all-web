import type { ReactNode } from "react";
import { type Extent } from "../viz/geometry.js";
import type { ConformalGuaranteeView, ConformalIntervalSummaryRow, ConformalPredictionIntervalCell, ConformalPredictionRow } from "../conformal/result.js";
export type ConformalTreeGroupMode = "conformance" | "uncertainty" | "none";
export type ConformalTierTone = "success" | "warning" | "danger" | "neutral";
/** One prediction, projected onto its conformance / uncertainty coordinates. */
export interface ConformalTreeSample {
    index: number;
    sampleId: string | null;
    prediction: number;
    predictionLabel: string;
    actual: number | null;
    /** Width of the target-coverage interval (falls back to the widest band). */
    targetWidth: number | null;
    widestWidth: number;
    coveredAtTarget: boolean | null;
    /** Smallest coverage level whose interval still contains the truth. */
    tightestCovering: number | null;
    intervals: readonly ConformalPredictionIntervalCell[];
}
export interface ConformalTreeTier {
    id: string;
    label: string;
    description: string;
    tone: ConformalTierTone;
    samples: ConformalTreeSample[];
    count: number;
    share: number;
    meanWidth: number | null;
}
export interface ConformalTreeModel {
    tiers: ConformalTreeTier[];
    coverages: number[];
    domain: Extent;
    target: number;
    total: number;
    hasActuals: boolean;
    groupBy: ConformalTreeGroupMode;
}
export interface BuildConformalTreeOptions {
    actuals?: readonly (number | null | undefined)[] | undefined;
    targetCoverage?: number | null | undefined;
    groupBy?: "auto" | ConformalTreeGroupMode | undefined;
}
/**
 * Project calibrated prediction rows into a grouped, nesting-aware tree model —
 * the pure view-model behind {@link ConformalPredictionTree}. Grouping is by
 * where the truth falls within the nested intervals (conformance) when ground
 * truth is present, otherwise by interval width (uncertainty).
 */
export declare function buildConformalTreeModel(rows: readonly ConformalPredictionRow[], options?: BuildConformalTreeOptions): ConformalTreeModel;
export interface ConformalPredictionTreeProps {
    rows: readonly ConformalPredictionRow[];
    /** Ground-truth values aligned to `rows` — enables conformance grouping + scoring. */
    actuals?: readonly (number | null | undefined)[];
    /** Materialized interval summaries (qhat per coverage) for the leaf rows. */
    summaries?: readonly ConformalIntervalSummaryRow[];
    guarantee?: ConformalGuaranteeView | null;
    targetCoverage?: number | null;
    groupBy?: "auto" | ConformalTreeGroupMode;
    unit?: string;
    defaultOpenTiers?: boolean;
    maxSamplesPerTier?: number;
    glyphWidth?: number;
    className?: string;
    empty?: ReactNode;
}
/**
 * Calibrated **predictions as a nested conformance tree** — the drill-down
 * companion to {@link file://../viz/ConformalIntervalStrip.tsx ConformalIntervalStrip}.
 * Predictions are grouped into conformance tiers (where the truth lands inside
 * the nested intervals) or uncertainty tiers (interval width), each tier opening
 * into per-sample nodes that carry a nesting glyph, and each sample opening into
 * its per-coverage interval rows. Presentational + local `<details>` state only;
 * hosts pass `conformal` view-model rows. Default styles ship at
 * `nirs4all-ui/assets/conformal.css`.
 */
export declare function ConformalPredictionTree({ rows, actuals, summaries, guarantee, targetCoverage, groupBy, unit, defaultOpenTiers, maxSamplesPerTier, glyphWidth, className, empty, }: ConformalPredictionTreeProps): import("react").JSX.Element;
//# sourceMappingURL=ConformalPredictionTree.d.ts.map