import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { isSpectralHeader } from "./detect.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
import { ROLE_DESCRIPTORS, ROLE_ORDER, roleLabel } from "./roles.js";
import { countRoles } from "./schema.js";
const TYPE_LABELS = {
    text: { fr: "Texte", en: "Text" },
    integer: { fr: "Entier", en: "Integer" },
    float: { fr: "Numérique", en: "Numeric" },
    boolean: { fr: "Booléen", en: "Boolean" },
    date: { fr: "Date", en: "Date" },
    unknown: { fr: "Inconnu", en: "Unknown" },
};
const FILTERS = ["all", "unassigned", "x", "y", "metadata", "id", "partition", "replicate"];
export function ColumnMappingTable({ columns, onToggleColumn, onToggleAll, onAssignColumnRole, onSelectSpectra, filter = "all", onFilterChange, hideAssigned = false, onToggleHideAssigned, locale = "fr", icons, showTip = true, className, }) {
    const t = STRINGS[locale];
    const stats = countRoles(columns);
    const progress = stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0;
    const spectralCount = columns.filter((c) => c.assignedRole === "x").length;
    const visible = columns.filter((col) => {
        if (hideAssigned && col.assignedRole !== "ignored")
            return false;
        if (filter === "all")
            return true;
        if (filter === "unassigned")
            return col.assignedRole === "ignored";
        return col.assignedRole === filter;
    });
    const allVisibleSelected = visible.length > 0 && visible.every((c) => c.selected);
    return (_jsxs("div", { className: cx("dsb-mapping", className), children: [_jsxs("div", { className: "dsb-mapping__toolbar", children: [_jsx("div", { className: "dsb-mapping__filters", role: "tablist", "aria-label": t.filterAll, children: FILTERS.map((f) => (_jsx("button", { type: "button", className: "dsb-chip", "data-active": filter === f || undefined, "data-role": f !== "all" && f !== "unassigned" ? ROLE_DESCRIPTORS[f]?.token : undefined, onClick: onFilterChange ? () => onFilterChange(f) : undefined, disabled: !onFilterChange, children: filterLabel(f, locale) }, f))) }), _jsxs("div", { className: "dsb-mapping__actions", children: [onSelectSpectra ? (_jsxs("button", { type: "button", className: "dsb-btn dsb-btn--ghost", onClick: onSelectSpectra, children: [icon("x", icons), " ", t.selectSpectra] })) : null, onToggleHideAssigned ? (_jsxs("label", { className: "dsb-mapping__toggle", children: [_jsx("input", { type: "checkbox", checked: hideAssigned, onChange: (e) => onToggleHideAssigned(e.target.checked) }), t.hideAssigned] })) : null] })] }), _jsxs("div", { className: "dsb-mapping__grid", children: [_jsx("div", { className: "dsb-mapping__table-wrap", children: _jsxs("table", { className: "dsb-mapping__table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "dsb-mapping__col-check", children: _jsx("input", { type: "checkbox", checked: allVisibleSelected, "aria-label": "select all", onChange: onToggleAll
                                                        ? (e) => onToggleAll(e.target.checked)
                                                        : (e) => visible.forEach((c) => onToggleColumn(c.id, e.target.checked)) }) }), _jsx("th", { children: t.columnHeaderName }), _jsx("th", { children: t.columnHeaderPreview }), _jsx("th", { children: t.columnHeaderType }), _jsx("th", { children: t.columnHeaderRole })] }) }), _jsxs("tbody", { children: [visible.map((col) => (_jsxs("tr", { "data-selected": col.selected || undefined, "data-role": ROLE_DESCRIPTORS[col.assignedRole].token, children: [_jsx("td", { className: "dsb-mapping__col-check", children: _jsx("input", { type: "checkbox", checked: Boolean(col.selected), "aria-label": col.name, onChange: (e) => onToggleColumn(col.id, e.target.checked) }) }), _jsxs("td", { className: "dsb-mapping__name", children: [col.name, isSpectralHeader(col.name) ? _jsx("span", { className: "dsb-mapping__wl", title: "wavelength", children: "nm" }) : null] }), _jsx("td", { className: "dsb-mapping__preview", children: formatPreview(col.previewValue) }), _jsx("td", { className: "dsb-mapping__type", children: TYPE_LABELS[col.detectedType][locale] }), _jsx("td", { className: "dsb-mapping__role", children: _jsxs("div", { className: "dsb-role-select", "data-role": ROLE_DESCRIPTORS[col.assignedRole].token, children: [_jsx("select", { value: col.assignedRole, onChange: (e) => onAssignColumnRole(col.id, e.target.value), "aria-label": `${col.name} role`, children: [...ROLE_ORDER, "ignored"].map((role) => (_jsx("option", { value: role, children: roleOptionLabel(col, role, locale) }, role))) }), _jsx("span", { className: "dsb-role-select__chevron", "aria-hidden": "true", children: icon("chevron", icons) })] }) })] }, col.id))), visible.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "dsb-mapping__empty", children: locale === "en" ? "No columns match this filter." : "Aucune colonne pour ce filtre." }) })) : null] })] }) }), showTip ? (_jsxs("aside", { className: "dsb-mapping__tip", children: [_jsxs("div", { className: "dsb-mapping__tip-head", children: [_jsx("span", { className: "dsb-mapping__tip-icon", children: icon("spark", icons) }), _jsx("strong", { children: t.tip })] }), _jsx("p", { children: t.tipBody }), _jsxs("dl", { className: "dsb-mapping__tip-stats", children: [_jsx("div", { children: _jsx("dt", { children: t.columnsDetected(stats.total) }) }), _jsx("div", { children: _jsx("dt", { children: t.columnsAssigned(stats.assigned) }) }), spectralCount > 0 ? (_jsx("div", { children: _jsxs("dt", { children: [spectralCount, " ", roleLabel("x", locale)] }) })) : null] }), _jsx("div", { className: "dsb-progress", role: "progressbar", "aria-valuenow": progress, "aria-valuemin": 0, "aria-valuemax": 100, children: _jsx("span", { className: "dsb-progress__bar", style: { width: `${progress}%` } }) }), _jsxs("span", { className: "dsb-progress__label", children: [progress, " %"] })] })) : null] })] }));
}
function formatPreview(value) {
    if (value == null || value === "")
        return "—";
    const text = String(value);
    return text.length > 16 ? `${text.slice(0, 15)}…` : text;
}
function roleOptionLabel(col, role, locale) {
    if (role === "y" && col.semanticType) {
        const task = col.semanticType === "classification" || col.semanticType === "categorical"
            ? locale === "en"
                ? "classification"
                : "classification"
            : locale === "en"
                ? "regression"
                : "régression";
        return `${roleLabel("y", locale)} · ${task}`;
    }
    return roleLabel(role, locale);
}
function filterLabel(filter, locale) {
    if (filter === "all")
        return locale === "en" ? "All" : "Toutes";
    if (filter === "unassigned")
        return locale === "en" ? "Unassigned" : "Non assignées";
    return roleLabel(filter, locale);
}
//# sourceMappingURL=ColumnMappingTable.js.map