import type { ReactNode } from 'react';
import { type DecisionIcon, type DecisionInput, type DecisionThresholds, type DecisionView } from './decision.js';
import type { Locale } from './locale.js';
export interface DecisionBadgeProps {
    /** raw applicability signals — the badge computes the decision */
    input?: DecisionInput;
    /** per-method thresholds (used with `input`) */
    thresholds?: DecisionThresholds | null;
    /** a precomputed decision view (takes precedence over `input`) */
    view?: DecisionView | null;
    /** language for generated text (default 'fr') */
    locale?: Locale;
    /** host-provided icons keyed by the decision icon token */
    icons?: Partial<Record<DecisionIcon, ReactNode>>;
    /** show the label text (default true) */
    showLabel?: boolean;
    /** override the label */
    label?: string | null;
    /** apply the view's colour/tint tokens by default (default true; false = host styles fully) */
    applyTone?: boolean;
    /** container class; defaults to the view's suggested colour + tint tokens */
    className?: string;
    /** override the auto colour/tint tokens */
    toneClassName?: string;
    iconClassName?: string;
    labelClassName?: string;
    title?: string;
}
/**
 * Compact traffic-light badge for one decision (🟢🟠🔴🔵). Presentational only:
 * the colour comes from the pure decision view-model; the host supplies the icon
 * nodes and may override any class.
 */
export declare function DecisionBadge({ input, thresholds, view, locale, icons, showLabel, label, applyTone, className, toneClassName, iconClassName, labelClassName, title, }: DecisionBadgeProps): import("react").JSX.Element;
//# sourceMappingURL=DecisionBadge.d.ts.map