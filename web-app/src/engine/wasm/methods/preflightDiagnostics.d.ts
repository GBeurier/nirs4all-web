import { type Matrix } from "./types.js";
export interface PreflightPcaResult {
    scores: Matrix;
    loadings: Matrix;
    /** Variances; 0 for an unresolved component. */
    eigenvalues: Float64Array;
    /** [trace(C), trace(C*C)] over the full centered covariance spectrum. */
    fullMoments: readonly [number, number];
    /** Conservative absolute accuracy threshold of the eigenvalues (16 max(n,p) eps lambda_max). */
    resolution: number;
    /** 1 when the component's variance is not above `resolution` (not rank). */
    unresolved: Uint8Array;
}
export interface PreflightRepeatabilityResult {
    pooledSd: Float64Array;
    icc: Float64Array;
    nCompleteGroups: number[];
    /** 0=computed, 1=insufficient, 2=unbalanced, 3=zero total variance. */
    bandStatus: Int32Array;
}
export interface PreflightNeighborResult {
    indices: number[];
    distances: Float64Array;
    rows: number;
    k: number;
}
export interface PreflightLocalContrastResult {
    contrast: number;
    fractionRowsWithNeighbors: number;
    observedSameClassFraction: number;
    expectedSameClassFraction: number;
}
export interface HdbscanOptions {
    minClusterSize: number;
    /** Neighbors defining the core distance, the row itself included (scikit-learn). */
    minSamples: number;
    selection?: "eom" | "leaf";
    allowSingleCluster?: boolean;
}
export interface HdbscanTreeNode {
    /** Parent node index, -1 for the root (node 0). */
    parent: number;
    size: number;
    /** Selected cluster label or -1. */
    label: number;
    lambdaBirth: number;
    lambdaDeath: number;
    stability: number;
}
export interface HdbscanResult {
    /** -1 = noise; clusters 0..nClusters-1. */
    labels: number[];
    /** scikit-learn probabilities_: a membership strength, not a probability. */
    membership: Float64Array;
    /** GLOSH outlier scores in [0, 1]. */
    outlierScores: Float64Array;
    nClusters: number;
    /** scikit-learn-contrib/hdbscan cluster_persistence_, one value per label. */
    persistence: Float64Array;
    tree: HdbscanTreeNode[];
}
export interface PreflightFactorAssociationResult {
    /** eta^2 (continuous) or Cramer's V (categorical); NaN when undefined. */
    effectSize: number;
    /** One-way ANOVA F or Pearson chi-square; NaN when undefined. */
    statistic: number;
    df1: number;
    df2: number;
    nLevels: number;
    nTargetValues: number;
    /** log10 upper bound on distinct permutation outcomes. */
    log10DistinctPermutations: number;
    /** Monte Carlo (1+b)/(1+B); NaN without permutations. */
    pValue: number;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
}
export interface StatsCorrelationTestResult {
    /** Pearson r or Spearman rho; NaN when x or y is constant. */
    coefficient: number;
    nDistinctX: number;
    nDistinctY: number;
    /** log10 upper bound on distinct permutation outcomes. */
    log10DistinctPermutations: number;
    /** Two-sided Monte Carlo (1+b)/(1+B); NaN without permutations. */
    pValue: number;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
}
export interface StatsExactPermutationResult {
    /** Number N of distinct arrangements enumerated. */
    nArrangements: number;
    /** Exact p-value #{T >= T_obs}/N; NaN when the statistic is undefined. */
    pValue: number;
    /** Smallest attainable exact p-value #{T >= T_max}/N. */
    minimumPValue: number;
    maximumStatistic: number;
}
export interface PermanovaResult {
    /** Sums of squares are ss* x 2^ssExponent; 0 when they are normal doubles. */
    ssExponent: number;
    ssTotal: number;
    /** Between-strata SS (0 without strata). */
    ssStrata: number;
    /** SS of the term given the strata (additive strata + term model). */
    ssTerm: number;
    ssResidual: number;
    r2: number;
    partialR2: number;
    pseudoF: number;
    /** Identifiable term df: levels - connected components; 0 when aliased. */
    dfTerm: number;
    dfResidual: number;
    nLevels: number;
    nStrata: number;
    /** log10 of the distinct within-strata level assignments. */
    log10DistinctPermutations: number;
    /** Monte Carlo (1+b)/(1+B); NaN without an executed test. */
    pValue: number;
    /** Error estimate of the residual SS divided by it (+Infinity when the
     * residual SS is 0; NaN when the pseudo-F has no df). */
    residualResolution: number;
    /** True when the residual SS is not resolved above rounding
     * (residualResolution >= 1): the pseudo-F is published but unresolved. */
    fNumericallyUnresolved: boolean;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
}
export interface FreedmanLaneResult {
    /** Sums of squares are ss* x 2^ssExponent; 0 when they are normal doubles. */
    ssExponent: number;
    ssTotal: number;
    /** Model SS of the reduced design (intercept + condition main effects). */
    ssReduced: number;
    /** SS(full) - SS(reduced). */
    ssTerm: number;
    ssResidual: number;
    r2: number;
    partialR2: number;
    pseudoF: number;
    /** rank(full) - rank(reduced); 0 when aliased with the conditions. */
    dfTerm: number;
    dfResidual: number;
    rankReduced: number;
    log10DistinctPermutations: number;
    pValue: number;
    /** Error estimate of the residual SS divided by it (+Infinity when the
     * residual SS is 0; NaN when the pseudo-F has no df). */
    residualResolution: number;
    /** True when the residual SS is not resolved above rounding
     * (residualResolution >= 1): the pseudo-F is published but unresolved. */
    fNumericallyUnresolved: boolean;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
}
export interface PermdispResult {
    /** Distances are distances x 2^distanceExponent; 0 when normal doubles. */
    distanceExponent: number;
    /** Euclidean distance of each row to its group centroid. */
    distances: Float64Array;
    /** Mean distance per group, in ascending group-code order. */
    groupMeanDistances: Float64Array;
    f: number;
    df1: number;
    df2: number;
    nGroups: number;
    log10DistinctPermutations: number;
    pValue: number;
    /** Error estimate of the within SS of the distances divided by it. */
    residualResolution: number;
    /** True when F is published but not resolved above rounding. */
    fNumericallyUnresolved: boolean;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
}
export interface VarianceComponentsRemlResult {
    /** REML s2_between per feature (NaN when undefined). */
    sigma2Between: Float64Array;
    sigma2Within: Float64Array;
    /** ICC(1) = s2b / (s2b + s2w). */
    icc: Float64Array;
    /** Restricted log-likelihood, statsmodels MixedLM convention. */
    logLikelihood: Float64Array;
    nGroups: number[];
    nObservations: number[];
    /** Local maxima of the restricted likelihood compared. */
    remlCandidates: number[];
    bisectionIterations: number[];
    /** 0 interior, 1 insufficient, 2 s2b=0 boundary, 3 zero total variance,
     * 4 s2w=0 boundary, 5 not converged. */
    status: Int32Array;
}
export interface VarianceComponentsIntervalsResult {
    /** Exact chi-square interval of the within-group SD, [lower, upper] per feature. */
    sdChiSquare: Float64Array;
    /** Exact F interval of the balanced ANOVA ICC(1,1); NaN when unbalanced. */
    iccExactF: Float64Array;
    /** Cluster-bootstrap percentile interval of the pooled within-group SD. */
    sdBootstrap: Float64Array;
    /** Cluster-bootstrap percentile interval of the REML ICC(1). */
    iccBootstrap: Float64Array;
    nValidReplicates: number[];
}
/** Centered PCA (exact Gram eigendecomposition in Methods). Output matrices are row-major. */
export declare function preflightPca(X: Matrix, k: number): PreflightPcaResult;
/** Per-feature pooled repeatability and balanced ICC(1,1). */
export declare function preflightRepeatability(X: Matrix, groupIds: readonly (number | bigint)[], validMask?: Uint8Array): PreflightRepeatabilityResult;
/** Finite-value summary: count, min, max, mean, sample SD, Q1, median, Q3. */
export declare function preflightSummary(values: Float64Array, validMask?: Uint8Array): Float64Array;
/** Euclidean reference neighbors, optionally excluding equal group IDs. */
export declare function preflightNearestNeighbors(query: Matrix, reference: Matrix, k: number, queryGroups?: readonly (number | bigint)[], referenceGroups?: readonly (number | bigint)[]): PreflightNeighborResult;
/** Local Y coherence using an existing row-major n x k neighbor-index table. */
export declare function preflightLocalContrast(targets: Float64Array, neighborIndices: readonly (number | bigint)[], k: number, categorical: boolean, groupIds?: readonly (number | bigint)[]): PreflightLocalContrastResult;
/** Euclidean HDBSCAN* (scikit-learn 1.9.1 semantics, stable MST tie order). */
export declare function clusterHdbscan(X: Matrix, options: HdbscanOptions): HdbscanResult;
/** Adjusted Rand index; NaN for n<2 or identical trivial partitions. Noise is an ordinary label. */
export declare function preflightAdjustedRandIndex(a: readonly (number | bigint)[], b: readonly (number | bigint)[]): number;
export interface PreflightNoiseProxyResult {
    /** sqrt(mean residual^2)/gain per feature; NaN at edges or without rows. */
    bandNoise: Float64Array;
    bandCounts: number[];
    /** Root mean square over every evaluable residual cell, divided by gain. */
    pooled: number;
    /** Residual gain sqrt(sum((delta - weights)^2)) for unit white noise. */
    gain: number;
}
export interface PreflightPairsResult {
    /** Row-major listed pairs: [query, reference] for each listed pair. */
    pairs: number[];
    distances: Float64Array;
    queryFlags: Uint8Array;
    referenceFlags: Uint8Array;
    totalPairs: number;
    candidatePairs: number;
}
export interface PreflightSnvResult {
    /** Row-major SNV rows (population SD), or group means when groups are given. */
    matrix: Matrix;
    /** Per output row, a first-order bound on the absolute rounding error of each entry. */
    errorBounds: Float64Array;
}
/**
 * SNV with rounding bounds (ABI 2.20 n4m_preflight_snv_compute). With
 * `groupIds` (dense codes 0..nGroups-1, every group non-empty), each output
 * row is the equal-weight mean of the SNV rows of one group.
 */
