import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { buildRuntimeResultStatusView, } from "../runtime/index.js";
export function RuntimeResultStatusBadge({ status, progress, view, label, icon, icons, className, iconClassName, labelClassName, progressClassName, title, showProgress = true, formatProgress, }) {
    const statusView = view ?? buildRuntimeResultStatusView(status, progress);
    const resolvedIcon = icon ?? icons?.[statusView.icon] ?? null;
    const progressNode = showProgress && statusView.progress != null
        ? formatProgress?.(statusView.progress) ?? `${statusView.progress}%`
        : null;
    return (_jsxs("span", { className: className, title: title, children: [resolvedIcon ? _jsx("span", { className: iconClassName, children: resolvedIcon }) : null, _jsx("span", { className: labelClassName, children: label ?? statusView.label }), progressNode ? _jsx("span", { className: progressClassName, children: progressNode }) : null] }));
}
//# sourceMappingURL=RuntimeResultStatusBadge.js.map