import type { ReactNode } from 'react';
export interface StepProgressItem {
    id: string;
    label: string;
    /** optional short caption under the label */
    caption?: string;
}
export type StepState = 'completed' | 'active' | 'upcoming';
export interface StepProgressProps {
    steps: readonly StepProgressItem[];
    /** id of the active step (preferred) */
    activeId?: string | null;
    /** index of the active step (fallback if `activeId` is absent) */
    activeIndex?: number | null;
    /** click handler (only fired for enabled steps — completed or active) */
    onSelect?: (id: string, index: number) => void;
    /** allow navigating to upcoming steps too (default false) */
    allowUpcoming?: boolean;
    className?: string;
    stepClassName?: string;
    completedClassName?: string;
    activeClassName?: string;
    upcomingClassName?: string;
    markerClassName?: string;
    labelClassName?: string;
    captionClassName?: string;
    /** custom marker (else the 1-based index / a check for completed) */
    renderMarker?: (state: StepState, index: number) => ReactNode;
}
/**
 * Numbered-circle workflow stepper (§3 rail: Préparer → Calibrer → Utiliser).
 * Presentational; the host owns which step is active and what selecting does.
 */
export declare function StepProgress({ steps, activeId, activeIndex, onSelect, allowUpcoming, className, stepClassName, completedClassName, activeClassName, upcomingClassName, markerClassName, labelClassName, captionClassName, renderMarker, }: StepProgressProps): import("react").JSX.Element;
//# sourceMappingURL=StepProgress.d.ts.map