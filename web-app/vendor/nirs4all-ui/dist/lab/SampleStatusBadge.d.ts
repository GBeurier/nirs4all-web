import type { ReactNode } from 'react';
import { type SampleStatusDisplay, type SampleStatusIcon } from './sampleStatus.js';
export interface SampleStatusBadgeProps {
    status?: string | null;
    /** a precomputed display (takes precedence) */
    display?: SampleStatusDisplay | null;
    icons?: Partial<Record<SampleStatusIcon, ReactNode>>;
    showLabel?: boolean;
    label?: string | null;
    /** apply the status colour/tint tokens by default (default true) */
    applyTone?: boolean;
    className?: string;
    toneClassName?: string;
    iconClassName?: string;
    labelClassName?: string;
    title?: string;
}
/** Badge for a sample's lifecycle status (§1bis). Presentational. */
export declare function SampleStatusBadge({ status, display, icons, showLabel, label, applyTone, className, toneClassName, iconClassName, labelClassName, title, }: SampleStatusBadgeProps): import("react").JSX.Element;
//# sourceMappingURL=SampleStatusBadge.d.ts.map