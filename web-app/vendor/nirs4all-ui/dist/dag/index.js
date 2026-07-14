/**
 * nirs4all-ui `dag` domain — the interactive compiled-DAG viewer.
 *
 * A dedicated, self-contained component for exploring a *compiled* DAG-ML graph
 * (or any bound variant) at any scale: layered layout, pan / zoom, viewport
 * culling and level-of-detail keep thousands of nodes responsive, while a
 * collapsible group hierarchy keeps a 5–6000-node graph readable. Unlike the
 * `viz` `PipelineFlow` (a small editable spine), this is a read-only *explorer*
 * of the whole graph.
 *
 * Same package boundary as the rest of nirs4all-ui: presentational + local UI
 * state only — NO app state, routing, network/IO, or runtime execution. Hosts
 * pass a {@link DagGraph} (adapt a real compiled graph with
 * {@link fromCompiledGraph}). A default stylesheet ships at
 * `nirs4all-ui/assets/dag.css`.
 *
 * Consumed as `nirs4all-ui/dag`.
 */
// --- view-model contract + kind → category mapping ---
export * from "./types.js";
// --- palette + adapter ---
export * from "./colors.js";
export * from "./fromCompiledGraph.js";
// --- dataset-shape annotations ---
export { deriveShapes, formatShape, formatCount, shapeChange, describeShapeDelta, SHAPE_CHANGE_STYLE, } from "./shape.js";
export { DEFAULT_DAG_LABELS, resolveLabels } from "./locale.js";
// --- pure engine (reusable by hosts / tests) ---
export { buildHierarchy, ancestorGroupIds, } from "./hierarchy.js";
export { computeEffectiveGraph, collapseAtDepth, defaultCollapsed, shortLabel, GROUP_NODE_PREFIX, } from "./collapse.js";
export { layoutDag, } from "./layout.js";
// --- the component ---
export { DagGraphView } from "./DagGraphView.js";
//# sourceMappingURL=index.js.map