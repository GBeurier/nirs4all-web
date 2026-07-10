import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
import { signalTypeLabel } from "./roles.js";
const STATUS_TONE = {
    uploaded: "info",
    parsed: "check",
    warning: "warning",
    error: "error",
};
function formatBytes(bytes) {
    if (!bytes || bytes <= 0)
        return null;
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
function formatCount(n) {
    return typeof n === "number" ? n.toLocaleString("fr-FR") : "—";
}
/** The active-source card: icon, name, row/column counts, size and status. */
export function SourceSummaryCard({ source, sources, onChangeSource, locale = "fr", icons, className, }) {
    const t = STRINGS[locale];
    const glyph = source.kind === "folder" ? icon("folder", icons) : icon("file", icons);
    const size = formatBytes(source.sizeBytes);
    const statusIconKey = STATUS_TONE[source.status];
    return (_jsxs("article", { className: cx("dsb-source-card", className), "data-status": source.status, children: [_jsxs("span", { className: cx("dsb-source-card__icon", `dsb-ftype-${source.fileType.toLowerCase()}`), children: [glyph, _jsx("span", { className: "dsb-source-card__ext", children: source.fileType.toUpperCase() })] }), _jsxs("div", { className: "dsb-source-card__body", children: [_jsxs("div", { className: "dsb-source-card__title-row", children: [_jsx("strong", { className: "dsb-source-card__name", children: source.name }), _jsx("span", { className: "dsb-source-card__badge", "data-role": signalToken(source), children: signalTypeLabel(source.signalType, locale) })] }), _jsxs("p", { className: "dsb-source-card__meta", children: [formatCount(source.rowCount), " ", t.rows, " \u00B7 ", formatCount(source.columnCount ?? source.columns.length), " ", t.columns, size ? ` · ${size}` : ""] })] }), _jsxs("span", { className: "dsb-source-card__status", "data-status": source.status, children: [_jsx("span", { className: "dsb-source-card__status-icon", children: icon(statusIconKey, icons) }), statusLabel(source.status, locale)] }), sources && sources.length > 1 && onChangeSource ? (_jsx("select", { className: "dsb-source-card__switch", value: source.id, onChange: (e) => onChangeSource(e.target.value), "aria-label": t.addSource, children: sources.map((s) => (_jsx("option", { value: s.id, children: s.name }, s.id))) })) : null] }));
}
function signalToken(source) {
    return source.signalType === "spectra" || source.signalType === "hyperspectral"
        ? "x"
        : source.signalType === "target"
            ? "y"
            : "metadata";
}
function statusLabel(status, locale) {
    const en = locale === "en";
    switch (status) {
        case "parsed":
            return en ? "Parsed" : "Fichier chargé";
        case "uploaded":
            return en ? "Uploaded" : "Importé";
        case "warning":
            return en ? "Warning" : "Avertissement";
        case "error":
            return en ? "Error" : "Erreur";
    }
}
//# sourceMappingURL=SourceSummaryCard.js.map