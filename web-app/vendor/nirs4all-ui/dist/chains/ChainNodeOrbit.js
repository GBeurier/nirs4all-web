import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { round } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { nodeFlow } from "./analysis.js";
import { effectColor, effectTextColor, roleColor } from "./colors.js";
import { annularSector, labelRotation, polar, START, TAU, treeDepth } from "./radial.js";
import { CHAIN_LENS_LABELS, CHAIN_ROLE_LABELS } from "./types.js";
function fmt(value) {
    if (!Number.isFinite(value))
        return "—";
    return value.toFixed(2);
}
/**
 * Radial flow navigator — a foldable, multi-ring sunburst. A focus node sits at
 * the centre; an inner ring shows the nodes that *precede* it, and 2–3 outer
 * rings show the *real ordered continuations* that follow (each ring one step
 * further down the pipeline), so a whole bounded chain is legible at a glance —
 * no clicking into meaningless infinity. Wedges are sized by chain count and
 * colored by the combined effect (teal = better, amber = worse). Click any
 * wedge to re-centre on that node; the breadcrumb walks back. Local UI state only.
 */
export function ChainNodeOrbit({ analysis, defaultFocusToken, roles, depth = 2, maxPerLevel = 6, minCount = 2, size = 460, onFocusChange, title = "Node flow", className, roleColors, }) {
    const hub = defaultFocusToken ?? analysis.tokens[0]?.token ?? "";
    const [path, setPath] = useState(hub ? [hub] : []);
    const focusToken = path[path.length - 1] ?? hub;
    const flow = useMemo(() => (path.length ? nodeFlow(analysis, path, { roles, depth, maxPerLevel, minCount }) : null), [analysis, path, roles, depth, maxPerLevel, minCount]);
    // Extend the *whole selected chain*: a successor is appended (forward), a
    // predecessor is prepended (backward). Rooting on the full ordered path means
    // an already-used node never reappears — no infinite back-and-forth.
    const extend = (wedge) => {
        setPath((prev) => (wedge.kind === "succ" ? [...prev, wedge.token] : [wedge.token, ...prev]));
        onFocusChange?.(wedge.token);
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
        return (_jsx("div", { className: cx("n4chains-orbit", className), style: { width: size }, children: _jsx("div", { className: "n4chains-empty", children: "No node to explore." }) }));
    }
    const cx0 = size / 2;
    const cy0 = size / 2;
    const rCenter = Math.round(size * 0.115);
    const rMax = size / 2 - 50;
    const innerStart = rCenter + 8;
    const ringGap = 3;
    const hasPred = flow.predecessors.length > 0;
    const succDepth = treeDepth(flow.successors);
    const totalRings = (hasPred ? 1 : 0) + succDepth;
    const succBase = hasPred ? 1 : 0;
    const ringW = totalRings > 0 ? (rMax - innerStart - ringGap * (totalRings - 1)) / totalRings : 0;
    const ringRadii = (ring) => {
        const rIn = innerStart + ring * (ringW + ringGap);
        return [rIn, rIn + ringW];
    };
    const halfRange = Math.max(Math.abs(flow.goodnessExtent.max - flow.baseline), Math.abs(flow.baseline - flow.goodnessExtent.min)) || 1;
    const wedges = [];
    // inner predecessor ring
    if (hasPred) {
        const total = flow.predecessors.reduce((sum, link) => sum + link.count, 0);
        const pad = flow.predecessors.length > 1 ? 0.02 : 0;
        const avail = TAU - pad * flow.predecessors.length;
        let cursor = START + pad / 2;
        flow.predecessors.forEach((link) => {
            const sweep = total > 0 ? (link.count / total) * avail : avail / flow.predecessors.length;
            wedges.push({
                key: `pred-${link.token}`,
                token: link.token,
                label: link.label,
                role: link.role,
                median: link.stat.median,
                count: link.count,
                ring: 0,
                a0: cursor,
                a1: cursor + sweep,
                kind: "pred",
            });
            cursor += sweep + pad;
        });
    }
    // outward successor sunburst
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
            wedges.push({
                key: `succ-${level}-${node.token}-${round(na0)}`,
                token: node.token,
                label: node.label,
                role: node.role,
                median: node.stat.median,
                count: node.count,
                ring: succBase + level,
                a0: na0,
                a1: na1,
                kind: "succ",
            });
            if (node.children.length > 0)
                layoutSucc(node.children, na0, na1, level + 1);
        }
    };
    layoutSucc(flow.successors, START, START + TAU, 0);
    // bounded breadcrumb: home … last-3
    const crumbIndices = path.length <= 5
        ? path.map((_, index) => index)
        : [0, "gap", path.length - 3, path.length - 2, path.length - 1];
    return (_jsxs("div", { className: cx("n4chains-orbit", className), style: { width: size }, children: [_jsxs("header", { className: "n4chains-orbit-head", children: [_jsx("span", { className: "n4chains-orbit-chainlabel", children: "chain" }), _jsx("nav", { className: "n4chains-orbit-crumbs", "aria-label": "Selected chain", children: crumbIndices.map((entry, i) => {
                            if (entry === "gap") {
                                return (_jsxs("span", { className: "n4chains-crumb-wrap", children: [_jsx("span", { className: "n4chains-crumb-sep", children: "\u203A" }), _jsx("span", { className: "n4chains-crumb-ellipsis", children: "\u2026" })] }, `gap-${i}`));
                            }
                            const token = path[entry];
                            const ref = analysis.tokens.find((item) => item.token === token);
                            const isLast = entry === path.length - 1;
                            return (_jsxs("span", { className: "n4chains-crumb-wrap", children: [i > 0 ? _jsx("span", { className: "n4chains-crumb-sep", children: "\u203A" }) : null, _jsx("button", { type: "button", className: cx("n4chains-crumb", isLast && "is-current"), onClick: () => jumpTo(entry), disabled: isLast, children: ref?.label ?? token })] }, `${token}-${entry}`));
                        }) }), _jsxs("span", { className: "n4chains-orbit-tools", children: [path.length > 1 ? (_jsx("button", { type: "button", className: "n4chains-orbit-reset", onClick: reset, children: "\u27F2 reset" })) : null, _jsx("span", { className: "n4chains-orbit-caption", children: CHAIN_LENS_LABELS[analysis.lens] })] })] }), _jsxs("svg", { className: cx("n4chains", "n4chains-orbit-svg"), viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": title, preserveAspectRatio: "xMidYMid meet", children: [_jsx("title", { children: `${flow.label} — flow (${flow.predecessors.length} in, ${succDepth} level(s) out)` }), wedges.map((wedge) => {
                        const [rIn, rOut] = ringRadii(wedge.ring);
                        const mid = (wedge.a0 + wedge.a1) / 2;
                        const rMid = (rIn + rOut) / 2;
                        const arcLen = (wedge.a1 - wedge.a0) * rMid;
                        const [lx, ly] = polar(cx0, cy0, rMid, mid);
                        const deg = labelRotation(mid);
                        const showLabel = arcLen > 34 && ringW >= 15;
                        return (_jsxs("g", { className: cx("n4chains-wedge", "is-interactive", wedge.kind === "pred" && "is-pred"), "data-role": wedge.role, onClick: () => extend(wedge), tabIndex: 0, role: "button", onKeyDown: (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    extend(wedge);
                                }
                            }, children: [_jsx("title", { children: `${wedge.kind === "pred" ? "prepend (before)" : "append (after)"} · ${wedge.label} — median ${fmt(wedge.median)}, ${wedge.count} chains` }), _jsx("path", { className: "n4chains-wedge-arc", d: annularSector(cx0, cy0, rIn, rOut, wedge.a0, wedge.a1), fill: effectColor(wedge.median, flow.baseline, halfRange) }), showLabel ? (_jsx("text", { className: "n4chains-wedge-label", x: round(lx), y: round(ly + 3), textAnchor: "middle", transform: `rotate(${round(deg)} ${round(lx)} ${round(ly)})`, fill: effectTextColor(wedge.median, flow.baseline, halfRange), children: wedge.label })) : null] }, wedge.key));
                    }), _jsx("circle", { className: cx("n4chains-orbit-center", path.length > 1 && "is-interactive"), cx: cx0, cy: cy0, r: rCenter, fill: effectColor(flow.self.median, flow.baseline, halfRange), onClick: path.length > 1 ? back : undefined, tabIndex: path.length > 1 ? 0 : undefined, role: path.length > 1 ? "button" : undefined, onKeyDown: path.length > 1
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    back();
                                }
                            }
                            : undefined, children: _jsx("title", { children: path.length > 1 ? "Back to previous node" : flow.label }) }), _jsx("text", { className: "n4chains-center-label", x: cx0, y: cy0 - 2, textAnchor: "middle", fill: effectTextColor(flow.self.median, flow.baseline, halfRange), children: flow.label }), _jsx("text", { className: "n4chains-center-value", x: cx0, y: cy0 + 12, textAnchor: "middle", fill: effectTextColor(flow.self.median, flow.baseline, halfRange), children: fmt(flow.self.median) })] }), _jsxs("footer", { className: "n4chains-orbit-foot", children: [_jsxs("span", { className: "n4chains-orbit-role", children: [_jsx("span", { className: "n4chains-chip-dom", style: { background: roleColor(flow.role, roleColors) } }), CHAIN_ROLE_LABELS[flow.role]] }), _jsx("span", { className: "n4chains-orbit-flow", children: "inner = before \u00B7 outer = after \u00B7 click to extend" }), _jsxs("span", { className: "n4chains-orbit-legend", "aria-hidden": "true", children: [_jsx("span", { style: { color: "#0f766e" }, children: "better" }), _jsx("span", { className: "n4chains-orbit-ramp" }), _jsx("span", { style: { color: "#b45309" }, children: "worse" })] })] })] }));
}
//# sourceMappingURL=ChainNodeOrbit.js.map