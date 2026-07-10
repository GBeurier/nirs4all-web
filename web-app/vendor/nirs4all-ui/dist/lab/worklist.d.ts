import type { DecisionColor } from './decision.js';
import { type Locale, type LocalizedText } from './locale.js';
export type WorklistKind = 'hplc' | 'remeasure';
/** Safety flag on a candidate: safe to action, or must be checked first. */
export type SafetyFlag = 'safe' | 'verify';
/** Why a candidate was chosen — a short, plain-language tag. */
export type EnrichmentReason = 'extends_range' | 'fills_gap' | 'rare_type' | 'representative' | 'boundary';
export declare const ENRICHMENT_REASON_LABEL: Record<EnrichmentReason, LocalizedText>;
export interface SafetyFlagDisplay {
    flag: SafetyFlag;
    label: LocalizedText;
    colorClass: string;
    bgClass: string;
    icon: 'check' | 'alert';
}
export declare const SAFETY_FLAG_DISPLAY: Record<SafetyFlag, SafetyFlagDisplay>;
export interface WorklistItemInput {
    sampleId: string;
    barcode?: string | null;
    /** why this sample was chosen (enrichment) */
    reason?: EnrichmentReason | null;
    /** free-text override for the reason label */
    reasonText?: string | null;
    /**
     * Explicit safety override. When omitted, safety is DERIVED from the diagnostic
     * signals below so an outlier is never silently marked safe.
     */
    safety?: SafetyFlag | null;
    /** the outlier audit flagged this as a strong spectral outlier */
    strongOutlier?: boolean | null;
    /** the sample's decision colour (from the reliability contract), if known */
    decisionColor?: DecisionColor | null;
    /** optional priority rank (1 = highest) */
    rank?: number | null;
}
export interface WorklistItemView {
    sampleId: string;
    barcode: string | null;
    reasonLabel: string | null;
    safety: SafetyFlag;
    safetyLabel: string;
    safetyColorClass: string;
    safetyBgClass: string;
    safetyIcon: 'check' | 'alert';
    rank: number | null;
}
/**
 * Derive the safety flag, enforcing the golden rule. Precedence:
 *   explicit override → strong outlier / out-of-domain ⇒ 'verify' → else 'safe'.
 * A caution-coloured candidate is also surfaced as 'verify' (needs a check).
 */
export declare function resolveSafety(input: WorklistItemInput): SafetyFlag;
export declare function buildWorklistItemView(input: WorklistItemInput, locale?: Locale): WorklistItemView;
export interface WorklistSummary {
    kind: WorklistKind;
    total: number;
    safe: number;
    verify: number;
    headline: string;
}
export declare function summarizeWorklist(items: readonly WorklistItemInput[], kind: WorklistKind, locale?: Locale): WorklistSummary;
/** Build a sorted view list (by rank when present, else input order). */
export declare function buildWorklistViews(items: readonly WorklistItemInput[], locale?: Locale): WorklistItemView[];
//# sourceMappingURL=worklist.d.ts.map