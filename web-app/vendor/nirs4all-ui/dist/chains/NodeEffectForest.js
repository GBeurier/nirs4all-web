import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { buildFrame, clamp, makeScale, niceExtent, round, ticks } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { effectColor, roleColor } from "./colors.js";
import { CHAIN_LENS_LABELS } from "./types.js";
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    if (Math.abs(value) >= 100)
        return value.toFixed(0);
    if (Math.abs(value) >= 1)
        return value.toFixed(2);
    return value.toFixed(3);
}
function fmtDelta(value) {
    if (!Number.isFinite(value))
        return "—";
    const s = fmt(Math.abs(value));
    return value >= 0 ? `+${s}` : `−${s}`;
}
function sortTokens(tokens, sortBy) {
    const list = tokens.slice();
    if (sortBy === "median") {
        list.sort((a, b) => (b.with.median || -Infinity) - (a.with.median || -Infinity));
    }
    else if (sortBy === "coverage") {
        list.sort((a, b) => b.coverage - a.coverage);
    }
    // "delta" keeps the analysis order (already delta desc, NaN last)
    return list;
}
/**
 * Forest / caterpillar plot of per-node influence — the headline "which steps
 * help" ranking. One row per token: a faint min–max whisker, a bold IQR bar,
 * and a median dot colored by its effect vs the baseline (cool = better, warm =
 * worse). A dashed baseline marks the corpus median. Rows are clickable, so the
 * forest doubles as the node selector for the explorer. Pure inline SVG.
 */
export function NodeEffectForest({ analysis, roles, sortBy = "delta", maxRows = 16, selectedToken, onSelectToken, width = 460, rowHeight = 26, padding, title = "Node influence", hideTitle = false, className, roleColors, }) {
    const roleSet = roles ? new Set(roles) : null;
    const filtered = analysis.tokens.filter((token) => (roleSet ? roleSet.has(token.role) : true));
    const sorted = sortTokens(filtered, sortBy);
    const shown = sorted.slice(0, Math.max(0, maxRows));
    const hiddenCount = sorted.length - shown.length;
    const headH = 30;
    const footH = 26;
    const frame = buildFrame(width, shown.length * rowHeight + headH + footH, {
        top: headH,
        right: padding?.right ?? 98,
        bottom: footH,
        left: padding?.left ?? 150,
    });
    const { top, left } = frame.padding;
    const plotRight = left + frame.innerWidth;
    const bottom = top + frame.innerHeight;
    const spread = [analysis.baseline];
    for (const token of shown) {
        for (const value of [token.with.min, token.with.q1, token.with.median, token.with.q3, token.with.max]) {
            if (Number.isFinite(value))
                spread.push(value);
        }
    }
    const domain = niceExtent(spread.length > 1 ? spread : [0, 1], 0.06);
    const xScale = makeScale(domain, left, plotRight);
    const halfRange = Math.max(Math.abs(domain.max - analysis.baseline), Math.abs(analysis.baseline - domain.min)) || 1;
    const xTicks = ticks(domain, frame.innerWidth < 220 ? 2 : 5);
    const baselineX = round(clamp(xScale(analysis.baseline), left, plotRight));
    const interactive = typeof onSelectToken === "function";
    return (_jsxs("svg", { className: cx("n4chains", "n4chains-forest", className), viewBox: `0 0 ${frame.width} ${frame.height}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: title }), hideTitle ? null : (_jsx("text", { className: "n4chains-title", x: 8, y: 16, textAnchor: "start", children: title })), _jsxs("text", { className: "n4chains-caption", x: round(plotRight), y: 16, textAnchor: "end", children: [CHAIN_LENS_LABELS[analysis.lens], " \u00B7 higher = better"] }), xTicks.map((t) => (_jsx("line", { className: "n4chains-grid", x1: round(xScale(t)), x2: round(xScale(t)), y1: top, y2: bottom }, `gx-${t}`))), _jsx("line", { className: "n4chains-baseline", x1: baselineX, x2: baselineX, y1: top - 4, y2: bottom, children: _jsx("title", { children: "baseline (corpus median)" }) }), shown.map((token, i) => {
                const cy = round(top + (i + 0.5) * rowHeight);
                const color = roleColor(token.role, roleColors);
                const isSelected = selectedToken === token.token;
                const hasSpan = Number.isFinite(token.with.q1) && Number.isFinite(token.with.q3);
                const dotColor = effectColor(token.with.median, analysis.baseline, halfRange);
                return (_jsxs("g", { className: cx("n4chains-forest-row", isSelected && "is-selected", interactive && "is-interactive"), "data-role": token.role, onClick: interactive ? () => onSelectToken?.(token.token) : undefined, onKeyDown: interactive
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectToken?.(token.token);
                            }
                        }
                        : undefined, tabIndex: interactive ? 0 : undefined, role: interactive ? "button" : undefined, "aria-pressed": interactive ? isSelected : undefined, children: [_jsx("title", { children: `${token.label} — median ${fmt(token.with.median)}, Δ ${fmtDelta(token.delta)} vs without, n=${token.n}` }), _jsx("rect", { className: "n4chains-forest-rowbg", x: 0, y: round(cy - rowHeight / 2), width: frame.width, height: rowHeight }), _jsx("rect", { className: "n4chains-chip", x: 12, y: round(cy - 5), width: 10, height: 10, rx: 2.5, fill: color }), _jsx("text", { className: "n4chains-row-label", x: 28, y: round(cy + 3.5), children: token.label }), hasSpan ? (_jsxs(_Fragment, { children: [_jsx("line", { className: "n4chains-whisker", x1: round(xScale(token.with.min)), x2: round(xScale(token.with.max)), y1: cy, y2: cy, stroke: color }), _jsx("line", { className: "n4chains-iqr", x1: round(xScale(token.with.q1)), x2: round(xScale(token.with.q3)), y1: cy, y2: cy, stroke: color }), _jsx("circle", { className: "n4chains-median", cx: round(xScale(token.with.median)), cy: cy, r: 4.5, fill: dotColor })] })) : (_jsx("text", { className: "n4chains-row-empty", x: round(left + 8), y: round(cy + 3.5), children: "n/a" })), _jsx("text", { className: cx("n4chains-row-delta", token.delta >= 0 ? "is-up" : "is-down"), x: round(frame.width - 44), y: round(cy + 3.5), textAnchor: "end", children: fmtDelta(token.delta) }), _jsxs("text", { className: "n4chains-row-n", x: round(frame.width - 6), y: round(cy + 3.5), textAnchor: "end", children: ["n=", token.n] })] }, token.token));
            }), _jsx("line", { className: "n4chains-axis", x1: left, x2: plotRight, y1: bottom, y2: bottom }), xTicks.map((t) => (_jsx("text", { className: "n4chains-tick", x: round(xScale(t)), y: bottom + 14, textAnchor: "middle", children: fmt(t) }, `tx-${t}`))), hiddenCount > 0 ? (_jsxs("text", { className: "n4chains-more", x: round(frame.width - 8), y: frame.height - 8, textAnchor: "end", children: ["+", hiddenCount, " more nodes"] })) : null] }));
}
//# sourceMappingURL=NodeEffectForest.js.map