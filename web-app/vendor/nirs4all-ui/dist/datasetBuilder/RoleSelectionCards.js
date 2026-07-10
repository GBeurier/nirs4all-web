import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { icon } from "./icons.js";
import { ROLE_DESCRIPTORS, ROLE_ORDER } from "./roles.js";
/** The big clickable role cards; clicking applies the role to the selection. */
export function RoleSelectionCards({ selectedCount = 0, activeRole, onAssignRole, roles = ROLE_ORDER, locale = "fr", icons, className, }) {
    return (_jsxs("div", { className: cx("dsb-roles", className), role: "group", children: [roles.map((role) => {
                const descriptor = ROLE_DESCRIPTORS[role];
                return (_jsxs("button", { type: "button", className: "dsb-role-card", "data-role": descriptor.token, "data-active": activeRole === role || undefined, "aria-pressed": activeRole === role, onClick: () => onAssignRole(role), title: descriptor.hints[locale], children: [_jsx("span", { className: "dsb-role-card__icon", children: icon(role, icons) }), _jsx("span", { className: "dsb-role-card__label", children: descriptor.labels[locale] }), _jsx("span", { className: "dsb-role-card__desc", children: descriptor.descriptions[locale] }), _jsx("span", { className: "dsb-role-card__hint", children: descriptor.hints[locale] })] }, role));
            }), _jsx("p", { className: "dsb-roles__hint", "data-has-selection": selectedCount > 0 || undefined, children: selectedCount > 0
                    ? locale === "en"
                        ? `Applies to ${selectedCount} selected column(s)`
                        : `S'applique aux ${selectedCount} colonne(s) sélectionnée(s)`
                    : locale === "en"
                        ? "Select columns below, then pick a role"
                        : "Sélectionnez des colonnes ci-dessous, puis choisissez un rôle" })] }));
}
//# sourceMappingURL=RoleSelectionCards.js.map