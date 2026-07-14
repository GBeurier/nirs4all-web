import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { clamp, extentOf, round } from "./geometry.js";
import { viridisColor } from "./theme.js";
function defaultFormat(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1000)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
/**
 * 2D performance heatmap (model × preprocessing scores) — the Studio Inspector
 * matrix view. Cells are colored by normalized value through `colorScale`,
 * non-finite entries drop out as blanks, and a compact gradient legend keys the
 * scale. Pure inline SVG; hosts pass labels + a values matrix.
 */
export function ScoreHeatmap({ rows, cols, values, colorScale = viridisColor, showValues = true, valueFormat = defaultFormat, min, max, width = 420, height, xLabel, yLabel, title = "Performance heatmap", className, }) {
    const resolvedHeight = height ?? Math.max(160, rows.length * 34 + 60);
    const padLeft = 88;
    const padTop = 34;
    const padRight = 52;
    const padBottom = 30;
    const gridLeft = padLeft;
    const gridRight = width - padRight;
    const gridTop = padTop;
    const gridBottom = resolvedHeight - padBottom;
    const gridWidth = Math.max(0, gridRight - gridLeft);
    const gridHeight = Math.max(0, gridBottom - gridTop);
    const cellW = cols.length > 0 ? gridWidth / cols.length : gridWidth;
    const cellH = rows.length > 0 ? gridHeight / rows.length : gridHeight;
    const finiteValues = values.flatMap((row) => row.filter((v) => Number.isFinite(v)));
    const ext = extentOf(finiteValues);
    const lo = min ?? ext.min;
    const hi = max ?? ext.max;
    const span = hi - lo || 1;
    const rotate = cols.length > 6;
    const legendX = gridRight + 14;
    const legendW = 10;
    const segCount = 16;
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-heatmap", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), rows.map((_, r) => cols.map((__, c) => {
                const raw = values[r]?.[c];
                const hasValue = typeof raw === "number" && Number.isFinite(raw);
                const t = typeof raw === "number" && Number.isFinite(raw) ? clamp((raw - lo) / span, 0, 1) : 0;
                const x = gridLeft + c * cellW;
                const y = gridTop + r * cellH;
                const textFill = t > 0.55 ? "#0f172a" : "#f8fafc";
                return (_jsxs("g", { children: [_jsx("rect", { className: "n4viz-cell", x: round(x + 1), y: round(y + 1), width: round(cellW - 2), height: round(cellH - 2), rx: 4, fill: hasValue ? colorScale(t) : "transparent", stroke: hasValue ? "transparent" : "currentColor", strokeOpacity: hasValue ? 0 : 0.18 }), hasValue && showValues ? (_jsx("text", { className: "n4viz-cell-value", x: round(x + cellW / 2), y: round(y + cellH / 2 + 4), textAnchor: "middle", fill: textFill, children: typeof raw === "number" ? valueFormat(raw) : "" })) : null] }, `cell-${r}-${c}`));
            })), rows.map((label, r) => (_jsx("text", { className: "n4viz-tick", x: gridLeft - 6, y: round(gridTop + r * cellH + cellH / 2 + 3), textAnchor: "end", children: label }, `row-${label}-${r}`))), cols.map((label, c) => {
                const cx0 = gridLeft + c * cellW + cellW / 2;
                const y = gridTop - 6;
                return rotate ? (_jsx("text", { className: "n4viz-tick", transform: `rotate(-35 ${round(cx0)} ${y})`, x: round(cx0), y: y, textAnchor: "end", children: label }, `col-${label}-${c}`)) : (_jsx("text", { className: "n4viz-tick", x: round(cx0), y: y, textAnchor: "middle", children: label }, `col-${label}-${c}`));
            }), Array.from({ length: segCount }, (_, k) => {
                const segT = 1 - k / (segCount - 1);
                const segY = gridTop + (k / segCount) * gridHeight;
                return (_jsx("rect", { className: "n4viz-legend-cell", x: legendX, y: round(segY), width: legendW, height: round(gridHeight / segCount + 0.6), fill: colorScale(segT) }, `legend-${k}`));
            }), _jsx("text", { className: "n4viz-tick", x: round(legendX + legendW / 2), y: gridTop - 4, textAnchor: "middle", children: valueFormat(hi) }), _jsx("text", { className: "n4viz-tick", x: round(legendX + legendW / 2), y: gridBottom + 11, textAnchor: "middle", children: valueFormat(lo) }), xLabel ? (_jsx("text", { className: "n4viz-axis-label", x: gridLeft + gridWidth / 2, y: resolvedHeight - 4, textAnchor: "middle", children: xLabel })) : null, yLabel ? (_jsx("text", { className: "n4viz-axis-label", transform: `translate(12 ${gridTop + gridHeight / 2}) rotate(-90)`, textAnchor: "middle", children: yLabel })) : null] }));
}
//# sourceMappingURL=ScoreHeatmap.js.map