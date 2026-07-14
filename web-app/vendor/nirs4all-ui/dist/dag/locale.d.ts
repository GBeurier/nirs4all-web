/**
 * Chrome strings for {@link file://./DagGraphView.tsx DagGraphView}.
 *
 * Presentational text only — node/kind labels come from the data. Hosts pass a
 * partial `labels` override to localize; defaults are concise English.
 */
export interface DagViewLabels {
    title: string;
    search: string;
    fit: string;
    zoomIn: string;
    zoomOut: string;
    expandAll: string;
    collapseAll: string;
    direction: string;
    depth: string;
    nodesVisible: string;
    edges: string;
    legend: string;
    close: string;
    emptyGraph: string;
    group: string;
    contains: string;
    shapes: string;
    shape: string;
    shapeIn: string;
    shapeOut: string;
}
export declare const DEFAULT_DAG_LABELS: DagViewLabels;
export declare function resolveLabels(overrides?: Partial<DagViewLabels>): DagViewLabels;
//# sourceMappingURL=locale.d.ts.map