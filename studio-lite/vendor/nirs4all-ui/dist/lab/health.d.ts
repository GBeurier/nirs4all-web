export type HealthSeverity = 'ok' | 'warning' | 'critical';
/** Semantic icon token; the host maps it to an actual ReactNode. */
export type HealthIcon = 'check' | 'alert' | 'ban';
/**
 * A confusable-category tag so the UI never conflates e.g. a saturated spectrum
 * (a measurement problem) with a genuinely rare sample. Mirrors the design's
 * insistence on separating categories.
 */
export type HealthCategory = 'integrity' | 'signal' | 'noise' | 'baseline' | 'repetition' | 'reference' | 'structure';
export interface HealthSeverityDisplay {
    severity: HealthSeverity;
    colorClass: string;
    bgClass: string;
    icon: HealthIcon;
}
export declare const HEALTH_SEVERITY_DISPLAY: Record<HealthSeverity, HealthSeverityDisplay>;
/** The suggested operational action for a finding. */
export type HealthAction = 'accept' | 'remeasure' | 'exclude' | 'verify' | 'auto_handled';
export declare const HEALTH_ACTION_LABEL: Record<HealthAction, string>;
export interface HealthFindingInput {
    id: string;
    title: string;
    detail?: string | null;
    severity: HealthSeverity;
    category?: HealthCategory | null;
    action?: HealthAction | null;
    /** number of samples/repetitions this finding concerns */
    affectedCount?: number | null;
    /** the sample ids concerned (optional; drives a worklist) */
    affectedSampleIds?: string[] | null;
}
export interface HealthFindingView {
    id: string;
    title: string;
    detail: string | null;
    severity: HealthSeverity;
    category: HealthCategory | null;
    action: HealthAction;
    actionLabel: string;
    affectedCount: number | null;
    colorClass: string;
    bgClass: string;
    icon: HealthIcon;
}
export declare function formatAffected(count: number | null | undefined): string | null;
export declare function buildHealthFindingView(input: HealthFindingInput): HealthFindingView;
export interface HealthSummary {
    /** 0..100 overall data-health score (100 = clean) */
    score: number;
    /** worst severity present */
    level: HealthSeverity;
    counts: Record<HealthSeverity, number>;
    total: number;
    /** short plain-language headline */
    headline: string;
}
/**
 * Summarize a set of findings into a single score + headline. The score starts
 * at 100 and is docked per finding (a critical costs more than a warning),
 * floored at 0 — a deliberately simple, explainable rule (no black box).
 */
export declare function summarizeHealth(findings: readonly HealthFindingInput[]): HealthSummary;
//# sourceMappingURL=health.d.ts.map