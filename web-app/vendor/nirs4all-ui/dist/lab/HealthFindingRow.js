import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { buildHealthFindingView, formatAffected, } from './health.js';
/** One row of the "Santé des données" check-list (§3 Écran 2). Presentational. */
export function HealthFindingRow({ finding, view, icons, renderAction, explanation, applyTone = true, className, toneClassName, iconClassName, titleClassName, detailClassName, affectedClassName, actionLabelClassName, empty, }) {
    const v = view ?? (finding ? buildHealthFindingView(finding) : null);
    if (!v)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    const icon = icons?.[v.icon] ?? null;
    const affected = formatAffected(v.affectedCount);
    const action = renderAction
        ? renderAction(v)
        : _jsx("span", { className: actionLabelClassName, children: v.actionLabel });
    return (_jsxs("li", { className: cx(className, toneClassName ?? (applyTone ? v.bgClass : undefined)), "data-finding-id": v.id, "data-severity": v.severity, children: [icon ? _jsx("span", { className: cx(iconClassName, applyTone ? v.colorClass : undefined), children: icon }) : null, _jsxs("div", { children: [_jsx("span", { className: titleClassName, children: v.title }), v.detail ? _jsx("span", { className: detailClassName, children: v.detail }) : null, affected ? _jsx("span", { className: affectedClassName, children: affected }) : null, explanation] }), action] }));
}
//# sourceMappingURL=HealthFindingRow.js.map