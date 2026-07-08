import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { buildModelReportView, } from './modelReport.js';
/** The model "bulletin" (§3 Écran 4). Presentational; grade from the view-model. */
export function ModelReportCard({ metrics, thresholds, view, locale = 'fr', title, renderMetric, metricToneClassName, applyTone = true, className, toneClassName, headerClassName, verdictClassName, gradeLabelClassName, metricsClassName, metricRowClassName, metricLabelClassName, metricValueClassName, metricReadingClassName, empty, }) {
    const v = view ?? (metrics ? buildModelReportView(metrics, thresholds, locale) : null);
    if (!v)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    const toneFg = applyTone ? v.colorClass : undefined;
    return (_jsxs("article", { className: cx(className, toneClassName ?? (applyTone ? v.bgClass : undefined)), "data-grade": v.grade, children: [_jsxs("header", { className: headerClassName, children: [title, _jsx("span", { className: cx(gradeLabelClassName, toneFg), children: v.gradeLabel }), _jsx("span", { className: cx(verdictClassName, toneFg), children: v.verdict })] }), _jsx("dl", { className: metricsClassName, children: v.metrics.map((m) => renderMetric ? (_jsx("div", { children: renderMetric(m) }, m.key)) : (_jsxs("div", { className: cx(metricRowClassName, metricToneClassName?.[m.tone]), "data-metric": m.key, "data-tone": m.tone, children: [_jsx("dt", { className: metricLabelClassName, children: m.label }), _jsx("dd", { className: metricValueClassName, children: m.display }), _jsx("dd", { className: metricReadingClassName, children: m.reading })] }, m.key))) })] }));
}
//# sourceMappingURL=ModelReportCard.js.map