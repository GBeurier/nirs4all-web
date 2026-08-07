/**
 * Shared radial geometry for the chain sunburst / hub navigators.
 *
 * Pure, framework-free SVG path + angle helpers, so {@link ChainNodeOrbit} and
 * {@link ChainNodeHub} render from one tested source.
 */
import type { FlowNode } from "./types.js";
export declare const TAU: number;
/** 12 o'clock — where every ring starts, sweeping clockwise. */
export declare const START: number;
/** Cartesian point on a circle of radius `r` at `angle` (radians). */
export declare function polar(cx0: number, cy0: number, r: number, angle: number): [number, number];
/** Donut segment between two radii and two angles (clockwise). */
export declare function annularSector(cx0: number, cy0: number, rInner: number, rOuter: number, a0: number, a1: number): string;
/** Full pie slice from the centre to `rOuter`. */
export declare function pieSector(cx0: number, cy0: number, rOuter: number, a0: number, a1: number): string;
/** Deepest level with nodes in a flow tree. */
export declare function treeDepth(nodes: readonly FlowNode[]): number;
/** Tangential label rotation (degrees) at a mid-angle, flipped to stay upright. */
export declare function labelRotation(mid: number): number;
//# sourceMappingURL=radial.d.ts.map