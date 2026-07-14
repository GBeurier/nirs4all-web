/**
 * Chrome strings for {@link file://./DagGraphView.tsx DagGraphView}.
 *
 * Presentational text only — node/kind labels come from the data. Hosts pass a
 * partial `labels` override to localize; defaults are concise English.
 */
export const DEFAULT_DAG_LABELS = {
    title: "Compiled graph",
    search: "Search nodes…",
    fit: "Fit to view",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    direction: "Orientation",
    depth: "Depth",
    nodesVisible: "nodes",
    edges: "edges",
    legend: "Legend",
    close: "Close",
    emptyGraph: "Empty graph",
    group: "Cluster",
    contains: "leaf nodes",
    shapes: "Shapes",
    shape: "Shape",
    shapeIn: "in",
    shapeOut: "out",
};
export function resolveLabels(overrides) {
    return overrides ? { ...DEFAULT_DAG_LABELS, ...overrides } : DEFAULT_DAG_LABELS;
}
//# sourceMappingURL=locale.js.map