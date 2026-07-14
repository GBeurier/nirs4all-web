/** One step in a nirs4all pipeline / DAG spine. */
export interface PipelineNode {
    id: string;
    label: string;
    type: "data" | "split" | "preprocess" | "model" | "merge" | "branch";
    detail?: string;
    metric?: number;
    status?: "idle" | "running" | "done" | "failed";
    variants?: number;
}
export interface PipelineFlowProps {
    /** Steps rendered top → down as a single-column spine. */
    nodes: readonly PipelineNode[];
    width?: number;
    /** Defaults to `nodes.length * 84 + 24`. */
    height?: number;
    title?: string;
    className?: string;
    /** Override the per-type accent color. */
    nodeColor?: (type: PipelineNode["type"]) => string;
}
/**
 * Read-only vertical pipeline / DAG view — a simplified spine of the Studio
 * pipeline editor, Web CanvasFlow, and Inspector BranchTopology. Each step is a
 * card connected top→down; pure inline SVG, no interaction or layout engine.
 */
export declare function PipelineFlow({ nodes, width, height, title, className, nodeColor, }: PipelineFlowProps): import("react").JSX.Element;
//# sourceMappingURL=PipelineFlow.d.ts.map