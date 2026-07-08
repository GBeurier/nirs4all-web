import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
import { getSampleStatusDisplay, } from './sampleStatus.js';
/** Badge for a sample's lifecycle status (§1bis). Presentational. */
export function SampleStatusBadge({ status, display, icons, showLabel = true, label, applyTone = true, className, toneClassName, iconClassName, labelClassName, title, }) {
    const d = display ?? getSampleStatusDisplay(status);
    const icon = icons?.[d.icon] ?? null;
    return (_jsxs("span", { className: cx(className, toneClassName ?? (applyTone ? cx(d.colorClass, d.bgClass) : undefined)), "data-sample-status": d.status, title: title ?? d.description, children: [icon ? _jsx("span", { className: iconClassName, children: icon }) : null, showLabel ? _jsx("span", { className: labelClassName, children: label ?? d.label }) : null] }));
}
//# sourceMappingURL=SampleStatusBadge.js.map