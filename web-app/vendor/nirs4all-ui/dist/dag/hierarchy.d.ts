/**
 * Group hierarchy derived from node `group` paths.
 *
 * A DAG is not a tree, but nodes carry a hierarchical *group* path (e.g.
 * `["branch:b0"]`). Those paths form a nesting tree of clusters that the viewer
 * can collapse/expand independently of the edge topology. This module turns the
 * flat node list into that cluster tree; everything here is pure and testable.
 */
import type { DagGraph } from "./types.js";
export interface DagGroup {
    /** Stable id = the group path joined by `/`. */
    id: string;
    /** Innermost segment — what the frame header shows. */
    label: string;
    path: readonly string[];
    /** 0 = top-level cluster. */
    depth: number;
    parent: string | null;
    children: string[];
    /** Leaf node ids whose innermost group is exactly this one. */
    memberIds: string[];
    /** Total leaf nodes anywhere under this cluster. */
    descendantLeafCount: number;
}
export interface DagHierarchy {
    groups: Map<string, DagGroup>;
    /** Top-level group ids, in first-seen order. */
    roots: string[];
    /** node id → innermost group id (or `null` for a top-level node). */
    nodeGroupId: Map<string, string | null>;
    /** Deepest group depth present (−1 when the graph is flat). */
    maxDepth: number;
}
/** Build the cluster tree for a graph. O(nodes × path depth). */
export declare function buildHierarchy(graph: DagGraph): DagHierarchy;
/** Ancestor group ids for a node, innermost → outermost. */
export declare function ancestorGroupIds(hierarchy: DagHierarchy, nodeId: string): string[];
//# sourceMappingURL=hierarchy.d.ts.map