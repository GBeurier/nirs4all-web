// Worklist view-model — the physical bridge to the bench (§4 "listes de travail").
// PURE: no React, no IO. Shapes prioritized sample lists (send-to-HPLC, or
// re-measure) with a "why chosen" tag and a safety flag that ENFORCES the golden
// rule (§0): a strong outlier / out-of-domain candidate is flagged to VERIFY,
// never silently auto-selected. Safety is DERIVED from the sample's diagnostic
// signals so an app cannot forget to flag it.
import { loc } from './locale.js';
export const ENRICHMENT_REASON_LABEL = {
    extends_range: { fr: 'Étend la gamme', en: 'Extends the range' },
    fills_gap: { fr: 'Comble un trou', en: 'Fills a gap' },
    rare_type: { fr: 'Type rare', en: 'Rare type' },
    representative: { fr: 'Représentatif', en: 'Representative' },
    boundary: { fr: 'En bordure', en: 'At the boundary' },
};
export const SAFETY_FLAG_DISPLAY = {
    safe: { flag: 'safe', label: { fr: 'Sûr à envoyer', en: 'Safe to send' }, colorClass: 'text-success', bgClass: 'bg-success/10', icon: 'check' },
    verify: { flag: 'verify', label: { fr: 'À vérifier', en: 'To check' }, colorClass: 'text-warning', bgClass: 'bg-warning/10', icon: 'alert' },
};
/**
 * Derive the safety flag, enforcing the golden rule. Precedence:
 *   explicit override → strong outlier / out-of-domain ⇒ 'verify' → else 'safe'.
 * A caution-coloured candidate is also surfaced as 'verify' (needs a check).
 */
export function resolveSafety(input) {
    if (input.safety)
        return input.safety;
    if (input.strongOutlier === true)
        return 'verify';
    if (input.decisionColor === 'out_of_domain' || input.decisionColor === 'caution')
        return 'verify';
    return 'safe';
}
function finiteRank(rank) {
    return typeof rank === 'number' && Number.isFinite(rank) ? rank : null;
}
export function buildWorklistItemView(input, locale = 'fr') {
    const safety = resolveSafety(input);
    const s = SAFETY_FLAG_DISPLAY[safety];
    const reasonLabel = input.reasonText
        ?? (input.reason ? loc(ENRICHMENT_REASON_LABEL[input.reason], locale) : null);
    return {
        sampleId: input.sampleId,
        barcode: input.barcode ?? null,
        reasonLabel,
        safety,
        safetyLabel: loc(s.label, locale),
        safetyColorClass: s.colorClass,
        safetyBgClass: s.bgClass,
        safetyIcon: s.icon,
        rank: finiteRank(input.rank),
    };
}
export function summarizeWorklist(items, kind, locale = 'fr') {
    let safe = 0;
    let verify = 0;
    for (const it of items) {
        if (resolveSafety(it) === 'verify')
            verify += 1;
        else
            safe += 1;
    }
    const total = items.length;
    const en = locale === 'en';
    const noun = kind === 'hplc'
        ? (en ? 'to send to wet chemistry' : 'à envoyer en chimie humide')
        : (en ? 'to re-measure' : 'à re-mesurer');
    const headline = verify > 0
        ? (en ? `${total} sample(s) ${noun} — ${verify} to check first` : `${total} échantillon(s) ${noun} — dont ${verify} à vérifier d'abord`)
        : (en ? `${total} sample(s) ${noun}` : `${total} échantillon(s) ${noun}`);
    return { kind, total, safe, verify, headline };
}
/** Build a sorted view list (by rank when present, else input order). */
export function buildWorklistViews(items, locale = 'fr') {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
        const ra = finiteRank(a.item.rank) ?? a.index + 1;
        const rb = finiteRank(b.item.rank) ?? b.index + 1;
        return ra - rb;
    })
        .map(({ item }) => buildWorklistItemView(item, locale));
}
//# sourceMappingURL=worklist.js.map