import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { extentOf, round } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { effectColor, effectTextColor, roleColor } from "./colors.js";
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(2);
}
function shorten(label, max = 10) {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
function medians(matrix) {
    const out = [matrix.baseline];
    for (const row of matrix.cells)
        for (const cell of row)
            if (cell)
                out.push(cell.median);
    return out;
}
/**
 * Predecessor × successor goodness matrix — answers order questions like "is
 * MSC better *after* SNV?". `cells[pred][succ]` is the median goodness of chains
 * where the row token occurs before the column token, on the diverging effect
 * ramp pivoted at the baseline. The diagonal and count-gated pairs are blank.
 * Read a cell as "row → column". Pure inline SVG; feed a {@link SequenceMatrix}
 * from `sequenceMatrix()`.
 */
export function SequenceEffectHeatmap({ matrix, width = 440, height, showCounts = false, title = "Effect by order", hideTitle = false, className, roleColors, }) {
    const tokens = matrix.tokens;
    const n = tokens.length;
    const padLeft = 104;
    const padTop = 66;
    const padRight = 56;
    const padBottom = 34;
    const resolvedHeight = height ?? padTop + n * 34 + padBottom;
    const gridLeft = padLeft;
    const gridRight = width - padRight;
    const gridTop = padTop;
    const gridBottom = resolvedHeight - padBottom;
    const gridWidth = Math.max(0, gridRight - gridLeft);
    const gridHeight = Math.max(0, gridBottom - gridTop);
    const cellW = n > 0 ? gridWidth / n : gridWidth;
    const cellH = n > 0 ? gridHeight / n : gridHeight;
    const ext = extentOf(medians(matrix));
    const halfRange = Math.max(Math.abs(ext.max - matrix.baseline), Math.abs(matrix.baseline - ext.min)) || 1;
    const legendX = gridRight + 14;
    const legendW = 10;
    const segCount = 16;
    const renderCell = (cell, r, c) => {
        const x = gridLeft + c * cellW;
        const y = gridTop + r * cellH;
        if (r === c) {
            return (_jsx("rect", { className: "n4chains-seq-diag", x: round(x + 1.5), y: round(y + 1.5), width: round(cellW - 3), height: round(cellH - 3), rx: 4 }, `d-${r}`));
        }
        const has = cell !== null;
        return (_jsxs("g", { className: "n4chains-hcell", children: [_jsx("rect", { x: round(x + 1.5), y: round(y + 1.5), width: round(cellW - 3), height: round(cellH - 3), rx: 4, fill: has ? effectColor(cell.median, matrix.baseline, halfRange) : "transparent", stroke: has ? "transparent" : "currentColor", strokeOpacity: has ? 0 : 0.14 }), has ? (_jsxs(_Fragment, { children: [_jsx("title", { children: `${tokens[r].label} → ${tokens[c].label} — median ${fmt(cell.median)}, n=${cell.n}` }), _jsx("text", { className: "n4chains-cell-value", x: round(x + cellW / 2), y: round(y + cellH / 2 + (showCounts ? 0 : 3.5)), textAnchor: "middle", fill: effectTextColor(cell.median, matrix.baseline, halfRange), children: fmt(cell.median) }), showCounts ? (_jsxs("text", { className: "n4chains-cell-n", x: round(x + cellW / 2), y: round(y + cellH / 2 + 12), textAnchor: "middle", fill: effectTextColor(cell.median, matrix.baseline, halfRange), children: ["n=", cell.n] })) : null] })) : null] }, `cell-${r}-${c}`));
    };
    return (_jsxs("svg", { className: cx("n4chains", "n4chains-sequence", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), hideTitle ? null : (_jsx("text", { className: "n4chains-title", x: 8, y: 16, textAnchor: "start", children: title })), _jsx("text", { className: "n4chains-caption", x: round(gridRight), y: 16, textAnchor: "end", children: matrix.adjacentOnly ? "directly after" : "somewhere after" }), _jsx("text", { className: "n4chains-seq-axis", x: round(gridLeft + gridWidth / 2), y: gridTop - 30, textAnchor: "middle", children: "successor \u2192" }), _jsx("text", { className: "n4chains-seq-axis", transform: `translate(14 ${round(gridTop + gridHeight / 2)}) rotate(-90)`, textAnchor: "middle", children: "predecessor \u2193" }), matrix.cells.map((row, r) => row.map((cell, c) => renderCell(cell ?? null, r, c))), tokens.map((token, r) => {
                const cy = gridTop + r * cellH + cellH / 2;
                return (_jsxs("g", { children: [_jsx("rect", { className: "n4chains-chip", x: round(gridLeft - 92), y: round(cy - 5), width: 9, height: 9, rx: 2.5, fill: roleColor(token.role, roleColors) }), _jsx("text", { className: "n4chains-row-label", x: round(gridLeft - 78), y: round(cy + 3.5), children: shorten(token.label, 11) })] }, `row-${token.token}`));
            }), tokens.map((token, c) => {
                const cx0 = gridLeft + c * cellW + cellW / 2;
                return (_jsx("text", { className: "n4chains-col-label", transform: `rotate(-38 ${round(cx0)} ${gridTop - 8})`, x: round(cx0), y: gridTop - 8, textAnchor: "start", children: shorten(token.label, 11) }, `col-${token.token}`));
            }), Array.from({ length: segCount }, (_, k) => {
                const t = k / (segCount - 1);
                const value = matrix.baseline + halfRange * (1 - 2 * t);
                const segY = gridTop + t * gridHeight;
                return (_jsx("rect", { x: legendX, y: round(segY), width: legendW, height: round(gridHeight / segCount + 0.8), fill: effectColor(value, matrix.baseline, halfRange) }, `legend-${k}`));
            }), _jsx("text", { className: "n4chains-legend-cap", x: round(legendX + legendW / 2), y: gridTop - 4, textAnchor: "middle", fill: "#0f766e", children: "better" }), _jsx("text", { className: "n4chains-legend-cap", x: round(legendX + legendW / 2), y: gridBottom + 12, textAnchor: "middle", fill: "#b45309", children: "worse" })] }));
}
//# sourceMappingURL=SequenceEffectHeatmap.js.map