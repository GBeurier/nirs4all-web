/**
 * Dataset-shape helpers for the DAG viewer — pure view-model logic, no runtime
 * execution (same class of helper as `dataset/buildDatasetPreview`).
 *
 * `deriveShapes` propagates an entry dataset shape through the graph so the
 * viewer can show what arrives at and leaves every node — the "imagine we feed
 * the pipeline a (multimodal) dataset" view. Transform semantics are per-category
 * *display heuristics* (overridable); when a host has authoritative shapes (from
 * a materialized dag-ml plan) it sets `node.io` directly and those win.
 */
import { type DagCategory, type DagGraph, type DagNode, type DagShape } from "./types.js";
export type ShapeChangeKind = "none" | "rows-up" | "rows-down" | "feat-up" | "feat-down" | "predict" | "join";
/** Glyph + tone used to badge a node whose output shape changes. */
export declare const SHAPE_CHANGE_STYLE: Readonly<Record<ShapeChangeKind, {
    glyph: string;
    tone: string;
}>>;
/** Compact human count: 2048 → "2048", 12000 → "12k", 1.2e6 → "1.2M". */
export declare function formatCount(n: number | undefined): string;
/** Compact one-line shape, e.g. "240×2048", "240×2060 ·2src", "240×1 ŷ". */
export declare function formatShape(shape: DagShape | undefined): string;
/** Classify how a node's output shape differs from its inputs. */
export declare function shapeChange(inputs: readonly DagShape[], out: DagShape | undefined): ShapeChangeKind;
/** One-line human delta for the inspector, or null when nothing changes. */
export declare function describeShapeDelta(inputs: readonly DagShape[], out: DagShape | undefined): string | null;
export interface ShapeRuleContext {
    node: DagNode;
    category: DagCategory;
    /** Output shapes of the node's predecessors (its inputs). */
    inputs: DagShape[];
    /** Entry shape for a root/source node, if one was provided. */
    entry: DagShape | undefined;
}
export type ShapeRule = (ctx: ShapeRuleContext) => DagShape | undefined;
export interface DeriveShapesOptions {
    /** Entry dataset shape for source/root nodes, keyed by node id. */
    entries?: Readonly<Record<string, DagShape>>;
    /** Override the display heuristic for a category. */
    rules?: Partial<Record<DagCategory, ShapeRule>>;
}
/**
 * Fill `io.in` / `io.out` on every node by propagating entry shapes through the
 * graph in topological order. Nodes that already carry `io.out` are treated as
 * authoritative and are not recomputed. Cycles are tolerated (their nodes are
 * processed last). Returns a new graph; the input is not mutated.
 */
export declare function deriveShapes(graph: DagGraph, options?: DeriveShapesOptions): DagGraph;
//# sourceMappingURL=shape.d.ts.map