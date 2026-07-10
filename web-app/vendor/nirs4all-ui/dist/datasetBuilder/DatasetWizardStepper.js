import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cx } from "./_cx.js";
import { icon } from "./icons.js";
import { STRINGS } from "./locale.js";
const STEP_ORDER = ["source", "role", "columns", "validation"];
/** Horizontal 4-step wizard header (Source / Rôle / Colonnes / Validation). */
export function DatasetWizardStepper({ activeStep, completedSteps = [], onStepClick, locale = "fr", icons, className, }) {
    const t = STRINGS[locale];
    const completed = new Set(completedSteps);
    const activeIndex = STEP_ORDER.indexOf(activeStep);
    return (_jsx("ol", { className: cx("dsb-stepper", className), children: STEP_ORDER.map((step, index) => {
            const isDone = completed.has(step) || index < activeIndex;
            const isActive = step === activeStep;
            const state = isActive ? "active" : isDone ? "done" : "todo";
            return (_jsxs("li", { className: "dsb-stepper__item", "data-state": state, children: [_jsxs("button", { type: "button", className: "dsb-stepper__button", onClick: onStepClick ? () => onStepClick(step) : undefined, disabled: !onStepClick, "aria-current": isActive ? "step" : undefined, children: [_jsx("span", { className: "dsb-stepper__marker", "aria-hidden": "true", children: isDone ? icon("check", icons) : index + 1 }), _jsxs("span", { className: "dsb-stepper__label", children: [_jsxs("span", { className: "dsb-stepper__index", children: [index + 1, "."] }), " ", t.steps[step]] })] }), index < STEP_ORDER.length - 1 ? _jsx("span", { className: "dsb-stepper__line", "aria-hidden": "true" }) : null] }, step));
        }) }));
}
//# sourceMappingURL=DatasetWizardStepper.js.map