export declare function preflightSnv(X: Matrix, groupIds?: readonly (number | bigint)[], nGroups?: number): PreflightSnvResult;
/** Savitzky-Golay smoothing-residual noise proxy; interior features only. */
export declare function preflightNoiseProxy(X: Matrix, windowLength: number, polyorder: number, validMask?: Uint8Array): PreflightNoiseProxyResult;
/**
 * Row pairs with root-mean-square feature difference <= tolerance. Without a
 * reference, query rows are compared with each other (i < h).
 */
export declare function preflightPairsWithinTolerance(query: Matrix, tolerance: number, maxPairs: number, reference?: Matrix, queryGroups?: readonly (number | bigint)[], referenceGroups?: readonly (number | bigint)[]): PreflightPairsResult;
/** Factor-target association over exchangeable units with seeded permutations.
 * The seed is an unsigned 64-bit integer; pass a bigint above 2^53. */
export declare function preflightFactorAssociation(factorCodes: readonly (number | bigint)[], targets: Float64Array, categorical: boolean, nPermutations: number, seed: number | bigint): PreflightFactorAssociationResult;
/** Holm step-down adjusted p-values for one hypothesis family. */
export declare function preflightHolmAdjust(pValues: Float64Array): Float64Array;
/** Pearson or Spearman correlation over exchangeable units with a seeded
 * two-sided permutation test of y. The seed is an unsigned 64-bit integer;
 * pass a bigint above 2^53. */
