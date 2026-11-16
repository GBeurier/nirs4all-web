import { type Matrix } from "./types.js";
export type ExplainMethod = "exact_shap" | "permutation_shap" | "kernel_shap" | "lime" | "occlusion";
export type ExplainBaseline = "background" | "mean" | "interpolate";
export type AttributionKind = ExplainMethod | "linear_shap" | "tree_shap";
export interface ExplainOptions {
    /** Default "permutation_shap". */
    method?: ExplainMethod;
    /** Default "background". */
    baseline?: ExplainBaseline;
    /** Antithetic permutation pairs per row (default 10). */
    nPermutations?: number;
    /** Sampled coalitions per row for kernel_shap/lime; 0 = native auto. */
    nCoalitions?: number;
    /** LIME kernel width; <= 0 = native auto. */
    limeKernelWidth?: number;
    /** LIME ridge penalty (default 1). */
    limeRidge?: number;
    /** Upper bound of rows per requested batch (default 4096). */
    maxBatchRows?: number;
    /** Sampling seed: a nonnegative integer < 2^53 (default 0). */
    seed?: number;
}
/** rows: row-major nRows x nFeatures in the explained feature space.
 *  Returns nRows x nOutputs row-major predictions. */
export type PredictBatch = (rows: Float64Array, nRows: number, nFeatures: number) => Float64Array | number[] | Promise<Float64Array | number[]>;
/** Feature partition: featureGroup[j] in [0, nGroups) for every feature j. */
export interface FeatureGrouping {
    featureGroup: Int32Array;
    nGroups: number;
    /** groupsFromRanges only: source range index per group, -1 for uncovered runs. */
    rangeOfGroup?: Int32Array;
}
export interface ExplainModelInput {
    /** Rows to explain. */
    X: Matrix;
    /** Required for the "background" and "mean" baselines. */
    background?: Matrix;
    /** Omitted = one group per feature. */
    grouping?: FeatureGrouping;
    /** Omitted = inferred by predicting X row 0 once. */
    nOutputs?: number;
    predictBatch: PredictBatch;
    options?: ExplainOptions;
    onProgress?: (doneEvaluations: number, totalEvaluations: number) => void;
    /** Checked between batches; aborts with DOMException "AbortError". */
    signal?: AbortSignal;
}
export interface AttributionResult {
    kind: AttributionKind;
    /** null for linear/tree. */
    baseline: ExplainBaseline | null;
    exactness: "exact" | "sampled" | "surrogate" | "perturbation";
    additive: boolean;
    groupAggregation: "group_game" | "sum_of_feature_values" | "none";
    nRows: number;
    nGroups: number;
    nOutputs: number;
    nFeatures: number;
    /** [row][group][output] */
    attributions: Float64Array;
    /** [row][output] */
    expected: Float64Array;
    /** [row][output] */
    predictions: Float64Array;
    /** [row][group][output] (permutation only; NaN when a single pair was drawn). */
    stdError: Float64Array | null;
    /** max |prediction - expected - sum(attributions)|; null when not additive. */
    additivityMaxAbsError: number | null;
    /** Model rows evaluated by the host (0 for linear/tree). */
    evaluations: number;
    settings: Record<string, number | string | boolean | null>;
    engine: {
        name: "nirs4all-methods";
        version: string;
        abi: string;
    };
}
export interface FlatTreeEnsemble {
    /** nTrees + 1 offsets; tree t owns nodes [treeOffsets[t], treeOffsets[t+1]). */
    treeOffsets: number[] | Int32Array;
    feature: Int32Array | number[];
    threshold: Float64Array;
    /** Child indices LOCAL to the tree, -1 for a leaf. */
    left: Int32Array | number[];
    right: Int32Array | number[];
    defaultLeft?: Uint8Array;
    cover: Float64Array;
    /** nNodes * nOutputs leaf values. */
    value: Float64Array;
    nOutputs: number;
    /** 0: x <= threshold goes left (sklearn, LightGBM); 1: x < threshold (XGBoost). */
    decisionType?: 0 | 1;
    baseOffset?: Float64Array;
    /** 1/nTrees for averaging forests, 1 for boosting (default 1). */
    treeScale?: number;
}
/** Explain any model through a native ask/tell session. The host predicts
 *  the requested perturbed rows with predictBatch (sync or async). */
export declare function explainModel(input: ExplainModelInput): Promise<AttributionResult>;
/** Exact interventional SHAP of an affine model X . coefficients + intercept. */
export declare function linearShap(input: {
    X: Matrix;
    coefficients: Matrix;
    intercept?: Float64Array;
    reference: Float64Array;
    grouping?: FeatureGrouping;
}): AttributionResult;
/** Exact path-dependent TreeSHAP over a generic flat tree ensemble. Grouped
 *  values are sums of per-feature Shapley values, not group-game values. */
export declare function treeShap(input: {
    X: Matrix;
    trees: FlatTreeEnsemble;
    grouping?: FeatureGrouping;
}): AttributionResult;
/** Contiguous fixed-width partition: feature j -> group floor(j / width). */
export declare function groupsFixedWidth(nFeatures: number, width: number): FeatureGrouping;
/** Partition from half-open [start, end) feature-index ranges. Range r becomes
 *  group r; every maximal uncovered run becomes one further group. */
export declare function groupsFromRanges(nFeatures: number, ranges: ReadonlyArray<readonly [number, number]>): FeatureGrouping;
/** Per-group mean |attribution| and mean signed attribution over rows. */
export declare function summarizeAttributions(result: AttributionResult, outputIndex?: number): {
    meanAbs: Float64Array;
    meanSigned: Float64Array;
};
