import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { round } from "./geometry.js";
import { N4_VIZ_COLORS } from "./theme.js";
function mix(hex, intensity) {
    const clamped = Math.max(0, Math.min(1, intensity));
    return `color-mix(in srgb, ${hex} ${round(12 + clamped * 78)}%, transparent)`;
}
function defaultCellColor(intensity, isDiagonal) {
    return mix(isDiagonal ? N4_VIZ_COLORS.teal : N4_VIZ_COLORS.amber, intensity);
}
/**
 * Classification confusion matrix as intensity-shaded cells (teal diagonal,
 * amber off-diagonal) — the Studio Inspector / Web results classification view.
 * Pure inline SVG; hosts pass labels + a counts matrix.
 */
export function ConfusionMatrix({ labels, matrix, normalize = false, width = 320, height = 320, cellColor = defaultCellColor, showCounts = true, xLabel = "Predicted", yLabel = "Actual", title = "Confusion matrix", className, }) {
    const n = labels.length;
    const padLeft = 46;
    const padTop = 30;
    const padRight = 12;
    const padBottom = 34;
    const gridW = Math.max(0, width - padLeft - padRight);
    const gridH = Math.max(0, height - padTop - padBottom);
    const cellW = n > 0 ? gridW / n : gridW;
    const cellH = n > 0 ? gridH / n : gridH;
    const globalMax = Math.max(1, ...matrix.flatMap((row) => row.map((v) => (Number.isFinite(v) ? v : 0))));
    const rowTotals = matrix.map((row) => Math.max(1, row.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)));
    return (_jsxs("svg", { className: cx("n4viz", "n4viz-confusion", className), viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), labels.map((_, trueIdx) => labels.map((__, predIdx) => {
                const value = matrix[trueIdx]?.[predIdx] ?? 0;
                const denom = normalize ? (rowTotals[trueIdx] ?? 1) : globalMax;
                const intensity = denom > 0 ? value / denom : 0;
                const x = padLeft + predIdx * cellW;
                const y = padTop + trueIdx * cellH;
                const isDiagonal = trueIdx === predIdx;
                return (_jsxs("g", { children: [_jsx("rect", { className: "n4viz-cell", x: round(x + 1), y: round(y + 1), width: round(cellW - 2), height: round(cellH - 2), rx: 4, fill: cellColor(intensity, isDiagonal), stroke: isDiagonal ? N4_VIZ_COLORS.teal : "transparent", strokeOpacity: 0.5 }), showCounts ? (_jsx("text", { className: cx("n4viz-cell-value", intensity > 0.55 ? "n4viz-cell-value-strong" : undefined), x: round(x + cellW / 2), y: round(y + cellH / 2 + 4), textAnchor: "middle", children: normalize ? (value / (rowTotals[trueIdx] ?? 1)).toFixed(2) : value })) : null] }, `c-${trueIdx}-${predIdx}`));
            })), labels.map((label, i) => (_jsx("text", { className: "n4viz-tick", x: padLeft - 6, y: round(padTop + i * cellH + cellH / 2 + 3), textAnchor: "end", children: label }, `row-${label}-${i}`))), labels.map((label, i) => (_jsx("text", { className: "n4viz-tick", x: round(padLeft + i * cellW + cellW / 2), y: padTop - 8, textAnchor: "middle", children: label }, `col-${label}-${i}`))), _jsx("text", { className: "n4viz-axis-label", x: padLeft + gridW / 2, y: height - 4, textAnchor: "middle", children: xLabel }), _jsx("text", { className: "n4viz-axis-label", transform: `translate(12 ${padTop + gridH / 2}) rotate(-90)`, textAnchor: "middle", children: yLabel })] }));
}
//# sourceMappingURL=ConfusionMatrix.js.map