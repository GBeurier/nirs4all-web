import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { round } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";
const NODE_COLORS = {
    data: N4_VIZ_COLORS.slate,
    split: N4_VIZ_COLORS.indigo,
    preprocess: N4_VIZ_COLORS.cyan,
    model: N4_VIZ_COLORS.teal,
    merge: N4_VIZ_COLORS.green,
    branch: N4_VIZ_COLORS.amber,
};
const STATUS_COLORS = {
    idle: N4_VIZ_COLORS.slate,
    running: N4_VIZ_COLORS.amber,
    done: N4_VIZ_COLORS.green,
    failed: N4_VIZ_COLORS.rose,
};
function defaultNodeColor(type) {
    return NODE_COLORS[type];
}
function fmtMetric(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
/**
 * Read-only vertical pipeline / DAG view — a simplified spine of the Studio
 * pipeline editor, Web CanvasFlow, and Inspector BranchTopology. Each step is a
 * card connected top→down; pure inline SVG, no interaction or layout engine.
 */
export function PipelineFlow({ nodes, width = 300, height, title = "Pipeline", className, nodeColor = defaultNodeColor, }) {
    const rowH = 84;
    const cardH = 60;
    const marginTop = 12;
    const cardX = 18;
    const cardW = Math.max(0, width - 36);
    const spineX = width / 2;
    const resolvedHeight = height ?? nodes.length * rowH + 24;
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-pipeline", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), nodes.map((node, i) => {
                if (i === 0)
                    return null;
                const prevBottom = marginTop + (i - 1) * rowH + cardH;
                const currentTop = marginTop + i * rowH;
                return (_jsx("line", { className: "n4viz-edge", x1: round(spineX), x2: round(spineX), y1: round(prevBottom), y2: round(currentTop) }, `edge-${node.id}`));
            }), nodes.map((node, i) => {
                const color = nodeColor(node.type);
                const cardY = marginTop + i * rowH;
                const cardRight = cardX + cardW;
                return (_jsxs("g", { className: "n4viz-node", "data-node-type": node.type, children: [_jsx("rect", { className: "n4viz-node-card", x: round(cardX), y: round(cardY), width: round(cardW), height: cardH, rx: 10, fill: `color-mix(in srgb, ${color} 12%, transparent)`, stroke: color, strokeOpacity: 0.7 }), _jsx("rect", { className: "n4viz-node-accent", x: round(cardX), y: round(cardY + 10), width: 4, height: cardH - 20, rx: 2, fill: color }), _jsx("text", { className: "n4viz-node-label", x: round(cardX + 16), y: round(cardY + 24), children: node.label }), node.detail ? (_jsx("text", { className: "n4viz-node-detail", x: round(cardX + 16), y: round(cardY + 42), children: node.detail })) : null, node.status ? (_jsx("circle", { className: "n4viz-node-status", "data-status": node.status, cx: round(cardRight - 14), cy: round(cardY + 14), r: 5, fill: STATUS_COLORS[node.status] })) : null, node.metric != null ? (_jsxs("g", { className: "n4viz-node-metric", children: [_jsx("rect", { x: round(cardRight - 58), y: round(cardY + 30), width: 46, height: 18, rx: 5, fill: `color-mix(in srgb, ${color} 18%, transparent)` }), _jsx("text", { className: "n4viz-node-metric-value", x: round(cardRight - 35), y: round(cardY + 43), textAnchor: "middle", children: fmtMetric(node.metric) })] })) : null, node.variants != null && node.variants > 1 ? (_jsxs("text", { className: "n4viz-badge", x: round(cardRight - 12), y: round(cardY + cardH - 10), textAnchor: "end", children: ["\u00D7", node.variants] })) : null] }, node.id));
            })] }));
}
//# sourceMappingURL=PipelineFlow.js.map