// Dataset "health" (Quality Passport) view-model — §3 Écran 2. PURE: no React,
// no IO. Turns a list of raw quality findings into an actionable, traffic-light
// check-list and a single overall score, in plain language (never "bad"/"error").
export const HEALTH_SEVERITY_DISPLAY = {
    ok: { severity: 'ok', colorClass: 'text-success', bgClass: 'bg-success/10', icon: 'check' },
    warning: { severity: 'warning', colorClass: 'text-warning', bgClass: 'bg-warning/10', icon: 'alert' },
    critical: { severity: 'critical', colorClass: 'text-destructive', bgClass: 'bg-destructive/10', icon: 'ban' },
};
export const HEALTH_ACTION_LABEL = {
    accept: 'Accepter',
    remeasure: 'Re-mesurer',
    exclude: 'Exclure',
    verify: 'À vérifier',
    auto_handled: 'Traité automatiquement',
};
const COUNT_FORMATTER = new Intl.NumberFormat('fr-FR');
export function formatAffected(count) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0)
        return null;
    const noun = count > 1 ? 'échantillons' : 'échantillon';
    return `${COUNT_FORMATTER.format(count)} ${noun}`;
}
export function buildHealthFindingView(input) {
    const display = HEALTH_SEVERITY_DISPLAY[input.severity];
    const action = input.action ?? defaultActionFor(input.severity);
    const rawCount = typeof input.affectedCount === 'number' && Number.isFinite(input.affectedCount)
        ? Math.max(0, Math.trunc(input.affectedCount))
        : input.affectedSampleIds?.length;
    const affectedCount = typeof rawCount === 'number' && rawCount > 0 ? rawCount : null;
    return {
        id: input.id,
        title: input.title,
        detail: input.detail ?? null,
        severity: input.severity,
        category: input.category ?? null,
        action,
        actionLabel: HEALTH_ACTION_LABEL[action],
        affectedCount,
        colorClass: display.colorClass,
        bgClass: display.bgClass,
        icon: display.icon,
    };
}
function defaultActionFor(severity) {
    if (severity === 'critical')
        return 'remeasure';
    if (severity === 'warning')
        return 'verify';
    return 'accept';
}
/**
 * Summarize a set of findings into a single score + headline. The score starts
 * at 100 and is docked per finding (a critical costs more than a warning),
 * floored at 0 — a deliberately simple, explainable rule (no black box).
 */
export function summarizeHealth(findings) {
    const counts = { ok: 0, warning: 0, critical: 0 };
    for (const f of findings)
        counts[f.severity] += 1;
    const total = findings.length;
    const penalty = counts.critical * 20 + counts.warning * 6;
    const score = Math.max(0, Math.min(100, 100 - penalty));
    const level = counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : 'ok';
    return { score, level, counts, total, headline: headlineFor(level, counts) };
}
function headlineFor(level, counts) {
    if (level === 'critical') {
        return `${counts.critical} point(s) bloquant(s) à traiter avant de continuer`;
    }
    if (level === 'warning') {
        return `${counts.warning} point(s) à vérifier — utilisable avec contrôle`;
    }
    return 'Données saines — prêtes pour la calibration';
}
//# sourceMappingURL=health.js.map