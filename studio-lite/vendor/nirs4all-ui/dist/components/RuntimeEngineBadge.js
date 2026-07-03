import { jsxs as _jsxs } from "react/jsx-runtime";
import { runtimeEngineLabel } from "../runtime/index.js";
export function RuntimeEngineBadge({ lineage, label, icon, className, title, }) {
    const text = label ?? runtimeEngineLabel(lineage);
    if (!text)
        return null;
    return (_jsxs("span", { className: className, title: title, children: [icon, text] }));
}
//# sourceMappingURL=RuntimeEngineBadge.js.map