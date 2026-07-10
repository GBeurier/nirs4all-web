import type { ReactNode } from 'react';
import { type DecisionColor, type DecisionIcon } from './decision.js';
import { type Locale } from './locale.js';
export interface TrafficLightLegendProps {
    /** host icons keyed by decision icon token */
    icons?: Partial<Record<DecisionIcon, ReactNode>>;
    /** restrict to a subset of colours, in a custom order */
    colors?: readonly DecisionColor[];
    /** show the authorized-action line under each colour (default true) */
    showAction?: boolean;
    /** apply each colour's tokens by default (default true) */
    applyTone?: boolean;
    /** language for the labels/actions (default 'fr') */
    locale?: Locale;
    className?: string;
    itemClassName?: string;
    toneClassName?: string;
    iconClassName?: string;
    labelClassName?: string;
    actionClassName?: string;
}
/**
 * Pedagogical legend of the four-colour decision contract (§4bis). Reads the
 * shared `DECISION_DISPLAY` catalogue so the legend can never drift from the
 * decisions the app actually makes. Presentational.
 */
export declare function TrafficLightLegend({ icons, colors, showAction, applyTone, locale, className, itemClassName, toneClassName, iconClassName, labelClassName, actionClassName, }: TrafficLightLegendProps): import("react").JSX.Element;
//# sourceMappingURL=TrafficLightLegend.d.ts.map