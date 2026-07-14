import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { buildFrame, makeScale, round, ticks } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
function safe(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}
/**
 * Stacked bias²/variance decomposition per group — the Studio Inspector
 * bias-variance view. Each vertical bar stacks variance on top of bias², so the
 * full bar height is the total error and the split shows where it comes from. A
 * two-swatch legend keys the segments. Pure inline SVG; hosts pass the
 * decomposition per group.
 */
export function BiasVarianceBars({ entries, biasColor = N4_VIZ_COLORS.indigo, varianceColor = N4_VIZ_COLORS.amber, width = 420, height = 250, padding, yLabel = "Error", title = "Bias² / variance", className, }) {
    const frame = buildFrame(width, height, { top: 34, ...(padding ?? {}) });
    const { top, left } = frame.padding;
    const bottom = top + frame.innerHeight;
    const right = left + frame.innerWidth;
    const totals = entries.map((e) => safe(e.biasSquared) + safe(e.variance));
    const maxTotal = Math.max(0, ...totals.filter((t) => Number.isFinite(t)));
    const yDomain = { min: 0, max: maxTotal || 1 };
    const yScale = makeScale(yDomain, bottom, top);
    const yTicks = ticks(yDomain, 5);
    const slotW = entries.length > 0 ? frame.innerWidth / entries.length : frame.innerWidth;
    const barW = Math.min(48, slotW * 0.6);
    const legend = [
        { color: biasColor, label: "Bias²" },
        { color: varianceColor, label: "Variance" },
    ];
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-biasvariance", className), viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), legend.map((item, k) => {
                const lx = left + k * 92;
                return (_jsxs("g", { children: [_jsx("rect", { x: round(lx), y: 12, width: 11, height: 11, rx: 2, fill: item.color }), _jsx("text", { className: "n4viz-badge", x: round(lx + 16), y: 21, textAnchor: "start", children: item.label })] }, item.label));
            }), yTicks.map((t) => (_jsx("line", { className: "n4viz-grid", x1: left, x2: right, y1: round(yScale(t)), y2: round(yScale(t)) }, `gy-${t}`))), entries.map((entry, i) => {
                const center = left + (i + 0.5) * slotW;
                const bias = safe(entry.biasSquared);
                const variance = safe(entry.variance);
                const yBias = yScale(bias);
                const yTotal = yScale(bias + variance);
                const x = center - barW / 2;
                return (_jsxs("g", { children: [_jsx("rect", { className: "n4viz-bar", x: round(x), y: round(yBias), width: round(barW), height: round(Math.max(0, bottom - yBias)), fill: biasColor }), _jsx("rect", { className: "n4viz-bar", x: round(x), y: round(yTotal), width: round(barW), height: round(Math.max(0, yBias - yTotal)), fill: varianceColor })] }, `${entry.label}-${i}`));
            }), _jsx("line", { className: "n4viz-axis", x1: left, x2: right, y1: bottom, y2: bottom }), _jsx("line", { className: "n4viz-axis", x1: left, x2: left, y1: top, y2: bottom }), entries.map((entry, i) => (_jsx("text", { className: "n4viz-tick", x: round(left + (i + 0.5) * slotW), y: bottom + 15, textAnchor: "middle", children: entry.label }, `lx-${entry.label}-${i}`))), yTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: left - 6, y: round(yScale(t)) + 3, textAnchor: "end", children: fmt(t) }, `ty-${t}`))), _jsx("text", { className: "n4viz-axis-label", transform: `translate(11 ${top + frame.innerHeight / 2}) rotate(-90)`, textAnchor: "middle", children: yLabel })] }));
}
//# sourceMappingURL=BiasVarianceBars.js.map