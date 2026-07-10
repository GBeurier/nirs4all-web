import type { ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import type { Locale } from "./roles.js";
import type { WizardStep } from "./types.js";
export interface DatasetWizardStepperProps {
    activeStep: WizardStep;
    completedSteps?: WizardStep[];
    onStepClick?: (step: WizardStep) => void;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    className?: string;
}
/** Horizontal 4-step wizard header (Source / Rôle / Colonnes / Validation). */
export declare function DatasetWizardStepper({ activeStep, completedSteps, onStepClick, locale, icons, className, }: DatasetWizardStepperProps): import("react").JSX.Element;
//# sourceMappingURL=DatasetWizardStepper.d.ts.map