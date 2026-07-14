import { type DagViewLabels } from "./locale.js";
import { type DagCategory, type DagDirection, type DagGraph } from "./types.js";
export interface DagGraphViewProps {
    /** Compiled graph in view-model form (see `fromCompiledGraph`). */
    graph: DagGraph;
    /** Stage width in px (the SVG viewport). Default 960. */
    width?: number;
    /** Stage height in px. Default 620. */
    height?: number;
    /** Initial orientation. Default `"LR"`. */
    direction?: DagDirection;
    /** Force an initial collapse depth; omit to auto-fit to a readable size. */
    initialCollapseDepth?: number;
    title?: string;
    className?: string;
    /** Per-category color overrides. */
    colors?: Partial<Record<DagCategory, string>>;
    /** Fired when a leaf node is selected (or deselected with `null`). */
    onSelectNode?: (id: string | null) => void;
    showMinimap?: boolean;
    showLegend?: boolean;
    showInspector?: boolean;
    /** Start with dataset-shape annotations on (when the graph carries shapes). Default true. */
    showShapes?: boolean;
    labels?: Partial<DagViewLabels>;
}
/**
 * Interactive viewer for a compiled DAG-ML graph of any size. Layered layout,
 * pan / zoom, viewport culling and level-of-detail keep it responsive; the
 * group hierarchy makes it readable at thousands of nodes by collapsing whole
 * clusters into a single super-node. Presentational: local UI state only, no
 * app state / IO / runtime execution.
 */
export declare function DagGraphView({ graph, width, height, direction: directionProp, initialCollapseDepth, title, className, colors, onSelectNode, showMinimap, showLegend, showInspector, showShapes, labels: labelsProp, }: DagGraphViewProps): import("react").JSX.Element;
//# sourceMappingURL=DagGraphView.d.ts.map