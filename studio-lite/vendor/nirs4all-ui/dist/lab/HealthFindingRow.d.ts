import type { ReactNode } from 'react';
import { type HealthFindingInput, type HealthFindingView, type HealthIcon } from './health.js';
export interface HealthFindingRowProps {
    finding?: HealthFindingInput;
    /** a precomputed view (takes precedence) */
    view?: HealthFindingView | null;
    icons?: Partial<Record<HealthIcon, ReactNode>>;
    /** render-prop for the action control (button/select) */
    renderAction?: (view: HealthFindingView) => ReactNode;
    /** expandable "why does it matter?" content */
    explanation?: ReactNode;
    /** apply the severity colour/tint tokens by default (default true) */
    applyTone?: boolean;
    className?: string;
    toneClassName?: string;
    iconClassName?: string;
    titleClassName?: string;
    detailClassName?: string;
    affectedClassName?: string;
    actionLabelClassName?: string;
    empty?: ReactNode;
}
/** One row of the "Santé des données" check-list (§3 Écran 2). Presentational. */
export declare function HealthFindingRow({ finding, view, icons, renderAction, explanation, applyTone, className, toneClassName, iconClassName, titleClassName, detailClassName, affectedClassName, actionLabelClassName, empty, }: HealthFindingRowProps): import("react").JSX.Element | null;
//# sourceMappingURL=HealthFindingRow.d.ts.map