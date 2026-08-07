import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { round } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { nodeFlow } from "./analysis.js";
import { effectColor, effectTextColor, roleColor } from "./colors.js";
import { annularSector, labelRotation, pieSector, polar, START, TAU, treeDepth } from "./radial.js";
import { CHAIN_LENS_LABELS, CHAIN_ROLE_LABELS } from "./types.js";
function fmt(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "—";
}
/**
 * Chain hub navigator — the twin of {@link ChainNodeOrbit} with the focus on
 * the *second* ring. The centre is a pie (camembert) of every possible
 * predecessor, a band around it is the focus node itself, and the outer rings
 * are the ordered successors (2–3 levels). Reading centre → out is pipeline
 * order: predecessors converge into the hub, successors radiate away. Rooted on
 * the whole selected chain (no loops); click a centre slice to prepend, an
 * outer wedge to append, the focus band to step back, and Reset to start over.
 */
export function ChainNodeHub({ analysis, defaultFocusToken, roles, depth = 2, maxPerLevel = 6, minCount = 2, size = 460, onFocusChange, title = "Chain hub", className, roleColors, }) {
    const hub = defaultFocusToken ?? analysis.tokens[0]?.token ?? "";
    const [path, setPath] = useState(hub ? [hub] : []);
    const flow = useMemo(() => (path.length ? nodeFlow(analysis, path, { roles, depth, maxPerLevel, minCount }) : null), [analysis, path, roles, depth, maxPerLevel, minCount]);
    const prepend = (token) => {
        setPath((prev) => [token, ...prev]);
        onFocusChange?.(token);
    };
    const append = (token) => {
        setPath((prev) => [...prev, token]);
        onFocusChange?.(token);
    };
    const jumpTo = (index) => {
        setPath((prev) => {
            const next = prev.slice(0, index + 1);
            onFocusChange?.(next[next.length - 1] ?? hub);
            return next;
        });
    };
    const back = () => {
        if (path.length > 1)
            jumpTo(path.length - 2);
    };
    const reset = () => {
        if (path.length === 1 && path[0] === hub)
            return;
        setPath([hub]);
        onFocusChange?.(hub);
    };
    if (!flow) {
        return (_jsx("div", { className: cx("n4chains-orbit", "n4chains-hub", className), style: { width: size }, children: _jsx("div", { className: "n4chains-empty", children: "No node to explore." }) }));
    }
    const cx0 = size / 2;
    const cy0 = size / 2;
    const gap = 4;
    const rCore = Math.round(size * 0.185);
    const focusRingW = Math.round(size * 0.052);
    const rFocusIn = rCore + gap;
    const rFocusOut = rFocusIn + focusRingW;
    const rMax = size / 2 - 50;
    const succStart = rFocusOut + gap;
    const succDepth = treeDepth(flow.successors);
    const ringW = succDepth > 0 ? Math.max(8, (rMax - succStart - gap * (succDepth - 1)) / succDepth) : 0;
    const succRing = (level) => {
        const rIn = succStart + level * (ringW + gap);
        return [rIn, rIn + ringW];
    };
    const halfRange = Math.max(Math.abs(flow.goodnessExtent.max - flow.baseline), Math.abs(flow.baseline - flow.goodnessExtent.min)) || 1;
    // predecessor pie (centre)
    const preds = flow.predecessors;
    const predTotal = preds.reduce((sum, link) => sum + link.count, 0);
    const predPad = preds.length > 1 ? 0.02 : 0;
    const predAvail = TAU - predPad * preds.length;
    let pc = START + predPad / 2;
    const predSlices = preds.map((link) => {
        const sweep = predTotal > 0 ? (link.count / predTotal) * predAvail : predAvail / preds.length;
        const slice = { link, a0: pc, a1: pc + sweep };
        pc += sweep + predPad;
        return slice;
    });
    // successor sunburst (outer)
    const succWedges = [];
    const layoutSucc = (nodes, a0, a1, level) => {
        const total = nodes.reduce((sum, node) => sum + node.count, 0);
        const pad = nodes.length > 1 ? 0.014 : 0;
        const avail = a1 - a0 - pad * nodes.length;
        let cursor = a0 + pad / 2;
        for (const node of nodes) {
            const sweep = total > 0 ? (node.count / total) * avail : avail / nodes.length;
            const na0 = cursor;
            const na1 = cursor + sweep;
            cursor = na1 + pad;
            succWedges.push({
                key: `s-${level}-${node.token}-${round(na0)}`,
                token: node.token,
                label: node.label,
                role: node.role,
                median: node.stat.median,
                count: node.count,
                ring: level,
                a0: na0,
                a1: na1,
            });
            if (node.children.length > 0)
                layoutSucc(node.children, na0, na1, level + 1);
        }
    };
    layoutSucc(flow.successors, START, START + TAU, 0);
    const crumbIndices = path.length <= 5 ? path.map((_, index) => index) : [0, "gap", path.length - 3, path.length - 2, path.length - 1];
    const [flx, fly] = polar(cx0, cy0, (rFocusIn + rFocusOut) / 2, START);
    return (_jsxs("div", { className: cx("n4chains-orbit", "n4chains-hub", className), style: { width: size }, children: [_jsxs("header", { className: "n4chains-orbit-head", children: [_jsx("span", { className: "n4chains-orbit-chainlabel", children: "chain" }), _jsx("nav", { className: "n4chains-orbit-crumbs", "aria-label": "Selected chain", children: crumbIndices.map((entry, i) => {
                            if (entry === "gap") {
                                return (_jsxs("span", { className: "n4chains-crumb-wrap", children: [_jsx("span", { className: "n4chains-crumb-sep", children: "\u203A" }), _jsx("span", { className: "n4chains-crumb-ellipsis", children: "\u2026" })] }, `gap-${i}`));
                            }
                            const token = path[entry];
                            const ref = analysis.tokens.find((item) => item.token === token);
                            const isLast = entry === path.length - 1;
                            return (_jsxs("span", { className: "n4chains-crumb-wrap", children: [i > 0 ? _jsx("span", { className: "n4chains-crumb-sep", children: "\u203A" }) : null, _jsx("button", { type: "button", className: cx("n4chains-crumb", isLast && "is-current"), onClick: () => jumpTo(entry), disabled: isLast, children: ref?.label ?? token })] }, `${token}-${entry}`));
                        }) }), _jsxs("span", { className: "n4chains-orbit-tools", children: [path.length > 1 ? (_jsx("button", { type: "button", className: "n4chains-orbit-reset", onClick: reset, children: "\u27F2 reset" })) : null, _jsx("span", { className: "n4chains-orbit-caption", children: CHAIN_LENS_LABELS[analysis.lens] })] })] }), _jsxs("svg", { className: cx("n4chains", "n4chains-orbit-svg"), viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: `${flow.label} — hub (${preds.length} predecessors, ${succDepth} level(s) of successors)` }), preds.length === 0 ? (_jsx("circle", { className: "n4chains-hub-core-empty", cx: cx0, cy: cy0, r: rCore })) : (predSlices.map(({ link, a0, a1 }) => {
                        const mid = (a0 + a1) / 2;
                        const arc = (a1 - a0) * rCore * 0.62;
                        const [lx, ly] = polar(cx0, cy0, rCore * 0.62, mid);
                        return (_jsxs("g", { className: "n4chains-wedge is-interactive is-pred", "data-role": link.role, onClick: () => prepend(link.token), tabIndex: 0, role: "button", onKeyDown: (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    prepend(link.token);
                                }
                            }, children: [_jsx("title", { children: `prepend (before) · ${link.label} — median ${fmt(link.stat.median)}, ${link.count} chains` }), _jsx("path", { className: "n4chains-wedge-arc", d: pieSector(cx0, cy0, rCore, a0, a1), fill: effectColor(link.stat.median, flow.baseline, halfRange) }), arc > 30 ? (_jsx("text", { className: "n4chains-wedge-label", x: round(lx), y: round(ly + 3), textAnchor: "middle", transform: `rotate(${labelRotation(mid)} ${round(lx)} ${round(ly)})`, fill: effectTextColor(link.stat.median, flow.baseline, halfRange), children: link.label })) : null] }, `pred-${link.token}`));
                    })), _jsxs("g", { className: cx("n4chains-hub-focus", path.length > 1 && "is-interactive"), onClick: path.length > 1 ? back : undefined, tabIndex: path.length > 1 ? 0 : undefined, role: path.length > 1 ? "button" : undefined, onKeyDown: path.length > 1
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    back();
                                }
                            }
                            : undefined, children: [_jsx("title", { children: path.length > 1 ? `${flow.label} — click to step back` : flow.label }), _jsx("path", { className: "n4chains-hub-focus-arc", d: annularSector(cx0, cy0, rFocusIn, rFocusOut, START + 0.0008, START + TAU - 0.0008), fill: effectColor(flow.self.median, flow.baseline, halfRange) }), _jsxs("text", { className: "n4chains-hub-focus-label", x: round(flx), y: round(fly + 4), textAnchor: "middle", fill: effectTextColor(flow.self.median, flow.baseline, halfRange), children: [flow.label, " \u00B7 ", fmt(flow.self.median)] })] }), succWedges.map((wedge) => {
                        const [rIn, rOut] = succRing(wedge.ring);
                        const mid = (wedge.a0 + wedge.a1) / 2;
                        const rMid = (rIn + rOut) / 2;
                        const arc = (wedge.a1 - wedge.a0) * rMid;
                        const [lx, ly] = polar(cx0, cy0, rMid, mid);
                        return (_jsxs("g", { className: "n4chains-wedge is-interactive", "data-role": wedge.role, onClick: () => append(wedge.token), tabIndex: 0, role: "button", onKeyDown: (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    append(wedge.token);
                                }
                            }, children: [_jsx("title", { children: `append (after) · ${wedge.label} — median ${fmt(wedge.median)}, ${wedge.count} chains` }), _jsx("path", { className: "n4chains-wedge-arc", d: annularSector(cx0, cy0, rIn, rOut, wedge.a0, wedge.a1), fill: effectColor(wedge.median, flow.baseline, halfRange) }), arc > 34 && ringW >= 15 ? (_jsx("text", { className: "n4chains-wedge-label", x: round(lx), y: round(ly + 3), textAnchor: "middle", transform: `rotate(${labelRotation(mid)} ${round(lx)} ${round(ly)})`, fill: effectTextColor(wedge.median, flow.baseline, halfRange), children: wedge.label })) : null] }, wedge.key));
                    })] }), _jsxs("footer", { className: "n4chains-orbit-foot", children: [_jsxs("span", { className: "n4chains-orbit-role", children: [_jsx("span", { className: "n4chains-chip-dom", style: { background: roleColor(flow.role, roleColors) } }), CHAIN_ROLE_LABELS[flow.role]] }), _jsx("span", { className: "n4chains-orbit-flow", children: "centre = predecessors \u00B7 outer = successors" }), _jsxs("span", { className: "n4chains-orbit-legend", "aria-hidden": "true", children: [_jsx("span", { style: { color: "#0f766e" }, children: "better" }), _jsx("span", { className: "n4chains-orbit-ramp" }), _jsx("span", { style: { color: "#b45309" }, children: "worse" })] })] })] }));
}
//# sourceMappingURL=ChainNodeHub.js.map