export declare function statsCorrelationTest(x: Float64Array, y: Float64Array, method: "pearson" | "spearman", nPermutations: number, seed: number | bigint): StatsCorrelationTestResult;
/** Benjamini-Hochberg step-up adjusted p-values for one hypothesis family. */
export declare function statsBhAdjust(pValues: Float64Array): Float64Array;
/** Exact permutation distribution of the factor-target association statistic
 * (eta^2 or Cramer's V^2) by enumerating distinct arrangements. */
export declare function statsFactorAssociationExact(factorCodes: readonly (number | bigint)[], targets: Float64Array, categorical: boolean, maxArrangements: number): StatsExactPermutationResult;
/** Exact permutation distribution of |r| (Pearson or Spearman). */
export declare function statsCorrelationExact(x: Float64Array, y: Float64Array, method: "pearson" | "spearman", maxArrangements: number): StatsExactPermutationResult;
/** PERMANOVA of one categorical term on Euclidean distances between rows,
 * optionally given strata (permutations stay inside each stratum). */
export declare function statsPermanova(X: Matrix, termCodes: readonly (number | bigint)[], strataCodes: readonly (number | bigint)[] | undefined, nPermutations: number, seed: number | bigint): PermanovaResult;
/** PERMDISP (betadisper type "centroid"): distances to group centroids, their
 * one-way ANOVA F and a residual-permutation test. Not an exchangeability check. */
