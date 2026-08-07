import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { clamp } from "../viz/geometry.js";
import { cx } from "./_cx.js";
import { buildAnalysis, fromScoredChains, positionMatrix, sequenceMatrix, tokenContexts, } from "./analysis.js";
import { ChainScoreBeeswarm } from "./ChainScoreBeeswarm.js";
import { effectColor, roleColor } from "./colors.js";
import { NodeEffectForest } from "./NodeEffectForest.js";
import { PositionEffectHeatmap } from "./PositionEffectHeatmap.js";
import { SequenceEffectHeatmap } from "./SequenceEffectHeatmap.js";
import { CHAIN_LENS_LABELS, CHAIN_ROLE_LABELS, CHAIN_TRANSFORM_ROLES } from "./types.js";
const DEFAULT_METRIC = { key: "nrmse", label: "nRMSE", lowerIsBetter: true };
const LENS_ORDER = ["rankByDataset", "zByDataset", "raw"];
function uniqueStrings(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
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
    return `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value))}`;
}
function toggle(set, key) {
    const next = new Set(set);
    if (next.has(key))
        next.delete(key);
    else
        next.add(key);
    return next;
}
/**
 * Interactive chain-effect explorer — the flagship that turns a corpus of
 * hundreds of scored chains into the influence of each node in a single
 * component. Pick a normalization lens, filter by source / dataset / role, and
 * click a node in the forest to isolate it: its with/without distribution
 * shift, its early/mid/late position profile, the predecessor × successor order
 * matrix, and its best neighbouring contexts. Local UI state only — no app
 * state, network, storage, or runtime execution. Ships with
 * `nirs4all-ui/assets/chains.css`.
 */
