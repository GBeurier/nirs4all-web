// Budget ↔ coverage/performance view-model — §3 Écran 3 "courbe budget↔performance".
// PURE: no React, no IO. Shapes the points a host chart renders and computes the
// "diminishing returns" recommendation on the COVERAGE-per-sample gain (the
// descriptive curve). The predictive (expected-RMSEP) variant is optional and
// only reported once a method has validated it (§9 nuance) — the knee itself is
// always coverage-based, so the headline never over-claims "performance".
function num(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function clamp01(value) {
    return value === undefined ? null : Math.max(0, Math.min(1, value));
}
/**
 * @param points  budget/coverage samples (any order; sorted + de-duplicated by n)
 * @param options chosenN = the user's current budget; kneeThreshold = coverage
 *                gain PER SAMPLE below which returns are "diminishing"
 */
export function buildBudgetCurveView(points, options) {
    // keep only valid, positive budgets; de-duplicate by n (last wins); sort by n.
    const byN = new Map();
    for (const p of points) {
        const n = num(p.n);
        if (n === undefined || n <= 0)
            continue;
        byN.set(n, p);
    }
    const sorted = [...byN.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    const kneeThreshold = num(options?.kneeThreshold) ?? 0.005;
    let hasPredictive = sorted.length > 0;
    let recommendedN = null;
    const views = sorted.map((p, i) => {
        const coverage = clamp01(num(p.coverage));
        const expectedRmse = num(p.expectedRmse) ?? null;
        if (expectedRmse === null)
            hasPredictive = false;
        const prev = i > 0 ? sorted[i - 1] : undefined;
        const prevCov = clamp01(num(prev?.coverage));
        const prevN = num(prev?.n);
        const dN = prevN !== undefined ? num(p.n) - prevN : undefined;
        const marginal = coverage !== null && prevCov !== null && dN !== undefined && dN > 0
            ? (coverage - prevCov) / dN
            : null;
        if (recommendedN === null && marginal !== null && marginal < kneeThreshold) {
            recommendedN = prevN ?? num(p.n);
        }
        return { n: num(p.n), coverage, expectedRmse, marginalCoveragePerSample: marginal };
    });
    const chosenN = num(options?.chosenN) ?? null;
    return {
        points: views,
        hasPredictive,
        recommendedN,
        chosenN,
        headline: headlineFor(recommendedN),
    };
}
function headlineFor(recommendedN) {
    if (recommendedN !== null) {
        return `Couverture : rendements décroissants après ~${recommendedN} échantillons`;
    }
    return 'Chaque échantillon supplémentaire améliore encore la couverture';
}
//# sourceMappingURL=budget.js.map