export declare function statsPermdisp(X: Matrix, groupCodes: readonly (number | bigint)[], nPermutations: number, seed: number | bigint): PermdispResult;
/** Partial PERMANOVA of a term given the additive main effects of condition
 * factors (one code array per factor), tested by Freedman-Lane permutation of
 * the reduced-model residuals. */
export declare function statsPermanovaFreedmanLane(X: Matrix, termCodes: readonly (number | bigint)[], conditionCodes: readonly (readonly (number | bigint)[])[], nPermutations: number, seed: number | bigint): FreedmanLaneResult;
export interface StatsEnergyDistanceResult {
    /** Row-major nGroups x nGroups energies E = 2M_ab - M_aa - M_bb (unit of X), symmetric, >= 0. */
    energy: Float64Array;
    /** Row-major absolute rounding bounds of the energies. */
    energyBounds: Float64Array;
    /** Row-major mean pairwise distances M (V-statistic, self-pairs included). */
    meanDistances: Float64Array;
    /** sum_{a<b} n_a n_b / (n_a + n_b) energy[a][b] and its rounding bound. */
    statistic: number;
    statisticBound: number;
    /** log10(n! / prod n_a!), distinct label assignments. */
    log10DistinctPermutations: number;
    /** Monte Carlo (1+b)/(1+B) under T_perm >= T - sqrt(eps)|T|; NaN without permutations. */
    pValue: number;
    /** (1+b')/(1+B) counting every numerically undecidable draw as a tie. */
    pValueConservative: number;
    nAtLeastObserved: number;
    nPermutationsExecuted: number;
    /** Draws within 2 bound(T) of the tie threshold. */
    nUndecidable: number;
}
/** Energy distance between groups of rows with a K-sample permutation test.
 * groupCodes are integers in [0, nGroups); the seed is an unsigned 64-bit
 * integer (pass a bigint above 2^53). The native size limits are checked
 * before any WASM allocation and raise N4mError(ERR_UNSUPPORTED); inputs
 * outside the supported numerical domain raise the same status. */
export declare function statsEnergyDistance(X: Matrix, groupCodes: readonly number[], nGroups: number, nPermutations: number, seed: number | bigint): StatsEnergyDistanceResult;
export interface StatsPcaMonitorResult {
    /** First effectiveComponents eigenvalues (ddof 1), then NaN. */
    eigenvalues: Float64Array;
    /** Smallest numerical rank of the fold and full fits, capped at maxComponents. */
    effectiveComponents: number;
    /** Out-of-fold reference statistics (row i in fold i mod nFolds). */
    referenceT2: Float64Array;
    referenceQ: Float64Array;
    /** Monitored rows in the fit on every reference row. */
    monitoredT2: Float64Array;
    monitoredQ: Float64Array;
    /** Monitored rows above the T^2 limit, the Q limit, either, by more than the tolerance. */
    nBeyondT2: number;
    nBeyondQ: number;
    nBeyondEither: number;
    /** Rows within the tolerance of a limit (numerically undetermined). */
    nNearT2: number;
    nNearQ: number;
    nNearEither: number;
    /** Empirical (1 - alpha) type-7 quantiles of the out-of-fold values. */
    t2Limit: number;
    qLimit: number;
    /** Conservative relative tolerance tau = 16 m eps cond (an estimate). */
    tolerance: number;
    condition: number;
    /** Q tolerance scale S (Q tolerance = tau S). */
    qToleranceScale: number;
    /** Eigenvalue resolution 16 m eps lambda_1. */
    eigenvalueResolution: number;
    referenceTotalVariance: number;
    monitoredTotalVariance: number;
    centroidDistance: number;
    centroidSubspaceDistance: number;
    centroidResidualDistance: number;
    centroidT2: number;
    retainedFraction: number;
}
/** PCA monitoring of rows against a reference PCA with out-of-fold limits.
 * The native size limits are checked before any WASM allocation. */
