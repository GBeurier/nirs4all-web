import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { buildDecisionView, } from './decision.js';
/**
 * Compact traffic-light badge for one decision (🟢🟠🔴🔵). Presentational only:
 * the colour comes from the pure decision view-model; the host supplies the icon
 * nodes and may override any class.
 */
export function DecisionBadge({ input, thresholds, view, locale = 'fr', icons, showLabel = true, label, applyTone = true, className, toneClassName, iconClassName, labelClassName, title, }) {
    const v = view ?? buildDecisionView(input ?? {}, thresholds, locale);
    const icon = icons?.[v.icon] ?? null;
    const tone = toneClassName ?? (applyTone ? cx(v.colorClass, v.bgClass) : undefined);
    return (_jsxs("span", { className: cx(className, tone), "data-decision": v.color, title: title ?? v.reason, children: [icon ? _jsx("span", { className: iconClassName, children: icon }) : null, showLabel ? _jsx("span", { className: labelClassName, children: label ?? v.label }) : null] }));
}
//# sourceMappingURL=DecisionBadge.js.map