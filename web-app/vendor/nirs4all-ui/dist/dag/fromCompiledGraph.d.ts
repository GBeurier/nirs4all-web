/**
 * Adapter: a dag-ml compiled `GraphSpec` / `ExecutionPlan` → {@link DagGraph}.
 *
 * The package does NOT depend on dag-ml; this reads the *serialized* compiled
 * graph (the JSON a host already has) and projects the fields the viewer needs.
 * It is defensive because this is a real system boundary — arbitrary JSON in,
 * a well-typed view-model out. Unknown / malformed entries are skipped, never
 * thrown on. Recognized inputs:
 *   • `ExecutionPlan`  → uses `graph_plan.graph`, plus `variants[]` for badges
 *   • `{ graph: GraphSpec }`
 *   • `GraphSpec`      → `{ nodes, edges }`
 *
 * Group nesting is derived from the dag-ml node-id convention
 * (`branch:b0.model:ridge` → cluster `branch:b0`), or from `seed_label`.
 */
import type { DagGraph } from "./types.js";
/** How collapsible clusters are derived from the compiled graph. */
export type GroupBy = "id" | "seed_label" | "none";
export interface FromCompiledGraphOptions {
    /** Cluster derivation strategy (default `"id"`). */
    groupBy?: GroupBy;
    /** Show a `×N` variant badge on generator/tuner nodes (default `true`). */
    variantBadges?: boolean;
}
/** Project a serialized dag-ml compiled graph into the viewer's contract. */
export declare function fromCompiledGraph(input: unknown, options?: FromCompiledGraphOptions): DagGraph;
//# sourceMappingURL=fromCompiledGraph.d.ts.map