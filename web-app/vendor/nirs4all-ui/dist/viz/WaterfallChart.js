import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { makeScale, niceExtent, round, ticks } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";
function defaultFormat(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
function signed(value, format) {
    if (!Number.isFinite(value))
        return "—";
    return value > 0 ? `+${format(value)}` : format(value);
}
function truncate(label, max = 15) {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
/**
 * Per-sample SHAP waterfall — the Studio Variable-Importance waterfall. Each
 * feature contribution is a floating horizontal bar from the running total,
 * green when it pushes the prediction up and rose when down, walking from the
 * base value to the prediction. A dashed base reference and a solid prediction
 * reference frame the walk. Pure inline SVG; hosts pass precomputed SHAP values.
 */
export function WaterfallChart({ baseValue, contributions, predicted, topN = 10, valueFormat = defaultFormat, width = 440, height, title = "SHAP waterfall", className, }) {
    const sumAll = contributions.reduce((s, c) => s + (Number.isFinite(c.value) ? c.value : 0), 0);
    const resolvedPredicted = predicted ?? baseValue + sumAll;
    const keep = Math.max(0, Math.trunc(topN));
    const indexed = contributions.map((c, i) => ({ c, i }));
    const keptIndices = new Set([...indexed]
        .sort((a, b) => Math.abs(b.c.value) - Math.abs(a.c.value))
        .slice(0, keep)
        .map((x) => x.i));
    const kept = indexed.filter((x) => keptIndices.has(x.i)).map((x) => x.c);
    const resolvedHeight = height ?? Math.max(180, kept.length * 30 + 70);
    const padLeft = 100;
    const padRight = 48;
    const padTop = 26;
    const padBottom = 30;
    const plotLeft = padLeft;
    const plotRight = width - padRight;
    const plotTop = padTop;
    const plotBottom = resolvedHeight - padBottom;
    const plotHeight = Math.max(0, plotBottom - plotTop);
    let running = baseValue;
    const rows = kept.map((c) => {
        const from = running;
        const value = Number.isFinite(c.value) ? c.value : 0;
        const to = from + value;
        running = to;
        return { label: c.label, value, from, to };
    });
    const boundaries = [baseValue, resolvedPredicted, ...rows.flatMap((r) => [r.from, r.to])];
    const domain = niceExtent(boundaries, 0.06);
    const xScale = makeScale(domain, plotLeft, plotRight);
    const xTicks = ticks(domain, 5);
    const n = rows.length;
    const band = n > 0 ? plotHeight / n : plotHeight;
    const barHeight = Math.min(18, Math.max(4, band - 8));
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-waterfall", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), xTicks.map((t) => (_jsx("line", { className: "n4viz-grid", x1: round(xScale(t)), x2: round(xScale(t)), y1: plotTop, y2: plotBottom }, `grid-${t}`))), _jsx("line", { className: "n4viz-reference n4viz-base", x1: round(xScale(baseValue)), x2: round(xScale(baseValue)), y1: plotTop, y2: plotBottom, stroke: N4_VIZ_COLORS.slate, strokeDasharray: "5 4", strokeWidth: 1.4 }), _jsx("line", { className: "n4viz-reference n4viz-prediction", x1: round(xScale(resolvedPredicted)), x2: round(xScale(resolvedPredicted)), y1: plotTop, y2: plotBottom, stroke: N4_VIZ_COLORS.tealDark, strokeWidth: 1.6 }), _jsx("text", { className: "n4viz-tick", x: round(xScale(baseValue)), y: plotTop - 6, textAnchor: "middle", children: "base" }), _jsx("text", { className: "n4viz-tick", x: round(xScale(resolvedPredicted)), y: plotTop - 6, textAnchor: "middle", children: "f(x)" }), rows.map((row, i) => {
                const center = plotTop + band * i + band / 2;
                const x0 = xScale(Math.min(row.from, row.to));
                const x1 = xScale(Math.max(row.from, row.to));
                const up = row.value > 0;
                const labelX = up ? xScale(row.to) + 4 : xScale(row.to) - 4;
                return (_jsxs("g", { children: [_jsx("text", { className: "n4viz-tick", x: plotLeft - 6, y: round(center + 3), textAnchor: "end", children: truncate(row.label) }), _jsx("rect", { className: "n4viz-bar", x: round(x0), y: round(center - barHeight / 2), width: round(Math.max(1, x1 - x0)), height: round(barHeight), rx: 2, fill: up ? N4_VIZ_COLORS.green : N4_VIZ_COLORS.rose }), _jsx("text", { className: "n4viz-badge", x: round(labelX), y: round(center + 3), textAnchor: up ? "start" : "end", children: signed(row.value, valueFormat) })] }, `${row.label}-${i}`));
            }), _jsx("line", { className: "n4viz-axis", x1: plotLeft, x2: plotRight, y1: plotBottom, y2: plotBottom }), xTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: round(xScale(t)), y: plotBottom + 15, textAnchor: "middle", children: valueFormat(t) }, `tx-${t}`)))] }));
}
//# sourceMappingURL=WaterfallChart.js.map