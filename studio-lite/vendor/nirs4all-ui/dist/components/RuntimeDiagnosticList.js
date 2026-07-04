import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatRuntimeTokenLabel, normalizeRuntimeDiagnostics, } from "../runtime/index.js";
function resolveDiagnosticTitle(item) {
    const parts = [
        formatRuntimeTokenLabel(item.verb),
        formatRuntimeTokenLabel(item.cause),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : "Runtime diagnostic";
}
function resolveItemClassName(itemClassName, item) {
    return typeof itemClassName === "function" ? itemClassName(item) : itemClassName;
}
export function RuntimeDiagnosticList({ source, diagnostics, className, itemClassName, messageClassName, metadataClassName, empty, renderItem, }) {
    const items = diagnostics ?? normalizeRuntimeDiagnostics(source);
    if (items.length === 0)
        return empty == null ? null : _jsx(_Fragment, { children: empty });
    return (_jsx("ul", { className: className, children: items.map((item) => (_jsx("li", { className: resolveItemClassName(itemClassName, item), children: renderItem ? renderItem(item) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: resolveDiagnosticTitle(item) }), _jsx("span", { className: messageClassName, children: item.message }), item.mitigation ? (_jsxs("span", { className: metadataClassName, children: ["Mitigation: ", item.mitigation] })) : null, item.unsupportedCapability ? (_jsxs("span", { className: metadataClassName, children: ["Missing capability: ", formatRuntimeTokenLabel(item.unsupportedCapability)] })) : null] })) }, item.id))) }));
}
//# sourceMappingURL=RuntimeDiagnosticList.js.map