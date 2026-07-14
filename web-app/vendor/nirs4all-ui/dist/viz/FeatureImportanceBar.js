import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { makeScale, round, ticks } from "./geometry.js";
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
function truncate(label, max = 15) {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
/**
 * Ranked horizontal-bar chart of the most important features / wavelength
 * regions — the Studio Variable-Importance view. Sorts by value, keeps the top
 * N, left-labels each bar and prints its value on the right. Pure inline SVG;
 * hosts pass precomputed importances.
 */
export function FeatureImportanceBar({ items, topN = 12, barColor = N4_VIZ_COLORS.teal, valueFormat = defaultFormat, width = 360, height, title = "Feature importance", className, }) {
    const keep = Math.max(0, Math.trunc(topN));
    const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, keep);
    const resolvedHeight = height ?? Math.max(160, keep * 22 + 48);
    const padLeft = 96;
    const padRight = 46;
    const padTop = 10;
    const padBottom = 28;
    const plotLeft = padLeft;
    const plotRight = width - padRight;
    const plotTop = padTop;
    const plotBottom = resolvedHeight - padBottom;
    const plotHeight = Math.max(0, plotBottom - plotTop);
    const maxValue = Math.max(0, ...sorted.map((it) => (Number.isFinite(it.value) ? it.value : 0)));
    const domain = { min: 0, max: maxValue || 1 };
    const xScale = makeScale(domain, plotLeft, plotRight);
    const axisTicks = ticks(domain, 4);
    const n = sorted.length;
    const band = n > 0 ? plotHeight / n : plotHeight;
    const barHeight = Math.min(18, Math.max(4, band - 8));
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-importance", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), axisTicks.map((t) => (_jsx("line", { className: "n4viz-grid", x1: round(xScale(t)), x2: round(xScale(t)), y1: plotTop, y2: plotBottom }, `grid-${t}`))), sorted.map((item, i) => {
                const center = plotTop + band * i + band / 2;
                const barEnd = xScale(item.value);
                return (_jsxs("g", { children: [_jsx("text", { className: "n4viz-tick", x: plotLeft - 6, y: round(center + 3), textAnchor: "end", children: truncate(item.label) }), _jsx("rect", { className: "n4viz-bar", x: plotLeft, y: round(center - barHeight / 2), width: round(Math.max(0, barEnd - plotLeft)), height: round(barHeight), rx: 2, fill: item.color ?? barColor }), _jsx("text", { className: "n4viz-badge", x: round(barEnd + 4), y: round(center + 3), textAnchor: "start", children: valueFormat(item.value) })] }, `${item.label}-${i}`));
            }), _jsx("line", { className: "n4viz-axis", x1: plotLeft, x2: plotRight, y1: plotBottom, y2: plotBottom }), axisTicks.map((t) => (_jsx("text", { className: "n4viz-tick", x: round(xScale(t)), y: plotBottom + 15, textAnchor: "middle", children: valueFormat(t) }, `tx-${t}`)))] }));
}
//# sourceMappingURL=FeatureImportanceBar.js.map