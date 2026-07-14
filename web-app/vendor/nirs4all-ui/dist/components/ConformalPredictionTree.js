import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { clamp, makeScale, niceExtent, quantileSorted, round, } from "../viz/geometry.js";
import { N4_VIZ_COLORS } from "../viz/theme.js";
import { conformalBandShade } from "../viz/ConformalIntervalStrip.js";
const COVERED_COLOR = "#059669";
const MISSED_COLOR = N4_VIZ_COLORS.rose;
const PREDICTION_COLOR = N4_VIZ_COLORS.indigo;
function cellWidth(cell) {
    return cell.upper - cell.lower;
}
function coversActual(cell, actual) {
    return actual >= cell.lower && actual <= cell.upper;
}
/**
 * Project calibrated prediction rows into a grouped, nesting-aware tree model —
 * the pure view-model behind {@link ConformalPredictionTree}. Grouping is by
 * where the truth falls within the nested intervals (conformance) when ground
 * truth is present, otherwise by interval width (uncertainty).
 */
export function buildConformalTreeModel(rows, options = {}) {
    const { actuals, targetCoverage = null, groupBy = "auto" } = options;
    const coverages = [...new Set(rows.flatMap((row) => row.intervals.map((cell) => cell.coverage)))]
        .filter((coverage) => Number.isFinite(coverage))
        .sort((a, b) => b - a);
    const minCoverage = coverages.length > 0 ? coverages[coverages.length - 1] : Number.NaN;
    const target = targetCoverage != null && coverages.includes(targetCoverage)
        ? targetCoverage
        : (coverages[0] ?? Number.NaN);
    const valuePool = [];
    const samples = rows.map((row, index) => {
        const rawActual = actuals?.[index];
        const actual = rawActual != null && Number.isFinite(rawActual) ? rawActual : null;
        valuePool.push(row.yPred);
        if (actual != null)
            valuePool.push(actual);
        let widest = 0;
        let tightestCovering = null;
        for (const cell of row.intervals) {
            valuePool.push(cell.lower, cell.upper);
            widest = Math.max(widest, cellWidth(cell));
            if (actual != null && coversActual(cell, actual)) {
                tightestCovering = tightestCovering == null ? cell.coverage : Math.min(tightestCovering, cell.coverage);
            }
        }
        const targetCell = row.intervals.find((cell) => cell.coverage === target) ?? null;
        return {
            index: row.index,
            sampleId: row.sampleId,
            prediction: row.yPred,
            predictionLabel: row.yPredLabel,
            actual,
            targetWidth: targetCell ? cellWidth(targetCell) : null,
            widestWidth: widest,
            coveredAtTarget: actual == null ? null : tightestCovering != null && tightestCovering <= target,
            tightestCovering,
            intervals: row.intervals,
        };
    });
    const hasActuals = samples.some((sample) => sample.actual != null);
    const mode = groupBy === "auto"
        ? (hasActuals ? "conformance" : "uncertainty")
        : groupBy;
    const domain = niceExtent(valuePool, 0.04);
    const tiers = mode === "conformance"
        ? conformanceTiers(samples, target, minCoverage)
        : mode === "uncertainty"
            ? uncertaintyTiers(samples)
            : flatTier(samples);
    return {
        tiers: tiers.filter((tier) => tier.count > 0),
        coverages,
        domain,
        target,
        total: samples.length,
        hasActuals,
        groupBy: mode,
    };
}
function tierWidth(sample) {
    return sample.targetWidth ?? sample.widestWidth;
}
function finalizeTier(id, label, description, tone, samples, total) {
    const widths = samples.map(tierWidth).filter((width) => Number.isFinite(width));
    const meanWidth = widths.length > 0 ? widths.reduce((sum, width) => sum + width, 0) / widths.length : null;
    return {
        id,
        label,
        description,
        tone,
        samples,
        count: samples.length,
        share: total > 0 ? samples.length / total : 0,
        meanWidth,
    };
}
function conformanceTiers(samples, target, minCoverage) {
    const core = [];
    const within = [];
    const wide = [];
    const violation = [];
    const unknown = [];
    for (const sample of samples) {
        if (sample.actual == null) {
            unknown.push(sample);
        }
        else if (sample.tightestCovering == null) {
            violation.push(sample);
        }
        else if (sample.tightestCovering <= minCoverage) {
            core.push(sample);
        }
        else if (sample.tightestCovering <= target) {
            within.push(sample);
        }
        else {
            wide.push(sample);
        }
    }
    return [
        finalizeTier("core", "Truth in the tightest band", "Covered even by the narrowest calibrated interval.", "success", core, samples.length),
        finalizeTier("within", "Covered at target", "Covered at the guarantee level but not the tightest band.", "success", within, samples.length),
        finalizeTier("wide", "Covered only when widened", "Truth falls outside the target band but inside a wider one.", "warning", wide, samples.length),
        finalizeTier("violation", "Interval violations", "Truth escapes every calibrated interval.", "danger", violation, samples.length),
        finalizeTier("unknown", "No ground truth", "Prediction intervals only — no observed value to score.", "neutral", unknown, samples.length),
    ];
}
function uncertaintyTiers(samples) {
    const sortedWidths = samples.map(tierWidth).filter((width) => Number.isFinite(width)).sort((a, b) => a - b);
    const q33 = quantileSorted(sortedWidths, 1 / 3);
    const q66 = quantileSorted(sortedWidths, 2 / 3);
    const tight = [];
    const moderate = [];
    const broad = [];
    for (const sample of samples) {
        const width = tierWidth(sample);
        if (width <= q33)
            tight.push(sample);
        else if (width <= q66)
            moderate.push(sample);
        else
            broad.push(sample);
    }
    return [
        finalizeTier("tight", "Tight intervals", "The most confident predictions — narrowest calibrated intervals.", "success", tight, samples.length),
        finalizeTier("moderate", "Typical intervals", "Interval widths around the median of the set.", "neutral", moderate, samples.length),
        finalizeTier("broad", "Wide intervals", "The least certain predictions — widest calibrated intervals.", "warning", broad, samples.length),
    ];
}
function flatTier(samples) {
    return [finalizeTier("all", "All predictions", "Every calibrated prediction.", "neutral", samples, samples.length)];
}
function fmtCoverage(coverage) {
    if (!Number.isFinite(coverage))
        return "—";
    const percent = coverage * 100;
    return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}
