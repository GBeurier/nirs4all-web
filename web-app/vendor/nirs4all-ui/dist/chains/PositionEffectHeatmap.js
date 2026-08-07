import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { extentOf, round } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { effectColor, effectTextColor, roleColor } from "./colors.js";
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 100)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(2);
}
function cellMedians(matrix) {
    const out = [matrix.baseline];
    for (const row of matrix.rows)
        for (const cell of row.cells)
            if (cell)
                out.push(cell.median);
    return out;
}
/**
 * Token × position goodness heatmap — answers "is this step better early, mid,
 * or late (1st vs 2nd)?". Each cell is the median goodness of chains where the
 * row token sits in that position bucket, colored on the diverging effect ramp
 * pivoted at the corpus baseline (cool = better, warm = worse). Cells below the
 * min-count gate drop out as blanks. Pure inline SVG; feed it a
 * {@link PositionMatrix} from `positionMatrix()`.
 */
export function PositionEffectHeatmap({ matrix, width = 460, height, showCounts = true, selectedToken, onSelectToken, title = "Effect by position", hideTitle = false, xLabel, className, roleColors, }) {
    const rows = matrix.rows;
    const cols = matrix.buckets;
    const resolvedHeight = height ?? Math.max(150, rows.length * 34 + 66);
    const padLeft = 104;
    const padTop = 40;
    const padRight = 44;
    const padBottom = 26;
    const gridLeft = padLeft;
    const gridRight = width - padRight;
    const gridTop = padTop;
    const gridBottom = resolvedHeight - padBottom;
    const gridWidth = Math.max(0, gridRight - gridLeft);
    const gridHeight = Math.max(0, gridBottom - gridTop);
    const cellW = cols.length > 0 ? gridWidth / cols.length : gridWidth;
    const cellH = rows.length > 0 ? gridHeight / rows.length : gridHeight;
    const ext = extentOf(cellMedians(matrix));
    const halfRange = Math.max(Math.abs(ext.max - matrix.baseline), Math.abs(matrix.baseline - ext.min)) || 1;
    const interactive = typeof onSelectToken === "function";
    const legendX = gridRight + 16;
    const legendW = 10;
    const segCount = 16;
    const renderCell = (cell, r, c) => {
        const x = gridLeft + c * cellW;
        const y = gridTop + r * cellH;
        const has = cell !== null;
        const fill = has ? effectColor(cell.median, matrix.baseline, halfRange) : "transparent";
        return (_jsxs("g", { className: "n4chains-hcell", children: [_jsx("rect", { x: round(x + 1.5), y: round(y + 1.5), width: round(cellW - 3), height: round(cellH - 3), rx: 4, fill: fill, stroke: has ? "transparent" : "currentColor", strokeOpacity: has ? 0 : 0.16 }), has ? (_jsxs(_Fragment, { children: [_jsx("title", { children: `${rows[r].label} · ${cols[c].label} — median ${fmt(cell.median)}, n=${cell.n}` }), _jsx("text", { className: "n4chains-cell-value", x: round(x + cellW / 2), y: round(y + cellH / 2 + (showCounts ? 0 : 3.5)), textAnchor: "middle", fill: effectTextColor(cell.median, matrix.baseline, halfRange), children: fmt(cell.median) }), showCounts ? (_jsx("text", { className: "n4chains-cell-n", x: round(x + cellW / 2), y: round(y + cellH / 2 + 12), textAnchor: "middle", fill: effectTextColor(cell.median, matrix.baseline, halfRange), children: cell.n })) : null] })) : null] }, `cell-${r}-${c}`));
    };
    return (_jsxs("svg", { className: cx("n4chains", "n4chains-position", className), viewBox: `0 0 ${width} ${resolvedHeight}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), hideTitle ? null : (_jsx("text", { className: "n4chains-title", x: 8, y: 16, textAnchor: "start", children: title })), _jsx("text", { className: "n4chains-caption", x: round(gridRight), y: 16, textAnchor: "end", children: matrix.mode === "phase" ? "position phase" : "absolute position" }), rows.map((_, r) => cols.map((__, c) => renderCell(rows[r].cells[c] ?? null, r, c))), rows.map((row, r) => {
                const cy = gridTop + r * cellH + cellH / 2;
                const selected = selectedToken === row.token;
                return (_jsxs("g", { className: cx("n4chains-position-row", selected && "is-selected", interactive && "is-interactive"), onClick: interactive ? () => onSelectToken?.(row.token) : undefined, tabIndex: interactive ? 0 : undefined, role: interactive ? "button" : undefined, "aria-pressed": interactive ? selected : undefined, onKeyDown: interactive
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectToken?.(row.token);
                            }
                        }
                        : undefined, children: [_jsx("rect", { className: "n4chains-position-rowbg", x: 0, y: round(cy - cellH / 2), width: gridLeft - 4, height: round(cellH) }), _jsx("rect", { className: "n4chains-chip", x: 8, y: round(cy - 5), width: 10, height: 10, rx: 2.5, fill: roleColor(row.role, roleColors) }), _jsx("text", { className: "n4chains-row-label", x: 24, y: round(cy + 3.5), children: row.label })] }, `row-${row.token}`));
            }), cols.map((col, c) => (_jsx("text", { className: "n4chains-col-label", x: round(gridLeft + c * cellW + cellW / 2), y: gridTop - 8, textAnchor: "middle", children: col.label }, `col-${col.key}`))), Array.from({ length: segCount }, (_, k) => {
                const t = k / (segCount - 1); // 0 top = better
                const value = matrix.baseline + halfRange * (1 - 2 * t);
                const segY = gridTop + t * gridHeight;
                return (_jsx("rect", { x: legendX, y: round(segY), width: legendW, height: round(gridHeight / segCount + 0.8), fill: effectColor(value, matrix.baseline, halfRange) }, `legend-${k}`));
            }), _jsx("text", { className: "n4chains-legend-cap", x: round(legendX + legendW / 2), y: gridTop - 4, textAnchor: "middle", fill: "#0f766e", children: "better" }), _jsx("text", { className: "n4chains-legend-cap", x: round(legendX + legendW / 2), y: gridBottom + 12, textAnchor: "middle", fill: "#b45309", children: "worse" }), xLabel ? (_jsx("text", { className: "n4chains-axis-label", x: round(gridLeft + gridWidth / 2), y: resolvedHeight - 4, textAnchor: "middle", children: xLabel })) : null] }));
}
//# sourceMappingURL=PositionEffectHeatmap.js.map