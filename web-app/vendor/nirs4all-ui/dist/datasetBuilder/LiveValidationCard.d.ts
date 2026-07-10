import type { ReactNode } from "react";
import { type BuilderIconKey } from "./icons.js";
import type { Locale } from "./roles.js";
import type { ValidationCheck, ValidationResult } from "./types.js";
export interface LiveValidationCardProps {
    validation: ValidationResult;
    locale?: Locale;
    icons?: Partial<Record<BuilderIconKey, ReactNode>> | undefined;
    /** optional trailing value shown to the right of each check (e.g. a filename). */
    trailing?: (check: ValidationCheck) => ReactNode;
    className?: string;
    title?: string;
}
/** Real-time validation card: OK / warning / error checks with a header status. */
export declare function LiveValidationCard({ validation, locale, icons, trailing, className, title, }: LiveValidationCardProps): import("react").JSX.Element;
//# sourceMappingURL=LiveValidationCard.d.ts.map