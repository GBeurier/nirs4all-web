import type { ReactNode } from 'react';
import { type DecisionIcon, type DecisionInput, type DecisionThresholds, type DecisionView } from './decision.js';
import type { Locale } from './locale.js';
export interface DecisionCardProps {
    /** the sample this prediction concerns */
    sampleId?: string | null;
    /** predicted value (host formats numbers as it wishes via `formatValue`) */
    predicted?: number | string | null;
    /** half-width or full label of the conformal interval, e.g. "± 0.42" */
    interval?: string | null;
    /** the target unit (e.g. "%") */
    unit?: string | null;
    input?: DecisionInput;
    thresholds?: DecisionThresholds | null;
    view?: DecisionView | null;
    /** language for generated text (default 'fr') */
    locale?: Locale;
    icons?: Partial<Record<DecisionIcon, ReactNode>>;
    /** render-prop for the "see detail" affordance (else a default label is shown) */
    renderDetailLink?: (view: DecisionView) => ReactNode;
    /** show a detail affordance at all (default true — §4bis requires one) */
    showDetail?: boolean;
    /** default detail affordance label when `renderDetailLink` is absent */
    detailLabel?: string;
    formatValue?: (value: number | string) => ReactNode;
    /** apply the view's colour/tint tokens by default (default true; false = host styles fully) */
    applyTone?: boolean;
    className?: string;
    toneClassName?: string;
    headerClassName?: string;
    valueClassName?: string;
    intervalClassName?: string;
    labelClassName?: string;
    reasonClassName?: string;
    actionClassName?: string;
    confidenceClassName?: string;
    detailClassName?: string;
    iconClassName?: string;
}
/**
 * The per-prediction reliability card (§3 Écran 5). ALWAYS shows: status +
 * main reason + authorized action + confidence + a detail affordance — never a
 * bare colour. Presentational; the decision comes from the pure view-model.
 */
export declare function DecisionCard({ sampleId, predicted, interval, unit, input, thresholds, view, locale, icons, renderDetailLink, showDetail, detailLabel, formatValue, applyTone, className, toneClassName, headerClassName, valueClassName, intervalClassName, labelClassName, reasonClassName, actionClassName, confidenceClassName, detailClassName, iconClassName, }: DecisionCardProps): import("react").JSX.Element;
//# sourceMappingURL=DecisionCard.d.ts.map