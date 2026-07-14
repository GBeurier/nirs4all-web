import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { buildFrame, linearFit, makeScale, niceExtent, round, ticks, } from "./geometry.js";
import { N4_PARTITION_COLORS, N4_VIZ_COLORS } from "./theme.js";
function pointColor(point) {
    if (point.color)
        return point.color;
    if (point.partition)
        return N4_PARTITION_COLORS[point.partition];
    return N4_VIZ_COLORS.teal;
}
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
/**
 * Predicted-vs-observed (parity) scatter with a dashed identity line and an
 * optional regression fit — the core regression-diagnostic chart from Studio's
 * Inspector and the Web results view. Pure inline SVG; hosts pass points and
 * (optionally) precomputed metrics.
 */
export function PredictionScatter({ points, width = 320, height = 320, padding, identityLine = true, regressionLine = false, metrics, pointRadius = 3, pointOpacity = 0.7, xLabel = "Observed", yLabel = "Predicted", title = "Predicted vs observed", className, children, }) {
    const frame = buildFrame(width, height, padding);
    const { top, left } = frame.padding;
    const bottom = top + frame.innerHeight;
    const right = left + frame.innerWidth;
    const actuals = points.map((p) => p.actual);
    const predicted = points.map((p) => p.predicted);
    const domain = niceExtent([...actuals, ...predicted], 0.06);
    const xScale = makeScale(domain, left, right);
    const yScale = makeScale(domain, bottom, top);
    const axisTicks = ticks(domain, 5);
    const fit = regressionLine ? linearFit(actuals, predicted) : null;
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-scatter", className), viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), axisTicks.map((t) => (_jsxs("g", { children: [_jsx("line", { className: "n4viz-grid", x1: left, x2: right, y1: round(yScale(t)), y2: round(yScale(t)) }), _jsx("line", { className: "n4viz-grid", x1: round(xScale(t)), x2: round(xScale(t)), y1: top, y2: bottom })] }, `grid-${t}`))), identityLine ? (_jsx("line", { className: "n4viz-reference n4viz-identity", x1: round(xScale(domain.min)), y1: round(yScale(domain.min)), x2: round(xScale(domain.max)), y2: round(yScale(domain.max)), stroke: N4_VIZ_COLORS.slate, strokeDasharray: "5 4", strokeWidth: 1.4 })) : null, fit ? (_jsx("line", { className: "n4viz-reference n4viz-fit", x1: round(xScale(domain.min)), y1: round(yScale(fit.slope * domain.min + fit.intercept)), x2: round(xScale(domain.max)), y2: round(yScale(fit.slope * domain.max + fit.intercept)), stroke: N4_VIZ_COLORS.indigo, strokeWidth: 1.8 })) : null, points.map((p, i) => (_jsx("circle", { className: "n4viz-dot", cx: round(xScale(p.actual)), cy: round(yScale(p.predicted)), r: pointRadius, fill: pointColor(p), fillOpacity: pointOpacity }, p.label ?? i))), _jsx("line", { className: "n4viz-axis", x1: left, x2: right, y1: bottom, y2: bottom }), _jsx("line", { className: "n4viz-axis", x1: left, x2: left, y1: top, y2: bottom }), axisTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: round(xScale(t)), y: bottom + 15, textAnchor: "middle", children: fmt(t) }, `tx-${t}`))), axisTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: left - 6, y: round(yScale(t)) + 3, textAnchor: "end", children: fmt(t) }, `ty-${t}`))), _jsx("text", { className: "n4viz-axis-label", x: left + frame.innerWidth / 2, y: height - 2, textAnchor: "middle", children: xLabel }), _jsx("text", { className: "n4viz-axis-label", transform: `translate(11 ${top + frame.innerHeight / 2}) rotate(-90)`, textAnchor: "middle", children: yLabel }), metrics ? (_jsxs("text", { className: "n4viz-badge", x: right, y: top + 12, textAnchor: "end", children: [metrics.r2 != null ? `R² ${fmt(metrics.r2)}` : "", metrics.r2 != null && metrics.rmse != null ? "  ·  " : "", metrics.rmse != null ? `RMSE ${fmt(metrics.rmse)}` : ""] })) : null, children] }));
}
//# sourceMappingURL=PredictionScatter.js.map