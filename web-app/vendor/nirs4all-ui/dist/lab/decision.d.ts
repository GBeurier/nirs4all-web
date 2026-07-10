/**
 * The four decision colours, named by MEANING (not by hue) so the vocabulary is
 * unambiguous:
 * - `reliable`    (🟢) usable in routine
 * - `caution`     (🟠) usable with control / second reading
 * - `out_of_domain` (🔴) do not release → wet chemistry / re-measure
 * - `informative` (🔵) measuring it would improve the model (≠ "good")
 */
import { type Locale, type LocalizedText } from './locale.js';
export type DecisionColor = 'reliable' | 'caution' | 'out_of_domain' | 'informative';
/** Who is allowed to override a decision (overrides are always traced). */
export type DecisionOverride = 'none' | 'method_owner';
/** Confidence attached to the decision itself, shown alongside the colour. */
export type DecisionConfidence = 'high' | 'medium' | 'low';
/** Semantic icon token; the host maps it to an actual ReactNode. */
export type DecisionIcon = 'check' | 'alert' | 'ban' | 'sparkles';
/**
 * The confusable categories the design insists on separating in the UI. A
 * decision carries at most one primary category so the host never conflates
 * e.g. a measurement artefact with a rare-but-real sample.
 */
export type DecisionCategory = 'in_domain' | 'near_border' | 'out_of_domain' | 'measurement_artifact' | 'rare_sample' | 'uncertain_prediction' | 'enrichment_candidate';
/**
 * Per-method, per-decision static display data. This is the ONLY place colour
 * token strings live (the host applies them; nothing is hardcoded in JSX). Token
 * classes follow the shared scientific theme (`--success`/`--warning`/
 * `--destructive` plus a sky tone for the informative/blue state).
 */
export interface DecisionDisplay {
    color: DecisionColor;
    /** short human label, e.g. "Reliable" (bilingual) */
    label: LocalizedText;
    /** the authorized action, in plain, non-pseudo-certain language (bilingual) */
    action: LocalizedText;
    overridableBy: DecisionOverride;
    icon: DecisionIcon;
    /** suggested foreground token class (host may override) */
    colorClass: string;
    /** suggested background/tint token class (host may override) */
    bgClass: string;
}
export declare const DECISION_DISPLAY: Record<DecisionColor, DecisionDisplay>;
/**
 * A validated method's decision thresholds. Everything is CONFIGURABLE per
 * validated method — never hardcoded RPD/RPIQ. All fields optional so a method
 * can start with partial calibration; `DEFAULT_DECISION_THRESHOLDS` fills gaps.
 */
export interface DecisionThresholds {
    /** applicability-domain score above which a prediction is on the border (🟠) */
    adWarn?: number;
    /** applicability-domain score above which a prediction is out-of-domain (🔴) */
    adReject?: number;
    /** conformal interval width above which precision is only "caution" (🟠) */
    intervalWarn?: number;
    /** conformal interval width above which the result is unusable (🔴) */
    intervalMax?: number;
    /** local-density (0..1, higher = denser) below which a sample is enrichment-worthy (🔵) */
    lowDensity?: number;
}
export declare const DEFAULT_DECISION_THRESHOLDS: Required<DecisionThresholds>;
/**
 * The applicability signals for one prediction / candidate. All optional and
 * permissive — the decision degrades gracefully when a signal is absent.
 */
export interface DecisionInput {
    /**
     * Normalized applicability-domain score, higher = further from the training
     * domain (e.g. a combined T²/Q/Mahalanobis/kNN score scaled so 1 ≈ the warn
     * boundary). This is the primary domain signal.
     */
    applicabilityScore?: number | null;
    /** width of the conformal prediction interval (same unit as the target) */
    intervalWidth?: number | null;
    /** ŷ falls outside (or at the edge of) the observed training Y range */
    extrapolation?: boolean | null;
    /** local density of the sample in the model space, 0..1 (lower = rarer) */
    localDensity?: number | null;
    /** the model flagged this as a strong spectral outlier (artefact vs rare) */
    strongOutlier?: boolean | null;
    /** OOD/SSI gate rejected the sample outright (domain not admissible) */
    gateRejected?: boolean | null;
}
/** The full display contract produced for one decision. */
export interface DecisionView {
    color: DecisionColor;
    label: string;
    /** main reason, plain language, non-pseudo-certain */
    reason: string;
    /** authorized action for this colour */
    action: string;
    confidence: DecisionConfidence;
    overridableBy: DecisionOverride;
    category: DecisionCategory;
    icon: DecisionIcon;
    colorClass: string;
    bgClass: string;
    /** a detail view is always available behind the badge */
    detailAvailable: true;
}
/**
 * Decide the colour + full contract for one prediction/candidate.
 *
 * Ordering embodies the golden rule (§0): a strong outlier / rejected gate / hard
 * out-of-domain is 🔴 first (never auto-usable, never auto-selected). Then border
 * cases are 🟠. A clean, dense in-domain prediction is 🟢. A clean but rare/low-
 * density sample is 🔵 (informative), NOT "good" — it is worth measuring.
 */
export declare function buildDecisionView(input: DecisionInput, thresholds?: DecisionThresholds | null, locale?: Locale): DecisionView;
/** Type guard for a decision colour string. */
export declare function isDecisionColor(value: unknown): value is DecisionColor;
//# sourceMappingURL=decision.d.ts.map