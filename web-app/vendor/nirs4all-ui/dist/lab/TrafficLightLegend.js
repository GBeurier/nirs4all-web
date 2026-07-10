import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { DECISION_DISPLAY, } from './decision.js';
import { loc } from './locale.js';
/** Order the four colours are shown in the legend. */
const LEGEND_ORDER = ['reliable', 'caution', 'out_of_domain', 'informative'];
/**
 * Pedagogical legend of the four-colour decision contract (§4bis). Reads the
 * shared `DECISION_DISPLAY` catalogue so the legend can never drift from the
 * decisions the app actually makes. Presentational.
 */
export function TrafficLightLegend({ icons, colors = LEGEND_ORDER, showAction = true, applyTone = true, locale = 'fr', className, itemClassName, toneClassName, iconClassName, labelClassName, actionClassName, }) {
    return (_jsx("ul", { className: className, children: colors.map((color) => {
            const d = DECISION_DISPLAY[color];
            const icon = icons?.[d.icon] ?? null;
            const toneFg = applyTone ? d.colorClass : undefined;
            return (_jsxs("li", { className: cx(itemClassName, toneClassName ?? (applyTone ? d.bgClass : undefined)), "data-decision": color, children: [icon ? _jsx("span", { className: cx(iconClassName, toneFg), children: icon }) : null, _jsx("span", { className: cx(labelClassName, toneFg), children: loc(d.label, locale) }), showAction ? _jsx("span", { className: actionClassName, children: loc(d.action, locale) }) : null] }, color));
        }) }));
}
//# sourceMappingURL=TrafficLightLegend.js.map