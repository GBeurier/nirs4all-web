export interface BudgetPointInput {
    /** number of samples in the budget (must be > 0) */
    n: number;
    /** design-space coverage gained at this budget, 0..1 (descriptive) */
    coverage?: number | null;
    /** expected RMSEP at this budget (predictive — only when validated) */
    expectedRmse?: number | null;
}
export interface BudgetPointView {
    n: number;
    coverage: number | null;
    expectedRmse: number | null;
    /** coverage gain PER SAMPLE vs the previous point (null for the first) */
    marginalCoveragePerSample: number | null;
}
export interface BudgetCurveView {
    points: BudgetPointView[];
    /** whether predictive RMSEP is available on every point (else descriptive-only) */
    hasPredictive: boolean;
    /** first n where coverage gain per sample drops below `kneeThreshold` (diminishing returns) */
    recommendedN: number | null;
    /** the user's current chosen budget, echoed back if provided */
    chosenN: number | null;
    headline: string;
}
/**
 * @param points  budget/coverage samples (any order; sorted + de-duplicated by n)
 * @param options chosenN = the user's current budget; kneeThreshold = coverage
 *                gain PER SAMPLE below which returns are "diminishing"
 */
export declare function buildBudgetCurveView(points: readonly BudgetPointInput[], options?: {
    chosenN?: number | null;
    kneeThreshold?: number | null;
}): BudgetCurveView;
//# sourceMappingURL=budget.d.ts.map