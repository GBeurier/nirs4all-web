/**
 * Collapse a graph against a set of collapsed group ids → the *effective* graph
 * actually drawn.
 *
 * Collapsing a cluster hides all of its leaf nodes and replaces them with a
 * single super-node; every edge that crossed the cluster boundary is re-routed
 * to that super-node, and edges fully inside a collapsed cluster disappear. This
 * is what keeps a 6000-node graph readable: the effective graph shrinks to the
 * clusters the user has chosen to open. Pure + testable — no layout, no React.
 */
import { type DagCategory, type DagEdgeKind, type DagGraph, type DagShape } from "./types.js";
import type { DagHierarchy } from "./hierarchy.js";
/** Prefix distinguishing a collapsed-group super-node id from a real node id. */
export declare const GROUP_NODE_PREFIX = "grp:";
export interface EffNode {
    id: string;
    isGroup: boolean;
    category: DagCategory;
    label: string;
    detail?: string;
    kind?: string;
    status?: DagGraph["nodes"][number]["status"];
    variants?: number;
    metric?: number;
    /** Innermost still-visible (expanded) group containing this node, or `null`. */
    containerId: string | null;
    /** Super-nodes only: number of leaf nodes hidden inside. */
    childCount?: number;
    /** Super-nodes only: the collapsed group id (drop `GROUP_NODE_PREFIX`). */
    groupId?: string;
    /** Real nodes only: dataset shape leaving this node. */
    outShape?: DagShape;
    /** Real nodes only: dataset shapes arriving at this node. */
    inShapes?: readonly DagShape[];
}
export interface EffEdge {
    id: string;
    source: string;
    target: string;
    kind?: DagEdgeKind;
    oof: boolean;
    /** Number of underlying edges merged into this one. */
    weight: number;
    /** Shape flowing on the wire (the source node's output shape). */
    shape?: DagShape;
}
export interface EffectiveGraph {
    nodes: EffNode[];
    edges: EffEdge[];
}
/**
 * Compute the effective (collapsed) graph. `collapsed` holds group ids from the
 * {@link DagHierarchy}; an empty set returns the fully-expanded graph.
 */
export declare function computeEffectiveGraph(graph: DagGraph, hierarchy: DagHierarchy, collapsed: ReadonlySet<string>): EffectiveGraph;
/** Last `.`/`:`/`/` segment of an id — a readable fallback node label. */
export declare function shortLabel(id: string): string;
/**
 * Collapse every cluster at exactly `depth` (deeper ones are hidden inside them,
 * so they need not be listed). `depth < 0` or `depth > maxDepth` → fully
 * expanded. This is the primitive behind the depth stepper and expand/collapse
 * all.
 */
export declare function collapseAtDepth(hierarchy: DagHierarchy, depth: number): Set<string>;
export interface DefaultCollapseOptions {
    /** Force a specific collapse depth instead of auto-fitting. */
    depth?: number;
    /** Auto-fit target for the initial visible node count (default 160). */
    targetVisible?: number;
}
/**
 * Choose an initial collapse state. With an explicit `depth`, collapse to it.
 * Otherwise pick the most-expanded depth whose visible node count still fits
 * under `targetVisible` — so a small graph opens fully and a 6000-node graph
 * opens as a handful of clusters.
 */
export declare function defaultCollapsed(hierarchy: DagHierarchy, totalNodes: number, options?: DefaultCollapseOptions): {
    collapsed: Set<string>;
    depth: number;
};
//# sourceMappingURL=collapse.d.ts.map