function fmtShare(share) {
    const percent = share * 100;
    return `${percent < 10 && percent > 0 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}
function fmtWidth(width) {
    if (width == null || !Number.isFinite(width))
        return "—";
    if (Math.abs(width) >= 1000)
        return width.toFixed(0);
    if (Math.abs(width) >= 1)
        return width.toFixed(2);
    return width.toFixed(3);
}
function shadeForCoverage(coverage, coverages) {
    if (coverages.length <= 1)
        return conformalBandShade(0.62);
    const rank = coverages.indexOf(coverage);
    return conformalBandShade(rank / (coverages.length - 1));
}
/** Per-sample horizontal nesting of the calibrated intervals + truth marker. */
function NestedBandGlyph({ sample, coverages, domain, width, height = 22 }) {
    const padX = 3;
    const scale = makeScale(domain, padX, width - padX);
    const barTop = 3;
    const barHeight = height - barTop * 2;
    const bands = [...sample.intervals].sort((a, b) => b.coverage - a.coverage);
    return (_jsxs("svg", { className: "n4conf-glyph", viewBox: `0 0 ${width} ${height}`, width: width, height: height, role: "img", "aria-label": `Nested intervals for ${sample.sampleId ?? `sample ${sample.index}`}`, preserveAspectRatio: "none", children: [bands.map((cell) => {
                const x1 = scale(cell.lower);
                const x2 = scale(cell.upper);
                return (_jsx("rect", { className: "n4conf-glyph-band", x: round(Math.min(x1, x2)), y: barTop, width: round(Math.abs(x2 - x1)), height: barHeight, rx: 2, fill: shadeForCoverage(cell.coverage, coverages) }, `b-${cell.coverage}`));
            }), _jsx("line", { className: "n4conf-glyph-point", x1: round(scale(sample.prediction)), x2: round(scale(sample.prediction)), y1: barTop - 1, y2: height - barTop + 1, stroke: PREDICTION_COLOR, strokeWidth: 2 }), sample.actual != null ? (sample.coveredAtTarget !== false ? (_jsx("circle", { cx: round(scale(sample.actual)), cy: height / 2, r: 3.2, fill: COVERED_COLOR, stroke: "var(--n4-color-surface, #fff)", strokeWidth: 1.5 })) : (_jsx("path", { d: diamond(scale(sample.actual), height / 2, 3.8), fill: MISSED_COLOR, stroke: "var(--n4-color-surface, #fff)", strokeWidth: 1.5 }))) : null] }));
}
/**
 * Calibrated **predictions as a nested conformance tree** — the drill-down
 * companion to {@link file://../viz/ConformalIntervalStrip.tsx ConformalIntervalStrip}.
 * Predictions are grouped into conformance tiers (where the truth lands inside
 * the nested intervals) or uncertainty tiers (interval width), each tier opening
 * into per-sample nodes that carry a nesting glyph, and each sample opening into
 * its per-coverage interval rows. Presentational + local `<details>` state only;
 * hosts pass `conformal` view-model rows. Default styles ship at
 * `nirs4all-ui/assets/conformal.css`.
 */
export function ConformalPredictionTree({ rows, actuals, summaries, guarantee = null, targetCoverage = null, groupBy = "auto", unit, defaultOpenTiers = true, maxSamplesPerTier = 50, glyphWidth = 150, className, empty, }) {
    if (rows.length === 0)
        return empty == null ? _jsx("div", { className: cx("n4conf-tree", className) }) : _jsx(_Fragment, { children: empty });
    const model = buildConformalTreeModel(rows, { actuals, targetCoverage, groupBy });
    const qhatByCoverage = new Map((summaries ?? []).map((row) => [row.coverage, row.qhatLabel]));
    const maxWidth = Math.max(1e-9, ...rows.flatMap((row) => row.intervals.map((cell) => cell.width)));
    const unitSuffix = unit ? ` ${unit}` : "";
    return (_jsxs("div", { className: cx("n4conf-tree", className), children: [guarantee ? (_jsxs("header", { className: "n4conf-guarantee", "data-tone": guarantee.tone, children: [_jsx("span", { className: "n4conf-guarantee-status", "data-status": guarantee.status }), _jsx("span", { className: "n4conf-guarantee-label", children: guarantee.label }), _jsxs("span", { className: "n4conf-guarantee-meta", children: [guarantee.method, " \u00B7 ", guarantee.effectiveEngine, " \u00B7 target ", guarantee.coverageLabel] })] })) : null, _jsxs("div", { className: "n4conf-legend", role: "note", children: [_jsxs("span", { className: "n4conf-legend-item", children: [_jsx("i", { className: "n4conf-swatch", style: { background: PREDICTION_COLOR } }), " prediction"] }), model.hasActuals ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: "n4conf-legend-item", children: [_jsx("i", { className: "n4conf-dot", style: { background: COVERED_COLOR } }), " covered"] }), _jsxs("span", { className: "n4conf-legend-item", children: [_jsx("i", { className: "n4conf-diamond", style: { background: MISSED_COLOR } }), " missed"] })] })) : null, _jsxs("span", { className: "n4conf-legend-item n4conf-legend-ramp", "aria-hidden": "true", children: [model.coverages.map((coverage) => (_jsx("i", { className: "n4conf-swatch", title: fmtCoverage(coverage), style: { background: shadeForCoverage(coverage, model.coverages) } }, coverage))), _jsx("span", { className: "n4conf-legend-ramp-label", children: "wide \u2192 tight" })] })] }), model.tiers.map((tier) => (_jsxs("details", { className: "n4conf-tier", "data-tone": tier.tone, open: defaultOpenTiers, children: [_jsxs("summary", { className: "n4conf-tier-summary", children: [_jsx("span", { className: "n4conf-chevron", "aria-hidden": "true" }), _jsx("span", { className: "n4conf-tier-label", children: tier.label }), _jsx("span", { className: "n4conf-tier-desc", children: tier.description }), _jsxs("span", { className: "n4conf-tier-stats", children: [_jsx("span", { className: "n4conf-badge", children: tier.count }), _jsx("span", { className: "n4conf-share", children: fmtShare(tier.share) }), _jsxs("span", { className: "n4conf-meanwidth", children: ["x\u0304 width ", fmtWidth(tier.meanWidth), unitSuffix] })] })] }), _jsxs("div", { className: "n4conf-samples", children: [tier.samples.slice(0, maxSamplesPerTier).map((sample) => (_jsxs("details", { className: "n4conf-sample", children: [_jsxs("summary", { className: "n4conf-sample-summary", children: [_jsx("span", { className: "n4conf-chevron", "aria-hidden": "true" }), _jsx("span", { className: "n4conf-sample-id", children: sample.sampleId ?? `#${sample.index}` }), _jsxs("span", { className: "n4conf-sample-pred", children: ["\u0177 ", sample.predictionLabel, unitSuffix] }), _jsx(NestedBandGlyph, { sample: sample, coverages: model.coverages, domain: model.domain, width: glyphWidth }), sample.coveredAtTarget == null ? (_jsxs("span", { className: "n4conf-chip", "data-tone": "neutral", children: ["\u00B1", fmtWidth(sample.targetWidth ?? sample.widestWidth)] })) : sample.coveredAtTarget ? (_jsxs("span", { className: "n4conf-chip", "data-tone": "success", children: ["covered ", sample.tightestCovering != null ? fmtCoverage(sample.tightestCovering) : ""] })) : (_jsx("span", { className: "n4conf-chip", "data-tone": "danger", children: "missed" }))] }), _jsx("div", { className: "n4conf-levels", children: [...sample.intervals].sort((a, b) => a.coverage - b.coverage).map((cell) => {
                                            const covered = sample.actual == null ? null : coversActual(cell, sample.actual);
                                            const qhat = qhatByCoverage.get(cell.coverage);
                                            return (_jsxs("div", { className: "n4conf-level", "data-covered": covered == null ? "na" : covered ? "yes" : "no", children: [_jsx("span", { className: "n4conf-level-cov", children: cell.coverageLabel }), qhat ? _jsxs("span", { className: "n4conf-level-qhat", children: ["q\u0302 ", qhat] }) : null, _jsxs("span", { className: "n4conf-level-range", children: ["[", cell.lowerLabel, ", ", cell.upperLabel, "]"] }), _jsx("span", { className: "n4conf-level-bar", "aria-hidden": "true", children: _jsx("i", { className: "n4conf-level-bar-fill", style: { width: `${clamp((cell.width / maxWidth) * 100, 2, 100)}%`, background: shadeForCoverage(cell.coverage, model.coverages) } }) }), _jsxs("span", { className: "n4conf-level-width", children: [cell.widthLabel, unitSuffix] }), covered != null ? (_jsx("span", { className: "n4conf-level-mark", "data-covered": covered ? "yes" : "no", children: covered ? "✓" : "✗" })) : null] }, cell.coverage));
                                        }) })] }, sample.index))), tier.samples.length > maxSamplesPerTier ? (_jsxs("p", { className: "n4conf-more", children: ["+", tier.samples.length - maxSamplesPerTier, " more predictions"] })) : null] })] }, tier.id)))] }));
}
function diamond(cx, cy, radius) {
    const x = round(cx);
    const y = round(cy);
    const r = round(radius);
    return `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;
}
function cx(...parts) {
    const resolved = parts.filter((part) => typeof part === "string" && part.length > 0);
    return resolved.length > 0 ? resolved.join(" ") : undefined;
}
//# sourceMappingURL=ConformalPredictionTree.js.map