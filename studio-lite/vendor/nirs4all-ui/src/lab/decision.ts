// Lab decision-semantics contract — the traffic-light model (§4bis of the
// quali-nirs4all design). PURE view-model: no React, no IO, no app state, no
// browser globals, no randomness. Given per-prediction / per-candidate
// applicability signals and a method's validated thresholds, it produces the
// display contract for a decision colour: meaning + authorized action +
// confidence + who-can-override + the reason to record.
//
// The four colours are a CONTRACT, never a bare pictogram. A host always shows:
// status + main reason + authorized action + confidence + a "see detail" hook.

/**
 * The four decision colours, named by MEANING (not by hue) so the vocabulary is
 * unambiguous:
 * - `reliable`    (🟢) usable in routine
 * - `caution`     (🟠) usable with control / second reading
 * - `out_of_domain` (🔴) do not release → wet chemistry / re-measure
 * - `informative` (🔵) measuring it would improve the model (≠ "good")
 */
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
export type DecisionCategory =
  | 'in_domain'
  | 'near_border'
  | 'out_of_domain'
  | 'measurement_artifact'
  | 'rare_sample'
  | 'uncertain_prediction'
  | 'enrichment_candidate';

/**
 * Per-method, per-decision static display data. This is the ONLY place colour
 * token strings live (the host applies them; nothing is hardcoded in JSX). Token
 * classes follow the shared scientific theme (`--success`/`--warning`/
 * `--destructive` plus a sky tone for the informative/blue state).
 */
export interface DecisionDisplay {
  color: DecisionColor;
  /** short human label, e.g. "Reliable" */
  label: string;
  /** the authorized action, in plain, non-pseudo-certain language */
  action: string;
  overridableBy: DecisionOverride;
  icon: DecisionIcon;
  /** suggested foreground token class (host may override) */
  colorClass: string;
  /** suggested background/tint token class (host may override) */
  bgClass: string;
}

export const DECISION_DISPLAY: Record<DecisionColor, DecisionDisplay> = {
  reliable: {
    color: 'reliable',
    label: 'Fiable',
    action: 'Résultat utilisable en routine',
    overridableBy: 'none',
    icon: 'check',
    colorClass: 'text-success',
    bgClass: 'bg-success/10',
  },
  caution: {
    color: 'caution',
    label: 'Prudence',
    action: 'Utilisable avec contrôle ou 2ᵉ lecture',
    overridableBy: 'method_owner',
    icon: 'alert',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/10',
  },
  out_of_domain: {
    color: 'out_of_domain',
    label: 'Hors domaine',
    action: 'Ne pas rendre → chimie humide / re-mesure',
    overridableBy: 'method_owner',
    icon: 'ban',
    colorClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
  },
  informative: {
    color: 'informative',
    label: 'Informatif pour amélioration',
    action: "Proposer en file d'enrichissement",
    overridableBy: 'none',
    icon: 'sparkles',
    colorClass: 'text-sky-600',
    bgClass: 'bg-sky-500/10',
  },
} as const;

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

export const DEFAULT_DECISION_THRESHOLDS: Required<DecisionThresholds> = {
  adWarn: 1,
  adReject: 2,
  intervalWarn: Number.POSITIVE_INFINITY,
  intervalMax: Number.POSITIVE_INFINITY,
  lowDensity: 0.15,
} as const;

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

function n(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveThresholds(t?: DecisionThresholds | null): Required<DecisionThresholds> {
  return {
    adWarn: n(t?.adWarn) ?? DEFAULT_DECISION_THRESHOLDS.adWarn,
    adReject: n(t?.adReject) ?? DEFAULT_DECISION_THRESHOLDS.adReject,
    intervalWarn: n(t?.intervalWarn) ?? DEFAULT_DECISION_THRESHOLDS.intervalWarn,
    intervalMax: n(t?.intervalMax) ?? DEFAULT_DECISION_THRESHOLDS.intervalMax,
    lowDensity: n(t?.lowDensity) ?? DEFAULT_DECISION_THRESHOLDS.lowDensity,
  };
}

/**
 * Decide the colour + full contract for one prediction/candidate.
 *
 * Ordering embodies the golden rule (§0): a strong outlier / rejected gate / hard
 * out-of-domain is 🔴 first (never auto-usable, never auto-selected). Then border
 * cases are 🟠. A clean, dense in-domain prediction is 🟢. A clean but rare/low-
 * density sample is 🔵 (informative), NOT "good" — it is worth measuring.
 */
export function buildDecisionView(
  input: DecisionInput,
  thresholds?: DecisionThresholds | null,
): DecisionView {
  const t = resolveThresholds(thresholds);
  const ad = n(input.applicabilityScore);
  const width = n(input.intervalWidth);
  const density = n(input.localDensity);

  // --- 🔴 out-of-domain: refuse to release ---------------------------------
  if (input.gateRejected === true) {
    return view('out_of_domain', 'measurement_artifact', 'low',
      'Domaine non admissible (gate OOD/SSI négatif)');
  }
  if (ad !== undefined && ad >= t.adReject) {
    return view('out_of_domain', 'out_of_domain', 'low',
      'Spectre hors du domaine du modèle actuel');
  }
  if (width !== undefined && width >= t.intervalMax) {
    return view('out_of_domain', 'uncertain_prediction', 'low',
      'Intervalle de prédiction trop large pour être utilisable');
  }
  if (input.strongOutlier === true) {
    // Strong spectral outlier: an artefact OR a real extreme — never usable
    // without verification, per the golden rule. Held at 🔴 for review.
    return view('out_of_domain', 'measurement_artifact', 'low',
      'Outlier spectral fort — à vérifier avant tout usage');
  }

  // --- 🟠 caution: on the border / uncertain -------------------------------
  if (ad !== undefined && ad >= t.adWarn) {
    return view('caution', 'near_border', 'medium',
      'En bordure du domaine connu du modèle');
  }
  if (width !== undefined && width >= t.intervalWarn) {
    return view('caution', 'uncertain_prediction', 'medium',
      'Incertitude élevée (intervalle large)');
  }
  if (input.extrapolation === true) {
    return view('caution', 'uncertain_prediction', 'medium',
      "Valeur prédite proche ou hors de la gamme observée à l'apprentissage");
  }

  // --- 🔵 informative for improvement (clean but rare) ---------------------
  if (density !== undefined && density <= t.lowDensity) {
    return view('informative', 'enrichment_candidate', 'high',
      'Échantillon rare/peu couvert — le mesurer enrichirait le modèle');
  }

  // --- 🟢 reliable ----------------------------------------------------------
  return view('reliable', 'in_domain', 'high',
    'Dans le domaine connu, intervalle raisonnable, pas d’extrapolation');
}

function view(
  color: DecisionColor,
  category: DecisionCategory,
  confidence: DecisionConfidence,
  reason: string,
): DecisionView {
  const d = DECISION_DISPLAY[color];
  return {
    color,
    label: d.label,
    reason,
    action: d.action,
    confidence,
    overridableBy: d.overridableBy,
    category,
    icon: d.icon,
    colorClass: d.colorClass,
    bgClass: d.bgClass,
    detailAvailable: true,
  };
}

/** Type guard for a decision colour string. */
export function isDecisionColor(value: unknown): value is DecisionColor {
  return value === 'reliable' || value === 'caution'
    || value === 'out_of_domain' || value === 'informative';
}
