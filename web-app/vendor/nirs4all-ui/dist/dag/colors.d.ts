/**
 * Category → color mapping for the DAG viewer.
 *
 * Reuses the canonical nirs4all `viz` teal system as the single source of truth
 * (same hues as {@link file://../viz/PipelineFlow.tsx PipelineFlow}), so the DAG
 * view sits inside the existing design language rather than introducing a new
 * one. The adjacent-pair palette is CVD-validated; identity is never carried by
 * color alone — every node also shows its kind label and every category appears
 * in the legend. Hosts may retheme any slot via the `colors` prop.
 */
import type { DagCategory, DagEdgeKind } from "./types.js";
export declare const DAG_CATEGORY_COLORS: Readonly<Record<DagCategory, string>>;
/** Human-facing category labels for the legend. */
export declare const DAG_CATEGORY_LABELS: Readonly<Record<DagCategory, string>>;
/** Edge accent by semantic kind (mixed into the recessive base stroke). */
export declare const DAG_EDGE_COLORS: Readonly<Record<DagEdgeKind, string>>;
/** Resolve a category color, honoring per-host overrides. */
export declare function categoryColor(category: DagCategory, overrides?: Partial<Record<DagCategory, string>>): string;
//# sourceMappingURL=colors.d.ts.map