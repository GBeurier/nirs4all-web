import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { buildDecisionView, } from './decision.js';
/**
 * The per-prediction reliability card (§3 Écran 5). ALWAYS shows: status +
 * main reason + authorized action + confidence + a detail affordance — never a
 * bare colour. Presentational; the decision comes from the pure view-model.
 */
export function DecisionCard({ sampleId, predicted, interval, unit, input, thresholds, view, locale = 'fr', icons, renderDetailLink, showDetail = true, detailLabel, formatValue, applyTone = true, className, toneClassName, headerClassName, valueClassName, intervalClassName, labelClassName, reasonClassName, actionClassName, confidenceClassName, detailClassName, iconClassName, }) {
    const v = view ?? buildDecisionView(input ?? {}, thresholds, locale);
    const icon = icons?.[v.icon] ?? null;
    const toneFg = applyTone ? v.colorClass : undefined;
    const toneBg = toneClassName ?? (applyTone ? v.bgClass : undefined);
    const valueNode = predicted == null
        ? null
        : formatValue
            ? formatValue(predicted)
            : `${predicted}${unit ? ` ${unit}` : ''}`;
    const detail = renderDetailLink
        ? renderDetailLink(v)
        : showDetail
            ? _jsx("span", { className: detailClassName, "data-detail": true, children: detailLabel ?? (locale === 'en' ? 'See details' : 'Voir le détail') })
            : null;
    return (_jsxs("article", { className: cx(className, toneBg), "data-decision": v.color, "data-sample-id": sampleId ?? undefined, children: [_jsxs("header", { className: headerClassName, children: [icon ? _jsx("span", { className: cx(iconClassName, toneFg), children: icon }) : null, _jsx("span", { className: cx(labelClassName, toneFg), children: v.label }), _jsx("span", { className: confidenceClassName, "data-confidence": v.confidence, children: confidenceLabel(v.confidence, locale) })] }), valueNode != null ? (_jsxs("div", { children: [_jsx("strong", { className: valueClassName, children: valueNode }), interval ? _jsx("span", { className: intervalClassName, children: interval }) : null] })) : null, _jsx("p", { className: reasonClassName, children: v.reason }), _jsx("p", { className: actionClassName, children: v.action }), detail] }));
}
function confidenceLabel(confidence, locale) {
    const en = locale === 'en';
    if (confidence === 'high')
        return en ? 'high confidence' : 'confiance élevée';
    if (confidence === 'medium')
        return en ? 'medium confidence' : 'confiance moyenne';
    return en ? 'low confidence' : 'confiance faible';
}
//# sourceMappingURL=DecisionCard.js.map