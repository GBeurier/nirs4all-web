/**
 * Layered ("Sugiyama-light") layout for the effective graph.
 *
 * Three pure passes — longest-path layering (cycle-safe), barycenter crossing
 * reduction, then coordinate assignment — plus cluster frame boxes derived from
 * the group hierarchy. O(V + E) per pass, so it stays cheap even when a user
 * expands several thousand nodes. No DOM, no React: given the same effective
 * graph it always returns the same geometry, which is what makes it memoizable
 * across pan/zoom and unit-testable.
 */
import type { DagDirection } from "./types.js";
import type { EffEdge, EffectiveGraph, EffNode } from "./collapse.js";
import type { DagHierarchy } from "./hierarchy.js";
export interface DagLayoutNode {
    node: EffNode;
    x: number;
    y: number;
    w: number;
    h: number;
    layer: number;
    order: number;
}
export interface DagLayoutEdge {
    edge: EffEdge;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    path: string;
    /** True when the edge runs against the rank direction (part of a cycle). */
    back: boolean;
}
export interface DagLayoutFrame {
    id: string;
    label: string;
    depth: number;
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface DagLayout {
    nodes: DagLayoutNode[];
    edges: DagLayoutEdge[];
    frames: DagLayoutFrame[];
    width: number;
    height: number;
    direction: DagDirection;
    nodeW: number;
    nodeH: number;
}
export interface LayoutOptions {
    direction: DagDirection;
    hierarchy?: DagHierarchy;
}
export declare function layoutDag(eff: EffectiveGraph, opts: LayoutOptions): DagLayout;
//# sourceMappingURL=layout.d.ts.map