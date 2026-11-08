import type { Matrix } from "./types.js";
export interface MixedEffectsOptions {
    reml?: boolean;
    max_evaluations?: number;
    tolerance?: number;
    rank_tolerance?: number;
    boundary_tolerance?: number;
}
export interface MixedEffectsResult {
    schema_version: "n4m.mixed_effects/1";
    state: "ready" | "unavailable";
    reason: string | null;
    beta: (number | null)[] | null;
    standard_errors: (number | null)[] | null;
    covariance: (number | null)[][] | null;
    variances: (number | null)[] | null;
    diagnostics: Record<string, number | string | null>;
    options: Record<string, number | null>;
    uncertainty_kind: "conditional_plugin_standard_error";
    warnings: string[];
}
/** X includes any intercept explicitly. Group IDs preserve int64 with BigInt64Array. */
export declare function mixedEffects(X: Matrix, y: Matrix, groups: {
    data: BigInt64Array;
    rows: number;
    cols: number;
}, options?: MixedEffectsOptions): MixedEffectsResult;
export interface FanovaOptions {
    n_trees?: number;
    max_depth?: number;
    min_samples_leaf?: number;
    max_features?: number;
    seed?: number;
    max_order?: number;
    max_marginal_evaluations?: number;
    X_valid?: Matrix;
    y_valid?: Matrix;
}
export interface FanovaResult {
    schema_version: "n4m.fanova/1";
    state: "ready" | "unavailable";
    reason: string | null;
    feature_importance: {
        index: number;
        fraction: number | null;
        tree_sd: number | null;
    }[];
    interactions: {
        indices: [number, number];
        fraction: number | null;
        tree_sd: number | null;
    }[];
    diagnostics: Record<string, number | null>;
    options: Record<string, number | null>;
    domain_measure: "uniform_product";
    aggregation: "mean_per_tree_normalized_components";
    uncertainty_kind: "tree_dispersion_not_confidence";
    warnings: string[];
}
export declare function fanova(X: Matrix, y: Matrix, featureTypes: Uint32Array, bounds: Matrix, options?: FanovaOptions): FanovaResult;
export declare function normalizeLoss(values: Float64Array, baselines: Float64Array): Float64Array;
