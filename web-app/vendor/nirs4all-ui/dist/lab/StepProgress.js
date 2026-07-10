import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from './_cx.js';
/**
 * Numbered-circle workflow stepper (§3 rail: Préparer → Calibrer → Utiliser).
 * Presentational; the host owns which step is active and what selecting does.
 */
export function StepProgress({ steps, activeId, activeIndex, onSelect, allowUpcoming = false, className, stepClassName, completedClassName, activeClassName, upcomingClassName, markerClassName, labelClassName, captionClassName, renderMarker, }) {
    const active = resolveActiveIndex(steps, activeId, activeIndex);
    return (_jsx("ol", { className: className, children: steps.map((step, index) => {
            const state = index < active ? 'completed' : index === active ? 'active' : 'upcoming';
            const stateClass = state === 'completed' ? completedClassName
                : state === 'active' ? activeClassName
                    : upcomingClassName;
            const enabled = !!onSelect && (state !== 'upcoming' || allowUpcoming);
            return (_jsxs("li", { className: cx(stepClassName, stateClass), "data-step-id": step.id, "data-step-state": state, "aria-current": state === 'active' ? 'step' : undefined, onClick: enabled ? () => onSelect?.(step.id, index) : undefined, children: [_jsx("span", { className: markerClassName, children: renderMarker ? renderMarker(state, index) : index + 1 }), _jsx("span", { className: labelClassName, children: step.label }), step.caption ? _jsx("span", { className: captionClassName, children: step.caption }) : null] }, step.id));
        }) }));
}
function resolveActiveIndex(steps, activeId, activeIndex) {
    if (activeId != null) {
        const found = steps.findIndex((s) => s.id === activeId);
        if (found >= 0)
            return found;
    }
    if (typeof activeIndex === 'number' && Number.isFinite(activeIndex)) {
        return Math.max(0, Math.min(steps.length - 1, Math.trunc(activeIndex)));
    }
    return 0;
}
//# sourceMappingURL=StepProgress.js.map