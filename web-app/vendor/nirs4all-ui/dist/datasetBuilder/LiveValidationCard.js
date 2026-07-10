import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
const LEVEL_ICON = { ok: "check", warning: "warning", error: "error" };
/** Real-time validation card: OK / warning / error checks with a header status. */
export function LiveValidationCard({ validation, locale = "fr", icons, trailing, className, title, }) {
    const t = STRINGS[locale];
    return (_jsxs("section", { className: cx("dsb-validation", className), "data-status": validation.status, "aria-label": title ?? t.liveValidation, children: [_jsxs("header", { className: "dsb-validation__head", children: [_jsx("span", { className: "dsb-validation__head-icon", children: icon(LEVEL_ICON[validation.status], icons) }), _jsx("strong", { children: title ?? t.liveValidation })] }), _jsx("ul", { className: "dsb-validation__list", children: validation.checks.map((check) => (_jsxs("li", { className: "dsb-validation__item", "data-level": check.level, children: [_jsx("span", { className: "dsb-validation__icon", children: icon(LEVEL_ICON[check.level], icons) }), _jsxs("span", { className: "dsb-validation__text", children: [_jsx("span", { className: "dsb-validation__label", children: check.label }), check.details ? _jsx("span", { className: "dsb-validation__details", children: check.details }) : null] }), trailing ? _jsx("span", { className: "dsb-validation__trailing", children: trailing(check) }) : null] }, check.id))) })] }));
}
//# sourceMappingURL=LiveValidationCard.js.map