export declare function statsPcaMonitor(reference: Matrix, monitored: Matrix, maxComponents: number, nFolds: number, alpha: number): StatsPcaMonitorResult;
/** One-way random-effects variance components by REML, per feature. */
export declare function statsVarianceComponentsReml(X: Matrix, groupIds: readonly (number | bigint)[], validMask?: Uint8Array): VarianceComponentsRemlResult;
/** Exact and cluster-bootstrap confidence intervals of the same model.
 * clusterIds (optional) names the resampling unit; the seed is a uint64. */
export declare function statsVarianceComponentsIntervals(X: Matrix, groupIds: readonly (number | bigint)[], options: {
    confidence: number;
    nBootstrap: number;
    seed: number | bigint;
    clusterIds?: readonly (number | bigint)[];
    validMask?: Uint8Array;
}): VarianceComponentsIntervalsResult;
export interface GroupMeansResult {
    /** One row per group code, in code order. */
    means: Matrix;
    counts: number[];
}
/** Equal-weight per-group column means (double-double sums): codes in
 * [0, nGroups), every group nonempty, values in the declared numerical domain
 * (nonzero |x| in [2^-256, 2^256]; a summary, so no spread limit), else N4mError. */
export declare function statsGroupMeans(X: Matrix, groupCodes: readonly number[], nGroups: number): GroupMeansResult;
export interface RegressionScoresResult {
    rmse: number;
    mae: number;
    /** R^2 = r2 * 2^r2Exponent; NaN (undefined) when y is constant. */
    r2: number;
    /** 0 whenever R^2 is a double; otherwise R^2 = -SSE/SST is scaled. */
    r2Exponent: number;
}
/** RMSE, MAE and R² through n4m_stats_regression_scores (explicit residuals,
 * double-double sums). Inputs outside the declared numerical domain
 * (nonzero |x| in [2^-256, 2^256], spread <= 2^32) throw N4mError
 * ERR_UNSUPPORTED. */
export declare function statsRegressionScores(yTrue: Float64Array, yPred: Float64Array): RegressionScoresResult;
export interface ClusterJaccardResult {
    /** Row-major nClustersA x nClustersB Jaccard indices; NaN when both clusters are empty. */
    jaccard: Matrix;
    /** Row-major |A_i ∩ B_j| counts. */
    intersections: number[];
    sizesA: number[];
    sizesB: number[];
}
export interface LinearSumAssignmentResult {
    /** min(rows, cols) pairs in increasing row order. */
    rowInd: number[];
    colInd: number[];
}
/** Cluster overlap between two partitions; negative labels are unassigned. */
export declare function clusterJaccardMatrix(labelsA: readonly (number | bigint)[], labelsB: readonly (number | bigint)[], nClustersA: number, nClustersB: number): ClusterJaccardResult;
/** scipy.optimize.linear_sum_assignment (SciPy 1.18.1 tie order); +Infinity forbids a pair. */
export declare function linearSumAssignment(cost: Matrix, maximize?: boolean): LinearSumAssignmentResult;
/** numpy.random.default_rng(seed).multivariate_normal(mean, cov, size=n, method="cholesky").
 * The seed is an unsigned 64-bit integer; pass a bigint above 2^53. Returns a row-major n x d matrix. */
export declare function randomMultivariateNormal(mean: Float64Array, cov: Matrix, n: number, seed: number | bigint): Matrix;
/** Successive numpy.random.default_rng(seed).permutation(n) draws from one generator.
 * The seed is an unsigned 64-bit integer; pass a bigint above 2^53. */
export declare function randomPermutations(seed: number | bigint, n: number, nPermutations: number): number[][];