export function ChainExplorer({ chains, analysis: providedAnalysis, metric = DEFAULT_METRIC, defaultLens = "rankByDataset", defaultSelectedToken, width = 1120, title = "Chain effect explorer", className, roleColors, }) {
    const rawMode = Array.isArray(chains);
    const [lens, setLens] = useState(rawMode ? defaultLens : (providedAnalysis?.lens ?? defaultLens));
    const [sortBy, setSortBy] = useState("delta");
    const [positionMode, setPositionMode] = useState("phase");
    const [excludedSources, setExcludedSources] = useState(new Set());
    const [excludedDatasets, setExcludedDatasets] = useState(new Set());
    const [excludedRoles, setExcludedRoles] = useState(new Set());
    const [selectedTokenState, setSelectedTokenState] = useState(defaultSelectedToken ?? null);
    const universe = useMemo(() => {
        if (rawMode && chains) {
            const roles = new Set();
            for (const chain of chains)
                for (const step of chain.steps)
                    roles.add(step.role);
            return {
                sources: uniqueStrings(chains.map((chain) => chain.source ?? "∗")),
                datasets: uniqueStrings(chains.map((chain) => chain.dataset ?? "∗")),
                roles: [...roles],
            };
        }
        const base = providedAnalysis;
        return {
            sources: base ? [...base.sources] : [],
            datasets: base ? [...base.datasets] : [],
            roles: base ? [...base.roles] : [],
        };
    }, [rawMode, chains, providedAnalysis]);
    const analysis = useMemo(() => {
        if (rawMode && chains) {
            const filtered = chains.filter((chain) => !excludedSources.has(chain.source ?? "∗") && !excludedDatasets.has(chain.dataset ?? "∗"));
            return fromScoredChains(filtered, { metric, lens });
        }
        if (providedAnalysis) {
            const filtered = providedAnalysis.points.filter((point) => !excludedSources.has(point.source) && !excludedDatasets.has(point.dataset));
            return buildAnalysis(filtered, { metric: providedAnalysis.metric, lens: providedAnalysis.lens });
        }
        return null;
    }, [rawMode, chains, providedAnalysis, metric, lens, excludedSources, excludedDatasets]);
    const activeRoles = universe.roles.filter((role) => !excludedRoles.has(role));
    const forestRoles = activeRoles.length > 0 ? activeRoles : universe.roles;
    const visibleTokens = useMemo(() => (analysis ? analysis.tokens.filter((token) => forestRoles.includes(token.role)) : []), [analysis, forestRoles]);
    const selectedToken = selectedTokenState && visibleTokens.some((token) => token.token === selectedTokenState)
        ? selectedTokenState
        : visibleTokens[0]?.token ?? null;
    const selectedEffect = analysis?.tokens.find((token) => token.token === selectedToken) ?? null;
    const position = useMemo(() => (analysis ? positionMatrix(analysis, { mode: positionMode, minCount: 3 }) : null), [analysis, positionMode]);
    const sequence = useMemo(() => (analysis ? sequenceMatrix(analysis, { minCount: 3, maxTokens: 7 }) : null), [analysis]);
    const contexts = useMemo(() => (analysis && selectedToken ? tokenContexts(analysis, selectedToken, { minCount: 3 }) : null), [analysis, selectedToken]);
    if (!analysis || analysis.total === 0) {
        return (_jsx("div", { className: cx("n4chains-explorer", className), style: { width }, children: _jsx("div", { className: "n4chains-empty", children: "No chains to analyze." }) }));
    }
    const halfRange = Math.max(Math.abs(analysis.goodnessExtent.max - analysis.baseline), Math.abs(analysis.baseline - analysis.goodnessExtent.min)) || 1;
    const renderContexts = (rows, verb) => {
        if (rows.length === 0)
            return _jsx("p", { className: "n4chains-ctx-empty", children: "Not enough data." });
        const top = rows.slice(0, 5);
        return (_jsx("ul", { className: "n4chains-ctx-list", children: top.map((row) => {
                const t = clamp((row.stat.median - analysis.goodnessExtent.min) / (analysis.goodnessExtent.max - analysis.goodnessExtent.min || 1), 0, 1);
                return (_jsxs("li", { className: "n4chains-ctx-row", children: [_jsxs("span", { className: "n4chains-ctx-name", children: [_jsx("span", { className: "n4chains-chip-dom", style: { background: roleColor(row.role, roleColors) } }), verb, " ", row.label] }), _jsx("span", { className: "n4chains-ctx-bar", children: _jsx("span", { className: "n4chains-ctx-fill", style: { width: `${(t * 100).toFixed(1)}%`, background: effectColor(row.stat.median, analysis.baseline, halfRange) } }) }), _jsx("span", { className: cx("n4chains-ctx-delta", row.delta >= 0 ? "is-up" : "is-down"), children: fmtDelta(row.delta) }), _jsxs("span", { className: "n4chains-ctx-n", children: ["n=", row.stat.n] })] }, row.token));
            }) }));
    };
    return (_jsxs("div", { className: cx("n4chains-explorer", className), style: { width }, children: [_jsxs("header", { className: "n4chains-toolbar", children: [_jsxs("div", { className: "n4chains-toolbar-main", children: [_jsx("h3", { className: "n4chains-heading", children: title }), _jsxs("div", { className: "n4chains-summary", children: [_jsxs("span", { className: "n4chains-stat", children: [_jsx("strong", { children: analysis.total }), " chains"] }), _jsxs("span", { className: "n4chains-stat", children: [_jsx("strong", { children: analysis.datasets.length }), " datasets"] }), _jsxs("span", { className: "n4chains-stat", children: [_jsx("strong", { children: analysis.sources.length }), " sources"] }), _jsxs("span", { className: "n4chains-stat", children: [_jsx("strong", { children: analysis.tokens.length }), " nodes"] }), _jsx("span", { className: "n4chains-stat n4chains-stat--metric", children: analysis.metric.label })] })] }), _jsx("div", { className: "n4chains-toolbar-controls", children: _jsx("div", { className: "n4chains-seg", role: "group", "aria-label": "Normalization lens", children: LENS_ORDER.map((option) => (_jsx("button", { type: "button", className: cx("n4chains-seg-btn", lens === option && "is-active"), "aria-pressed": lens === option, disabled: !rawMode && option !== analysis.lens, onClick: () => rawMode && setLens(option), children: CHAIN_LENS_LABELS[option] }, option))) }) })] }), _jsxs("div", { className: "n4chains-filters", children: [_jsx(FilterGroup, { label: "Role", options: universe.roles.map((role) => ({ key: role, label: CHAIN_ROLE_LABELS[role], color: roleColor(role, roleColors) })), excluded: excludedRoles, onToggle: (key) => setExcludedRoles((prev) => toggle(prev, key)) }), universe.sources.length > 1 ? (_jsx(FilterGroup, { label: "Source", options: universe.sources.map((source) => ({ key: source, label: source })), excluded: excludedSources, onToggle: (key) => setExcludedSources((prev) => toggle(prev, key)) })) : null, universe.datasets.length > 1 ? (_jsx(FilterGroup, { label: "Dataset", options: universe.datasets.map((dataset) => ({ key: dataset, label: dataset })), excluded: excludedDatasets, onToggle: (key) => setExcludedDatasets((prev) => toggle(prev, key)) })) : null] }), _jsxs("div", { className: "n4chains-cols", children: [_jsxs("section", { className: "n4chains-panel n4chains-panel--forest", children: [_jsxs("div", { className: "n4chains-panel-head", children: [_jsx("span", { children: "Node influence ranking" }), _jsx("div", { className: "n4chains-seg n4chains-seg--sm", role: "group", "aria-label": "Sort", children: ["delta", "median", "coverage"].map((option) => (_jsx("button", { type: "button", className: cx("n4chains-seg-btn", sortBy === option && "is-active"), "aria-pressed": sortBy === option, onClick: () => setSortBy(option), children: option === "delta" ? "Δ effect" : option === "median" ? "median" : "coverage" }, option))) })] }), _jsx(NodeEffectForest, { analysis: analysis, roles: forestRoles, sortBy: sortBy, selectedToken: selectedToken, onSelectToken: setSelectedTokenState, width: Math.round(width * 0.44), hideTitle: true, roleColors: roleColors })] }), _jsx("section", { className: "n4chains-panel n4chains-panel--detail", children: selectedEffect ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "n4chains-detail-head", children: [_jsx("span", { className: "n4chains-chip-dom", style: { background: roleColor(selectedEffect.role, roleColors) } }), _jsx("strong", { children: selectedEffect.label }), _jsx("span", { className: "n4chains-detail-role", children: CHAIN_ROLE_LABELS[selectedEffect.role] }), _jsxs("span", { className: cx("n4chains-detail-delta", selectedEffect.delta >= 0 ? "is-up" : "is-down"), children: [fmtDelta(selectedEffect.delta), " vs without"] }), _jsxs("span", { className: "n4chains-detail-cov", children: [Math.round(selectedEffect.coverage * 100), "% of chains"] })] }), _jsx(ChainScoreBeeswarm, { analysis: analysis, focusToken: selectedEffect.token, width: Math.round(width * 0.5), height: 200 }), _jsxs("div", { className: "n4chains-ctx", children: [_jsxs("div", { className: "n4chains-ctx-col", children: [_jsx("span", { className: "n4chains-ctx-title", children: "Best when placed after\u2026" }), contexts ? renderContexts(contexts.predecessors, "after") : null] }), _jsxs("div", { className: "n4chains-ctx-col", children: [_jsx("span", { className: "n4chains-ctx-title", children: "Best when followed by\u2026" }), contexts ? renderContexts(contexts.successors, "before") : null] })] })] })) : (_jsx("p", { className: "n4chains-ctx-empty", children: "Select a node to inspect its influence." })) })] }), _jsxs("div", { className: "n4chains-cols n4chains-cols--matrices", children: [_jsxs("section", { className: "n4chains-panel", children: [_jsxs("div", { className: "n4chains-panel-head", children: [_jsx("span", { children: "Effect by position" }), _jsx("div", { className: "n4chains-seg n4chains-seg--sm", role: "group", "aria-label": "Position mode", children: ["phase", "absolute"].map((option) => (_jsx("button", { type: "button", className: cx("n4chains-seg-btn", positionMode === option && "is-active"), "aria-pressed": positionMode === option, onClick: () => setPositionMode(option), children: option === "phase" ? "early/mid/late" : "1st/2nd/…" }, option))) })] }), position ? (_jsx(PositionEffectHeatmap, { matrix: position, width: Math.round(width * 0.47), selectedToken: selectedToken, onSelectToken: setSelectedTokenState, hideTitle: true, roleColors: roleColors })) : null] }), _jsxs("section", { className: "n4chains-panel", children: [_jsxs("div", { className: "n4chains-panel-head", children: [_jsx("span", { children: "Effect by order" }), _jsx("span", { className: "n4chains-panel-note", children: "preprocessing stack \u00B7 top nodes" })] }), sequence ? _jsx(SequenceEffectHeatmap, { matrix: sequence, width: Math.round(width * 0.47), hideTitle: true, roleColors: roleColors }) : null] })] })] }));
}
function FilterGroup({ label, options, excluded, onToggle, }) {
    return (_jsxs("div", { className: "n4chains-filter-group", children: [_jsx("span", { className: "n4chains-filter-label", children: label }), _jsx("div", { className: "n4chains-filter-chips", children: options.map((option) => {
                    const active = !excluded.has(option.key);
                    return (_jsxs("button", { type: "button", className: cx("n4chains-fchip", active ? "is-active" : "is-off"), "aria-pressed": active, onClick: () => onToggle(option.key), children: [option.color ? _jsx("span", { className: "n4chains-chip-dom", style: { background: option.color } }) : null, option.label] }, option.key));
                }) })] }));
}
//# sourceMappingURL=ChainExplorer.js.map