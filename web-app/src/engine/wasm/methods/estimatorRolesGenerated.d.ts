import { type Augmenter, type Classifier, type FitInputs, type Fold, NativeEstimator, NativeProcedure, type ProbabilisticClassifier, type Procedure, type ProcedureOutput, type Regressor, type SampleFilter, type Selector, type Splitter, type TargetMixingAugmenter, type Transformer } from "./estimatorRoles.js";
import type { Matrix } from "./types.js";
/** Parameters of AOMFixedCandidate; unset values take the native defaults. */
export interface AOMFixedCandidateParams {
    /** Required. */
    op_kinds?: number[];
    /** Required. */
    param_offsets?: number[];
    /** Default []. */
    chain_params?: number[];
    /** Default "ridge". */
    head?: "ridge" | "pls";
    /** Default 0.1. */
    param?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
    /** Default "auto". */
    moment_policy?: "auto" | "materialized" | "force";
}
/** Native `aom_pop.aom_chain_fixed_fit` (regressor). */
export declare class AOMFixedCandidate extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_chain_fixed_fit";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly chain_params: "double_array";
        readonly head: "enum";
        readonly param: "double";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
        readonly moment_policy: "enum";
    };
    constructor(params?: AOMFixedCandidateParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMChainRidgePLS; unset values take the native defaults. */
export interface AOMChainRidgePLSParams {
    /** Default [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15]. */
    chain_offsets?: number[];
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15, 7, 9, 7, 10, 8, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16, 17, 20, 21, 24, 26, 27]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1, 1, 7, 2, 1, 1, 5, 5, 1, 5, 2, 1]. */
    chain_params?: number[];
    /** Default [2]. */
    pls_components?: number[];
    /** Default [0, 0.1, 1, 10]. */
    ridge_lambdas?: number[];
    /** Default 5. */
    cv?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `aom_pop.aom_chain_ridge_pls` (regressor). */
export declare class AOMChainRidgePLS extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_chain_ridge_pls";
    readonly paramTypes: {
        readonly chain_offsets: "int_array";
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly chain_params: "double_array";
        readonly pls_components: "int_array";
        readonly ridge_lambdas: "double_array";
        readonly cv: "int";
        readonly center_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: AOMChainRidgePLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMChainSweep; unset values take the native defaults. */
export interface AOMChainSweepParams {
    /** Required. */
    chain_offsets?: number[];
    /** Required. */
    op_kinds?: number[];
    /** Required. */
    param_offsets?: number[];
    /** Default []. */
    chain_params?: number[];
    /** Default 5. */
    cv?: number;
    /** Default [0.01, 0.1, 1, 10]. */
    ridge_lambdas?: number[];
    /** Default []. */
    pls_components?: number[];
    /** Default "ridge". */
    heads?: "ridge" | "pls" | "ridge_pls";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
    /** Default "auto". */
    moment_policy?: "auto" | "materialized" | "force";
}
/** Native `aom_pop.aom_chain_sweep` (regressor). */
export declare class AOMChainSweep extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_chain_sweep";
    readonly paramTypes: {
        readonly chain_offsets: "int_array";
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly chain_params: "double_array";
        readonly cv: "int";
        readonly ridge_lambdas: "double_array";
        readonly pls_components: "int_array";
        readonly heads: "enum";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
        readonly moment_policy: "enum";
    };
    constructor(params?: AOMChainSweepParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMPLS; unset values take the native defaults. */
export interface AOMPLSParams {
    /** Default 3. */
    max_components?: number;
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default 3. */
    cv?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `aom_pop.aom_pls` (regressor). */
export declare class AOMPLS extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_pls";
    readonly paramTypes: {
        readonly max_components: "int";
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly cv: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: AOMPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMPLSSuperblock; unset values take the native defaults. */
export interface AOMPLSSuperblockParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default [2]. */
    pls_components?: number[];
    /** Default 5. */
    cv?: number;
    /** Default "rms". */
    block_scaling?: "rms" | "none";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `aom_pop.aom_pls_superblock` (regressor). */
export declare class AOMPLSSuperblock extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_pls_superblock";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly pls_components: "int_array";
        readonly cv: "int";
        readonly block_scaling: "enum";
        readonly center_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: AOMPLSSuperblockParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMPreprocessing; unset values take the native defaults. */
export interface AOMPreprocessingParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default "soft". */
    gating_mode?: "hard" | "soft";
}
/** Native `aom_pop.aom_preprocessing` (transformer). */
export declare class AOMPreprocessing extends NativeEstimator implements Transformer {
    readonly methodId = "aom_pop.aom_preprocessing";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly gating_mode: "enum";
    };
    constructor(params?: AOMPreprocessingParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of AOMRidgePLSSuperblock; unset values take the native defaults. */
export interface AOMRidgePLSSuperblockParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default [2]. */
    pls_components?: number[];
    /** Default [0, 0.1, 1, 10]. */
    ridge_lambdas?: number[];
    /** Default 5. */
    cv?: number;
    /** Default "rms". */
    block_scaling?: "rms" | "none";
    /** Default true. */
    center_x?: boolean;
}
/** Native `aom_pop.aom_ridge_pls_superblock` (regressor). */
export declare class AOMRidgePLSSuperblock extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_ridge_pls_superblock";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly pls_components: "int_array";
        readonly ridge_lambdas: "double_array";
        readonly cv: "int";
        readonly block_scaling: "enum";
        readonly center_x: "bool";
    };
    constructor(params?: AOMRidgePLSSuperblockParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMSweep; unset values take the native defaults. */
export interface AOMSweepParams {
    /** Default "compact". */
    profile?: "compact" | "wide";
    /** Default 5. */
    cv?: number;
    /** Default [0.01, 0.1, 1, 10]. */
    ridge_lambdas?: number[];
    /** Default []. */
    pls_components?: number[];
    /** Default "ridge". */
    heads?: "ridge" | "pls" | "ridge_pls";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
    /** Default "auto". */
    moment_policy?: "auto" | "materialized" | "force";
}
/** Native `aom_pop.aom_sweep` (regressor). */
export declare class AOMSweep extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.aom_sweep";
    readonly paramTypes: {
        readonly profile: "enum";
        readonly cv: "int";
        readonly ridge_lambdas: "double_array";
        readonly pls_components: "int_array";
        readonly heads: "enum";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
        readonly moment_policy: "enum";
    };
    constructor(params?: AOMSweepParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMCalibration; unset values take the native defaults. */
export interface AOMCalibrationParams {
    /** Default "pls". */
    head?: "pls" | "ridge";
    /** Default false. */
    fast?: boolean;
    /** Default 25. */
    max_components?: number;
    /** Default []. */
    alphas?: number[];
    /** Default 3. */
    cv?: number;
    /** Default [0, 1, 2]. */
    branches?: number[];
    /** Default 1. */
    max_depth?: number;
    /** Default 200. */
    rank?: number;
}
/** Native `aom_pop.calibration` (regressor). */
export declare class AOMCalibration extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.calibration";
    readonly paramTypes: {
        readonly head: "enum";
        readonly fast: "bool";
        readonly max_components: "int";
        readonly alphas: "double_array";
        readonly cv: "int";
        readonly branches: "int_array";
        readonly max_depth: "int";
        readonly rank: "int";
    };
    constructor(params?: AOMCalibrationParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of LinearStackCompress; unset values take the native defaults. */
export interface LinearStackCompressParams {
    /** Required. */
    base_intercepts?: number[];
    /** Required. */
    meta_weights?: number[];
    /** Required. */
    meta_intercept?: number[];
}
/** Native `aom_pop.linear_stack_compress` (generic). */
export declare class LinearStackCompress extends NativeProcedure implements Procedure {
    readonly methodId = "aom_pop.linear_stack_compress";
    readonly paramTypes: {
        readonly base_intercepts: "double_array";
        readonly meta_weights: "double_array";
        readonly meta_intercept: "double_array";
    };
    constructor(params?: LinearStackCompressParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of AOMOperatorPLSStack; unset values take the native defaults. */
export interface AOMOperatorPLSStackParams {
    /** Default "compact". */
    profile?: "compact" | "wide";
    /** Default 5. */
    cv?: number;
    /** Default [2, 4, 8]. */
    components?: number[];
    /** Default [0.001, 0.01, 0.1, 1, 10, 100]. */
    alphas?: number[];
    /** Default 0. */
    std_penalty?: number;
    /** Default 0. */
    gap_penalty?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `aom_pop.operator_pls_stack` (regressor). */
export declare class AOMOperatorPLSStack extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.operator_pls_stack";
    readonly paramTypes: {
        readonly profile: "enum";
        readonly cv: "int";
        readonly components: "int_array";
        readonly alphas: "double_array";
        readonly std_penalty: "double";
        readonly gap_penalty: "double";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: AOMOperatorPLSStackParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of POPPLS; unset values take the native defaults. */
export interface POPPLSParams {
    /** Default 3. */
    max_components?: number;
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default 3. */
    cv?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `aom_pop.pop_pls` (regressor). */
export declare class POPPLS extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.pop_pls";
    readonly paramTypes: {
        readonly max_components: "int";
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly cv: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: POPPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRidgeActiveSuperblock; unset values take the native defaults. */
export interface AOMRidgeActiveSuperblockParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default [0.0001, 0.01, 1, 100]. */
    alphas?: number[];
    /** Default 5. */
    cv?: number;
    /** Default 20. */
    active_top_m?: number;
    /** Default 0.98. */
    active_diversity_threshold?: number;
    /** Default "norm". */
    active_score_method?: "norm" | "kta" | "blend";
    /** Default 0. */
    active_max_per_family?: number;
    /** Default true. */
    keep_identity?: boolean;
    /** Default "rms". */
    block_scaling?: "rms" | "none";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `aom_pop.ridge_active_superblock` (regressor). */
export declare class AOMRidgeActiveSuperblock extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.ridge_active_superblock";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly alphas: "double_array";
        readonly cv: "int";
        readonly active_top_m: "int";
        readonly active_diversity_threshold: "double";
        readonly active_score_method: "enum";
        readonly active_max_per_family: "int";
        readonly keep_identity: "bool";
        readonly block_scaling: "enum";
        readonly center_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: AOMRidgeActiveSuperblockParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRidgeBlender; unset values take the native defaults. */
export interface AOMRidgeBlenderParams {
    /** Default "compact". */
    profile?: "compact" | "wide";
    /** Default 5. */
    cv?: number;
    /** Default [0.0001, 0.01, 1, 100]. */
    ridge_lambdas?: number[];
    /** Default 0.01. */
    regularizer?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `aom_pop.ridge_blender` (regressor). */
export declare class AOMRidgeBlender extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.ridge_blender";
    readonly paramTypes: {
        readonly profile: "enum";
        readonly cv: "int";
        readonly ridge_lambdas: "double_array";
        readonly regularizer: "double";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: AOMRidgeBlenderParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRidgeGlobal; unset values take the native defaults. */
export interface AOMRidgeGlobalParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default 5. */
    cv?: number;
    /** Default [0.0001, 0.01, 1, 100]. */
    ridge_lambdas?: number[];
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
    /** Default "auto". */
    moment_policy?: "auto" | "materialized" | "force";
}
/** Native `aom_pop.ridge_global` (regressor). */
export declare class AOMRidgeGlobal extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.ridge_global";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly cv: "int";
        readonly ridge_lambdas: "double_array";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
        readonly moment_policy: "enum";
    };
    constructor(params?: AOMRidgeGlobalParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRidgeMKLSuperblock; unset values take the native defaults. */
export interface AOMRidgeMKLSuperblockParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default [0.0001, 0.01, 1, 100]. */
    alphas?: number[];
    /** Default 5. */
    cv?: number;
    /** Default 6. */
    mkl_top_k?: number;
    /** Default "none". */
    block_scaling?: "rms" | "none";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `aom_pop.ridge_mkl_superblock` (regressor). */
export declare class AOMRidgeMKLSuperblock extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.ridge_mkl_superblock";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly alphas: "double_array";
        readonly cv: "int";
        readonly mkl_top_k: "int";
        readonly block_scaling: "enum";
        readonly center_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: AOMRidgeMKLSuperblockParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRidgeSuperblock; unset values take the native defaults. */
export interface AOMRidgeSuperblockParams {
    /** Default [0, 7, 7, 8, 8, 9, 9, 10, 15]. */
    op_kinds?: number[];
    /** Default [0, 0, 1, 2, 4, 6, 9, 12, 15, 16]. */
    param_offsets?: number[];
    /** Default [1, 2, 5, 2, 7, 2, 7, 2, 1, 11, 2, 2, 5, 5, 1, 1]. */
    op_params?: number[];
    /** Default [0.0001, 0.01, 1, 100]. */
    alphas?: number[];
    /** Default 5. */
    cv?: number;
    /** Default "rms". */
    block_scaling?: "rms" | "none";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `aom_pop.ridge_superblock` (regressor). */
export declare class AOMRidgeSuperblock extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.ridge_superblock";
    readonly paramTypes: {
        readonly op_kinds: "int_array";
        readonly param_offsets: "int_array";
        readonly op_params: "double_array";
        readonly alphas: "double_array";
        readonly cv: "int";
        readonly block_scaling: "enum";
        readonly center_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: AOMRidgeSuperblockParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of AOMRobustHPO; unset values take the native defaults. */
export interface AOMRobustHPOParams {
    /** Default "compact". */
    profile?: "compact" | "wide";
    /** Default 5. */
    cv?: number;
    /** Default "ridge_pls". */
    heads?: "ridge" | "pls" | "ridge_pls";
}
/** Native `aom_pop.robust_hpo` (regressor). */
export declare class AOMRobustHPO extends NativeEstimator implements Regressor {
    readonly methodId = "aom_pop.robust_hpo";
    readonly paramTypes: {
        readonly profile: "enum";
        readonly cv: "int";
        readonly heads: "enum";
    };
    constructor(params?: AOMRobustHPOParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of LinearDrift; unset values take the native defaults. */
export interface LinearDriftParams {
    /** Default -0.05. */
    offset_min?: number;
    /** Default 0.05. */
    offset_max?: number;
    /** Default -0.01. */
    slope_min?: number;
    /** Default 0.01. */
    slope_max?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.drift.linear_drift` (augmenter). */
export declare class LinearDrift extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.drift.linear_drift";
    readonly paramTypes: {
        readonly offset_min: "double";
        readonly offset_max: "double";
        readonly slope_min: "double";
        readonly slope_max: "double";
        readonly seed: "int";
    };
    constructor(params?: LinearDriftParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of PathLength; unset values take the native defaults. */
export interface PathLengthParams {
    /** Default 0.05. */
    path_length_std?: number;
    /** Default 0.1. */
    min_path_length?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.drift.path_length` (augmenter). */
export declare class PathLength extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.drift.path_length";
    readonly paramTypes: {
        readonly path_length_std: "double";
        readonly min_path_length: "double";
        readonly seed: "int";
    };
    constructor(params?: PathLengthParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of PolyDrift; unset values take the native defaults. */
export interface PolyDriftParams {
    /** Default [-0.01, -0.01, -0.01]. */
    coeff_min?: number[];
    /** Default [0.01, 0.01, 0.01]. */
    coeff_max?: number[];
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.drift.poly_drift` (augmenter). */
export declare class PolyDrift extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.drift.poly_drift";
    readonly paramTypes: {
        readonly coeff_min: "double_array";
        readonly coeff_max: "double_array";
        readonly seed: "int";
    };
    constructor(params?: PolyDriftParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of DetectorRolloff; unset values take the native defaults. */
export interface DetectorRolloffParams {
    /** Default "generic_nir". */
    detector_model?: "ingaas_standard" | "ingaas_extended" | "pbs" | "silicon_ccd" | "generic_nir";
    /** Default 1. */
    effect_strength?: number;
    /** Default 0.02. */
    noise_amplification?: number;
    /** Default true. */
    include_baseline_distortion?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.edge_artifacts.detector_rolloff` (augmenter). Required inputs: axis. */
export declare class DetectorRolloff extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.edge_artifacts.detector_rolloff";
    readonly paramTypes: {
        readonly detector_model: "enum";
        readonly effect_strength: "double";
        readonly noise_amplification: "double";
        readonly include_baseline_distortion: "bool";
        readonly seed: "int";
    };
    constructor(params?: DetectorRolloffParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of EdgeArtifacts; unset values take the native defaults. */
export interface EdgeArtifactsParams {
    /** Default true. */
    detector_roll_off?: boolean;
    /** Default true. */
    stray_light?: boolean;
    /** Default true. */
    edge_curvature?: boolean;
    /** Default true. */
    truncated_peaks?: boolean;
    /** Default 1. */
    overall_strength?: number;
    /** Default "generic_nir". */
    detector_model?: "ingaas_standard" | "ingaas_extended" | "pbs" | "silicon_ccd" | "generic_nir";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.edge_artifacts.edge_artifacts` (augmenter). Required inputs: axis. */
export declare class EdgeArtifacts extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.edge_artifacts.edge_artifacts";
    readonly paramTypes: {
        readonly detector_roll_off: "bool";
        readonly stray_light: "bool";
        readonly edge_curvature: "bool";
        readonly truncated_peaks: "bool";
        readonly overall_strength: "double";
        readonly detector_model: "enum";
        readonly seed: "int";
    };
    constructor(params?: EdgeArtifactsParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of EdgeCurvature; unset values take the native defaults. */
export interface EdgeCurvatureParams {
    /** Default 0.02. */
    curvature_strength?: number;
    /** Default "random". */
    curvature_type?: "random" | "smile" | "frown" | "asymmetric";
    /** Default 0. */
    asymmetry?: number;
    /** Default 0.7. */
    edge_focus?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.edge_artifacts.edge_curvature` (augmenter). Required inputs: axis. */
export declare class EdgeCurvature extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.edge_artifacts.edge_curvature";
    readonly paramTypes: {
        readonly curvature_strength: "double";
        readonly curvature_type: "enum";
        readonly asymmetry: "double";
        readonly edge_focus: "double";
        readonly seed: "int";
    };
    constructor(params?: EdgeCurvatureParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of StrayLight; unset values take the native defaults. */
export interface StrayLightParams {
    /** Default 0.001. */
    stray_light_fraction?: number;
    /** Default 2. */
    edge_enhancement?: number;
    /** Default 0.1. */
    edge_width?: number;
    /** Default true. */
    include_peak_truncation?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.edge_artifacts.stray_light` (augmenter). */
export declare class StrayLight extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.edge_artifacts.stray_light";
    readonly paramTypes: {
        readonly stray_light_fraction: "double";
        readonly edge_enhancement: "double";
        readonly edge_width: "double";
        readonly include_peak_truncation: "bool";
        readonly seed: "int";
    };
    constructor(params?: StrayLightParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of TruncatedPeak; unset values take the native defaults. */
export interface TruncatedPeakParams {
    /** Default 0.5. */
    peak_probability?: number;
    /** Default 0.01. */
    amplitude_min?: number;
    /** Default 0.1. */
    amplitude_max?: number;
    /** Default 50. */
    width_min?: number;
    /** Default 200. */
    width_max?: number;
    /** Default true. */
    left_edge?: boolean;
    /** Default true. */
    right_edge?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.edge_artifacts.truncated_peak` (augmenter). Required inputs: axis. */
export declare class TruncatedPeak extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.edge_artifacts.truncated_peak";
    readonly paramTypes: {
        readonly peak_probability: "double";
        readonly amplitude_min: "double";
        readonly amplitude_max: "double";
        readonly width_min: "double";
        readonly width_max: "double";
        readonly left_edge: "bool";
        readonly right_edge: "bool";
        readonly seed: "int";
    };
    constructor(params?: TruncatedPeakParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of Moisture; unset values take the native defaults. */
export interface MoistureParams {
    /** Default 0. */
    water_activity_delta?: number;
    /** Default false. */
    use_aw_range?: boolean;
    /** Default 0. */
    aw_low?: number;
    /** Default 1. */
    aw_high?: number;
    /** Default 0.5. */
    reference_water_activity?: number;
    /** Default 0.3. */
    free_water_fraction?: number;
    /** Default 25. */
    bound_water_shift?: number;
    /** Default 0.1. */
    moisture_content?: number;
    /** Default true. */
    enable_shift?: boolean;
    /** Default true. */
    enable_intensity?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.environmental.moisture` (augmenter). Required inputs: axis. */
export declare class Moisture extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.environmental.moisture";
    readonly paramTypes: {
        readonly water_activity_delta: "double";
        readonly use_aw_range: "bool";
        readonly aw_low: "double";
        readonly aw_high: "double";
        readonly reference_water_activity: "double";
        readonly free_water_fraction: "double";
        readonly bound_water_shift: "double";
        readonly moisture_content: "double";
        readonly enable_shift: "bool";
        readonly enable_intensity: "bool";
        readonly seed: "int";
    };
    constructor(params?: MoistureParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of Temperature; unset values take the native defaults. */
export interface TemperatureParams {
    /** Default 0. */
    temperature_delta?: number;
    /** Default false. */
    use_temp_range?: boolean;
    /** Default -5. */
    temp_low?: number;
    /** Default 5. */
    temp_high?: number;
    /** Default true. */
    enable_shift?: boolean;
    /** Default true. */
    enable_intensity?: boolean;
    /** Default true. */
    enable_broadening?: boolean;
    /** Default true. */
    region_specific?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.environmental.temperature` (augmenter). Required inputs: axis. */
export declare class Temperature extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.environmental.temperature";
    readonly paramTypes: {
        readonly temperature_delta: "double";
        readonly use_temp_range: "bool";
        readonly temp_low: "double";
        readonly temp_high: "double";
        readonly enable_shift: "bool";
        readonly enable_intensity: "bool";
        readonly enable_broadening: "bool";
        readonly region_specific: "bool";
        readonly seed: "int";
    };
    constructor(params?: TemperatureParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of LocalMixup; unset values take the native defaults. */
export interface LocalMixupParams {
    /** Default 0.2. */
    alpha?: number;
    /** Default 5. */
    k_neighbors?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.mixup.local_mixup` (augmenter). Required inputs: y. */
export declare class LocalMixup extends NativeProcedure implements TargetMixingAugmenter {
    readonly methodId = "augmentation.mixup.local_mixup";
    readonly paramTypes: {
        readonly alpha: "double";
        readonly k_neighbors: "int";
        readonly seed: "int";
    };
    constructor(params?: LocalMixupParams);
    augment(X: Matrix, y: Matrix | Float64Array | ArrayLike<number>, axis?: Float64Array | number[]): {
        X: Matrix;
        Y: Matrix;
    };
}
/** Parameters of Mixup; unset values take the native defaults. */
export interface MixupParams {
    /** Default 0.2. */
    alpha?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.mixup.mixup` (augmenter). Required inputs: y. */
export declare class Mixup extends NativeProcedure implements TargetMixingAugmenter {
    readonly methodId = "augmentation.mixup.mixup";
    readonly paramTypes: {
        readonly alpha: "double";
        readonly seed: "int";
    };
    constructor(params?: MixupParams);
    augment(X: Matrix, y: Matrix | Float64Array | ArrayLike<number>, axis?: Float64Array | number[]): {
        X: Matrix;
        Y: Matrix;
    };
}
/** Parameters of GaussianNoise; unset values take the native defaults. */
export interface GaussianNoiseParams {
    /** Default 0.01. */
    sigma?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.noise.gaussian_noise` (augmenter). */
export declare class GaussianNoise extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.noise.gaussian_noise";
    readonly paramTypes: {
        readonly sigma: "double";
        readonly seed: "int";
    };
    constructor(params?: GaussianNoiseParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of HeteroNoise; unset values take the native defaults. */
export interface HeteroNoiseParams {
    /** Default 0.001. */
    noise_base?: number;
    /** Default 0.01. */
    noise_signal_dep?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.noise.hetero_noise` (augmenter). */
export declare class HeteroNoise extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.noise.hetero_noise";
    readonly paramTypes: {
        readonly noise_base: "double";
        readonly noise_signal_dep: "double";
        readonly seed: "int";
    };
    constructor(params?: HeteroNoiseParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of MultiplicativeNoise; unset values take the native defaults. */
export interface MultiplicativeNoiseParams {
    /** Default 0.01. */
    sigma_gain?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.noise.multiplicative_noise` (augmenter). */
export declare class MultiplicativeNoise extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.noise.multiplicative_noise";
    readonly paramTypes: {
        readonly sigma_gain: "double";
        readonly seed: "int";
    };
    constructor(params?: MultiplicativeNoiseParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SpikeNoise; unset values take the native defaults. */
export interface SpikeNoiseParams {
    /** Default 1. */
    n_spikes_min?: number;
    /** Default 3. */
    n_spikes_max?: number;
    /** Default -0.1. */
    amplitude_min?: number;
    /** Default 0.1. */
    amplitude_max?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.noise.spike_noise` (augmenter). */
export declare class SpikeNoise extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.noise.spike_noise";
    readonly paramTypes: {
        readonly n_spikes_min: "int";
        readonly n_spikes_max: "int";
        readonly amplitude_min: "double";
        readonly amplitude_max: "double";
        readonly seed: "int";
    };
    constructor(params?: SpikeNoiseParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of RandomXOp; unset values take the native defaults. */
export interface RandomXOpParams {
    /** Default "multiply". */
    op_kind?: "multiply" | "add" | "subtract";
    /** Default 0.97. */
    operator_range_min?: number;
    /** Default 1.03. */
    operator_range_max?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.random.random_x_op` (augmenter). */
export declare class RandomXOp extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.random.random_x_op";
    readonly paramTypes: {
        readonly op_kind: "enum";
        readonly operator_range_min: "double";
        readonly operator_range_max: "double";
        readonly seed: "int";
    };
    constructor(params?: RandomXOpParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of RotateTranslate; unset values take the native defaults. */
export interface RotateTranslateParams {
    /** Default 2. */
    p_range?: number;
    /** Default 3. */
    y_factor?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.random.rotate_translate` (augmenter). */
export declare class RotateTranslate extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.random.rotate_translate";
    readonly paramTypes: {
        readonly p_range: "double";
        readonly y_factor: "double";
        readonly seed: "int";
    };
    constructor(params?: RotateTranslateParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of BatchEffect; unset values take the native defaults. */
export interface BatchEffectParams {
    /** Default 0. */
    offset_std?: number;
    /** Default 0. */
    slope_std?: number;
    /** Default 0. */
    gain_std?: number;
    /** Default "sample". */
    variation_scope?: "sample" | "batch";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.batch_effect` (augmenter). */
export declare class BatchEffect extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.batch_effect";
    readonly paramTypes: {
        readonly offset_std: "double";
        readonly slope_std: "double";
        readonly gain_std: "double";
        readonly variation_scope: "enum";
        readonly seed: "int";
    };
    constructor(params?: BatchEffectParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of DeadBand; unset values take the native defaults. */
export interface DeadBandParams {
    /** Default 1. */
    n_bands?: number;
    /** Default 5. */
    width_low?: number;
    /** Default 10. */
    width_high?: number;
    /** Default 0.05. */
    noise_std?: number;
    /** Default 0. */
    probability?: number;
    /** Default "sample". */
    variation_scope?: "sample" | "batch";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.dead_band` (augmenter). */
export declare class DeadBand extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.dead_band";
    readonly paramTypes: {
        readonly n_bands: "int";
        readonly width_low: "int";
        readonly width_high: "int";
        readonly noise_std: "double";
        readonly probability: "double";
        readonly variation_scope: "enum";
        readonly seed: "int";
    };
    constructor(params?: DeadBandParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of EMSCDistort; unset values take the native defaults. */
export interface EMSCDistortParams {
    /** Default 0.9. */
    mult_low?: number;
    /** Default 1.1. */
    mult_high?: number;
    /** Default -0.05. */
    add_low?: number;
    /** Default 0.05. */
    add_high?: number;
    /** Default 2. */
    polynomial_order?: number;
    /** Default 0.02. */
    polynomial_strength?: number;
    /** Default 0.3. */
    correlation?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.emsc_distort` (augmenter). Required inputs: axis. */
export declare class EMSCDistort extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.emsc_distort";
    readonly paramTypes: {
        readonly mult_low: "double";
        readonly mult_high: "double";
        readonly add_low: "double";
        readonly add_high: "double";
        readonly polynomial_order: "int";
        readonly polynomial_strength: "double";
        readonly correlation: "double";
        readonly seed: "int";
    };
    constructor(params?: EMSCDistortParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of InstrumentBroaden; unset values take the native defaults. */
export interface InstrumentBroadenParams {
    /** Default 5. */
    fwhm?: number;
    /** Default false. */
    use_fwhm_range?: boolean;
    /** Default 3. */
    fwhm_low?: number;
    /** Default 8. */
    fwhm_high?: number;
    /** Default "sample". */
    variation_scope?: "sample" | "batch";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.instrument_broaden` (augmenter). */
export declare class InstrumentBroaden extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.instrument_broaden";
    readonly paramTypes: {
        readonly fwhm: "double";
        readonly use_fwhm_range: "bool";
        readonly fwhm_low: "double";
        readonly fwhm_high: "double";
        readonly variation_scope: "enum";
        readonly seed: "int";
    };
    constructor(params?: InstrumentBroadenParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of ParticleSize; unset values take the native defaults. */
export interface ParticleSizeParams {
    /** Default 50. */
    mean_size_um?: number;
    /** Default 15. */
    size_variation_um?: number;
    /** Default false. */
    use_size_range?: boolean;
    /** Default 5. */
    size_range_low_um?: number;
    /** Default 500. */
    size_range_high_um?: number;
    /** Default 50. */
    reference_size_um?: number;
    /** Default 1.5. */
    wavelength_exponent?: number;
    /** Default 0.1. */
    size_effect_strength?: number;
    /** Default true. */
    include_path_length?: boolean;
    /** Default 0.5. */
    path_length_sensitivity?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.particle_size` (augmenter). Required inputs: axis. */
export declare class ParticleSize extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.particle_size";
    readonly paramTypes: {
        readonly mean_size_um: "double";
        readonly size_variation_um: "double";
        readonly use_size_range: "bool";
        readonly size_range_low_um: "double";
        readonly size_range_high_um: "double";
        readonly reference_size_um: "double";
        readonly wavelength_exponent: "double";
        readonly size_effect_strength: "double";
        readonly include_path_length: "bool";
        readonly path_length_sensitivity: "double";
        readonly seed: "int";
    };
    constructor(params?: ParticleSizeParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of ScatterSimMSC; unset values take the native defaults. */
export interface ScatterSimMSCParams {
    /** Default -0.05. */
    a_low?: number;
    /** Default 0.05. */
    a_high?: number;
    /** Default 0.9. */
    b_low?: number;
    /** Default 1.1. */
    b_high?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.scattering.scatter_sim_msc` (augmenter). */
export declare class ScatterSimMSC extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.scattering.scatter_sim_msc";
    readonly paramTypes: {
        readonly a_low: "double";
        readonly a_high: "double";
        readonly b_low: "double";
        readonly b_high: "double";
        readonly seed: "int";
    };
    constructor(params?: ScatterSimMSCParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of BandMask; unset values take the native defaults. */
export interface BandMaskParams {
    /** Default 1. */
    n_bands_lo?: number;
    /** Default 3. */
    n_bands_hi?: number;
    /** Default 5. */
    bw_lo?: number;
    /** Default 15. */
    bw_hi?: number;
    /** Default "zero". */
    mode?: "zero" | "interp";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.band_mask` (augmenter). */
export declare class BandMask extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.band_mask";
    readonly paramTypes: {
        readonly n_bands_lo: "int";
        readonly n_bands_hi: "int";
        readonly bw_lo: "int";
        readonly bw_hi: "int";
        readonly mode: "enum";
        readonly seed: "int";
    };
    constructor(params?: BandMaskParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of BandPerturb; unset values take the native defaults. */
export interface BandPerturbParams {
    /** Default 3. */
    n_bands?: number;
    /** Default 5. */
    bw_lo?: number;
    /** Default 15. */
    bw_hi?: number;
    /** Default 0.9. */
    gain_lo?: number;
    /** Default 1.1. */
    gain_hi?: number;
    /** Default -0.01. */
    offset_lo?: number;
    /** Default 0.01. */
    offset_hi?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.band_perturb` (augmenter). */
export declare class BandPerturb extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.band_perturb";
    readonly paramTypes: {
        readonly n_bands: "int";
        readonly bw_lo: "int";
        readonly bw_hi: "int";
        readonly gain_lo: "double";
        readonly gain_hi: "double";
        readonly offset_lo: "double";
        readonly offset_hi: "double";
        readonly seed: "int";
    };
    constructor(params?: BandPerturbParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of ChannelDropout; unset values take the native defaults. */
export interface ChannelDropoutParams {
    /** Default 0.05. */
    dropout_prob?: number;
    /** Default "zero". */
    mode?: "zero" | "interp";
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.channel_dropout` (augmenter). */
export declare class ChannelDropout extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.channel_dropout";
    readonly paramTypes: {
        readonly dropout_prob: "double";
        readonly mode: "enum";
        readonly seed: "int";
    };
    constructor(params?: ChannelDropoutParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of GaussJitter; unset values take the native defaults. */
export interface GaussJitterParams {
    /** Default 0.5. */
    sigma_lo?: number;
    /** Default 1.5. */
    sigma_hi?: number;
    /** Default 9. */
    kernel_width?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.gauss_jitter` (augmenter). */
export declare class GaussJitter extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.gauss_jitter";
    readonly paramTypes: {
        readonly sigma_lo: "double";
        readonly sigma_hi: "double";
        readonly kernel_width: "int";
        readonly seed: "int";
    };
    constructor(params?: GaussJitterParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of LocalClip; unset values take the native defaults. */
export interface LocalClipParams {
    /** Default 1. */
    n_regions?: number;
    /** Default 5. */
    width_lo?: number;
    /** Default 15. */
    width_hi?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.local_clip` (augmenter). */
export declare class LocalClip extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.local_clip";
    readonly paramTypes: {
        readonly n_regions: "int";
        readonly width_lo: "int";
        readonly width_hi: "int";
        readonly seed: "int";
    };
    constructor(params?: LocalClipParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of MagnitudeWarp; unset values take the native defaults. */
export interface MagnitudeWarpParams {
    /** Default 5. */
    n_control_points?: number;
    /** Default 0.9. */
    gain_lo?: number;
    /** Default 1.1. */
    gain_hi?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.magnitude_warp` (augmenter). */
export declare class MagnitudeWarp extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.magnitude_warp";
    readonly paramTypes: {
        readonly n_control_points: "int";
        readonly gain_lo: "double";
        readonly gain_hi: "double";
        readonly seed: "int";
    };
    constructor(params?: MagnitudeWarpParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of UnsharpMask; unset values take the native defaults. */
export interface UnsharpMaskParams {
    /** Default 0.1. */
    amount_lo?: number;
    /** Default 0.5. */
    amount_hi?: number;
    /** Default 1. */
    sigma?: number;
    /** Default 11. */
    kernel_width?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.spectral.unsharp_mask` (augmenter). */
export declare class UnsharpMask extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.spectral.unsharp_mask";
    readonly paramTypes: {
        readonly amount_lo: "double";
        readonly amount_hi: "double";
        readonly sigma: "double";
        readonly kernel_width: "int";
        readonly seed: "int";
    };
    constructor(params?: UnsharpMaskParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SplineCurveSimplification; unset values take the native defaults. */
export interface SplineCurveSimplificationParams {
    /** Default -1. */
    spline_points?: number;
    /** Default false. */
    uniform?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.splines.spline_curve_simplification` (augmenter). */
export declare class SplineCurveSimplification extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.splines.spline_curve_simplification";
    readonly paramTypes: {
        readonly spline_points: "int";
        readonly uniform: "bool";
        readonly seed: "int";
    };
    constructor(params?: SplineCurveSimplificationParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SplineSmoothing; unset values take the native defaults. */
export interface SplineSmoothingParams {
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.splines.spline_smoothing` (augmenter). */
export declare class SplineSmoothing extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.splines.spline_smoothing";
    readonly paramTypes: {
        readonly seed: "int";
    };
    constructor(params?: SplineSmoothingParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SplineXPerturbations; unset values take the native defaults. */
export interface SplineXPerturbationsParams {
    /** Default 3. */
    spline_degree?: number;
    /** Default 0.05. */
    perturbation_density?: number;
    /** Default -0.1. */
    perturbation_range_min?: number;
    /** Default 0.1. */
    perturbation_range_max?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.splines.spline_x_perturbations` (augmenter). */
export declare class SplineXPerturbations extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.splines.spline_x_perturbations";
    readonly paramTypes: {
        readonly spline_degree: "int";
        readonly perturbation_density: "double";
        readonly perturbation_range_min: "double";
        readonly perturbation_range_max: "double";
        readonly seed: "int";
    };
    constructor(params?: SplineXPerturbationsParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SplineXSimplification; unset values take the native defaults. */
export interface SplineXSimplificationParams {
    /** Default -1. */
    spline_points?: number;
    /** Default false. */
    uniform?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.splines.spline_x_simplification` (augmenter). */
export declare class SplineXSimplification extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.splines.spline_x_simplification";
    readonly paramTypes: {
        readonly spline_points: "int";
        readonly uniform: "bool";
        readonly seed: "int";
    };
    constructor(params?: SplineXSimplificationParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of SplineYPerturbations; unset values take the native defaults. */
export interface SplineYPerturbationsParams {
    /** Default -1. */
    spline_points?: number;
    /** Default 0.005. */
    perturbation_intensity?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.splines.spline_y_perturbations` (augmenter). */
export declare class SplineYPerturbations extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.splines.spline_y_perturbations";
    readonly paramTypes: {
        readonly spline_points: "int";
        readonly perturbation_intensity: "double";
        readonly seed: "int";
    };
    constructor(params?: SplineYPerturbationsParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of LocalWarp; unset values take the native defaults. */
export interface LocalWarpParams {
    /** Default 5. */
    n_control_points?: number;
    /** Default 1. */
    max_shift?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.wavelength.local_warp` (augmenter). */
export declare class LocalWarp extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.wavelength.local_warp";
    readonly paramTypes: {
        readonly n_control_points: "int";
        readonly max_shift: "double";
        readonly seed: "int";
    };
    constructor(params?: LocalWarpParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of WavelengthShift; unset values take the native defaults. */
export interface WavelengthShiftParams {
    /** Default -1. */
    shift_lo?: number;
    /** Default 1. */
    shift_hi?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.wavelength.wavelength_shift` (augmenter). */
export declare class WavelengthShift extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.wavelength.wavelength_shift";
    readonly paramTypes: {
        readonly shift_lo: "double";
        readonly shift_hi: "double";
        readonly seed: "int";
    };
    constructor(params?: WavelengthShiftParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of WavelengthStretch; unset values take the native defaults. */
export interface WavelengthStretchParams {
    /** Default 0.99. */
    stretch_lo?: number;
    /** Default 1.01. */
    stretch_hi?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `augmentation.wavelength.wavelength_stretch` (augmenter). */
export declare class WavelengthStretch extends NativeProcedure implements Augmenter {
    readonly methodId = "augmentation.wavelength.wavelength_stretch";
    readonly paramTypes: {
        readonly stretch_lo: "double";
        readonly stretch_hi: "double";
        readonly seed: "int";
    };
    constructor(params?: WavelengthStretchParams);
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Parameters of ApproximatePress; unset values take the native defaults. */
export interface ApproximatePressParams {
    /** Default 10. */
    max_components?: number;
}
/** Native `diagnostics.approximate_press` (generic). Required inputs: y. */
export declare class ApproximatePress extends NativeProcedure implements Procedure {
    readonly methodId = "diagnostics.approximate_press";
    readonly paramTypes: {
        readonly max_components: "int";
    };
    constructor(params?: ApproximatePressParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of ModelSelection; unset values take the native defaults. */
export interface ModelSelectionParams {
}
/** Native `diagnostics.model_selection` (generic). */
export declare class ModelSelection extends NativeProcedure implements Procedure {
    readonly methodId = "diagnostics.model_selection";
    readonly paramTypes: {};
    constructor(params?: ModelSelectionParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of PLSDiagnostics; unset values take the native defaults. */
export interface PLSDiagnosticsParams {
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `diagnostics.pls_diagnostics` (generic). Required inputs: y. */
export declare class PLSDiagnostics extends NativeProcedure implements Procedure {
    readonly methodId = "diagnostics.pls_diagnostics";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: PLSDiagnosticsParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of PLSMonitoring; unset values take the native defaults. */
export interface PLSMonitoringParams {
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
    /** Default 0.05. */
    alpha?: number;
}
/** Native `diagnostics.pls_monitoring` (generic). Required inputs: y, target_domain. */
export declare class PLSMonitoring extends NativeProcedure implements Procedure {
    readonly methodId = "diagnostics.pls_monitoring";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
        readonly alpha: "double";
    };
    constructor(params?: PLSMonitoringParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of RegressionMetrics; unset values take the native defaults. */
export interface RegressionMetricsParams {
}
/** Native `diagnostics.regression_metrics` (generic). Required inputs: y. */
export declare class RegressionMetrics extends NativeProcedure implements Procedure {
    readonly methodId = "diagnostics.regression_metrics";
    readonly paramTypes: {};
    constructor(params?: RegressionMetricsParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of CorrelationFilter; unset values take the native defaults. */
export interface CorrelationFilterParams {
    /** Default 0. */
    threshold?: number;
    /** Default -1. */
    top_k?: number;
}
/** Native `filters.correlation` (selector). */
export declare class CorrelationFilter extends NativeEstimator implements Selector {
    readonly methodId = "filters.correlation";
    readonly paramTypes: {
        readonly threshold: "double";
        readonly top_k: "int";
    };
    constructor(params?: CorrelationFilterParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of HighLeverageFilter; unset values take the native defaults. */
export interface HighLeverageFilterParams {
    /** Default "hat". */
    method?: "hat" | "pca";
    /** Default 2. */
    threshold_multiplier?: number;
    /** */
    absolute_threshold?: number;
    /** Default 0. */
    n_components?: number;
    /** Default true. */
    center?: boolean;
}
/** Native `filters.high_leverage` (sample_filter). */
export declare class HighLeverageFilter extends NativeEstimator implements SampleFilter {
    readonly methodId = "filters.high_leverage";
    readonly paramTypes: {
        readonly method: "enum";
        readonly threshold_multiplier: "double";
        readonly absolute_threshold: "double";
        readonly n_components: "int";
        readonly center: "bool";
    };
    constructor(params?: HighLeverageFilterParams);
    getMask(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
}
/** Parameters of SpectralQualityFilter; unset values take the native defaults. */
export interface SpectralQualityFilterParams {
    /** Default 0.1. */
    max_nan_ratio?: number;
    /** Default 0.5. */
    max_zero_ratio?: number;
    /** Default 1e-08. */
    min_variance?: number;
    /** */
    max_value?: number;
    /** */
    min_value?: number;
    /** Default true. */
    check_inf?: boolean;
}
/** Native `filters.spectral_quality` (sample_filter). */
export declare class SpectralQualityFilter extends NativeEstimator implements SampleFilter {
    readonly methodId = "filters.spectral_quality";
    readonly paramTypes: {
        readonly max_nan_ratio: "double";
        readonly max_zero_ratio: "double";
        readonly min_variance: "double";
        readonly max_value: "double";
        readonly min_value: "double";
        readonly check_inf: "bool";
    };
    constructor(params?: SpectralQualityFilterParams);
    getMask(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
}
/** Parameters of VarianceFilter; unset values take the native defaults. */
export interface VarianceFilterParams {
    /** Default 0. */
    threshold?: number;
    /** Default -1. */
    top_k?: number;
}
/** Native `filters.variance` (selector). */
export declare class VarianceFilter extends NativeEstimator implements Selector {
    readonly methodId = "filters.variance";
    readonly paramTypes: {
        readonly threshold: "double";
        readonly top_k: "int";
    };
    constructor(params?: VarianceFilterParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of XOutlierFilter; unset values take the native defaults. */
export interface XOutlierFilterParams {
    /** Default "mahalanobis". */
    method?: "mahalanobis" | "robust_mahalanobis" | "pca_residual" | "pca_leverage" | "isolation_forest" | "lof";
    /** */
    threshold?: number;
    /** Default 0. */
    n_components?: number;
    /** Default 0.1. */
    contamination?: number;
    /** Default 0. */
    seed?: number;
    /** Default 100. */
    n_estimators?: number;
    /** Default 256. */
    max_samples?: number;
}
/** Native `filters.x_outlier` (sample_filter). */
export declare class XOutlierFilter extends NativeEstimator implements SampleFilter {
    readonly methodId = "filters.x_outlier";
    readonly paramTypes: {
        readonly method: "enum";
        readonly threshold: "double";
        readonly n_components: "int";
        readonly contamination: "double";
        readonly seed: "int";
        readonly n_estimators: "int";
        readonly max_samples: "int";
    };
    constructor(params?: XOutlierFilterParams);
    getMask(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
}
/** Parameters of YOutlierFilter; unset values take the native defaults. */
export interface YOutlierFilterParams {
    /** Default "iqr". */
    method?: "iqr" | "zscore" | "percentile" | "mad";
    /** Default 1.5. */
    threshold?: number;
    /** Default 1. */
    lower_percentile?: number;
    /** Default 99. */
    upper_percentile?: number;
}
/** Native `filters.y_outlier` (sample_filter). */
export declare class YOutlierFilter extends NativeEstimator implements SampleFilter {
    readonly methodId = "filters.y_outlier";
    readonly paramTypes: {
        readonly method: "enum";
        readonly threshold: "double";
        readonly lower_percentile: "double";
        readonly upper_percentile: "double";
    };
    constructor(params?: YOutlierFilterParams);
    getMask(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
}
/** Parameters of PLSLDA; unset values take the native defaults. */
export interface PLSLDAParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.classification.pls_lda` (classifier). Required fit inputs: labels. */
export declare class PLSLDA extends NativeEstimator implements Classifier {
    readonly methodId = "models.classification.pls_lda";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    protected readonly labelTarget = true;
    constructor(params?: PLSLDAParams);
    decisionFunction(X: Matrix): Matrix;
    predictLabels(X: Matrix): number[];
    classes(): number[];
}
/** Parameters of PLSLogistic; unset values take the native defaults. */
export interface PLSLogisticParams {
    /** Default 2. */
    n_components?: number;
    /** Default 500. */
    max_iter?: number;
}
/** Native `models.classification.pls_logistic` (classifier). Required fit inputs: labels. */
export declare class PLSLogistic extends NativeEstimator implements ProbabilisticClassifier {
    readonly methodId = "models.classification.pls_logistic";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly max_iter: "int";
    };
    protected readonly labelTarget = true;
    constructor(params?: PLSLogisticParams);
    decisionFunction(X: Matrix): Matrix;
    predictLabels(X: Matrix): number[];
    classes(): number[];
    predictProba(X: Matrix): Matrix;
}
/** Parameters of PLSQDA; unset values take the native defaults. */
export interface PLSQDAParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.classification.pls_qda` (classifier). Required fit inputs: labels. */
export declare class PLSQDA extends NativeEstimator implements ProbabilisticClassifier {
    readonly methodId = "models.classification.pls_qda";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    protected readonly labelTarget = true;
    constructor(params?: PLSQDAParams);
    decisionFunction(X: Matrix): Matrix;
    predictLabels(X: Matrix): number[];
    classes(): number[];
    predictProba(X: Matrix): Matrix;
}
/** Parameters of BaggingPLS; unset values take the native defaults. */
export interface BaggingPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    n_estimators?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `models.ensembles.bagging_pls` (regressor). */
export declare class BaggingPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.ensembles.bagging_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_estimators: "int";
        readonly seed: "int";
    };
    constructor(params?: BaggingPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of BoostingPLS; unset values take the native defaults. */
export interface BoostingPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    n_estimators?: number;
    /** Default 0.1. */
    learning_rate?: number;
}
/** Native `models.ensembles.boosting_pls` (regressor). */
export declare class BoostingPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.ensembles.boosting_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_estimators: "int";
        readonly learning_rate: "double";
    };
    constructor(params?: BoostingPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of RandomSubspacePLS; unset values take the native defaults. */
export interface RandomSubspacePLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    n_estimators?: number;
    /** Default 10. */
    features_per_subspace?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `models.ensembles.random_subspace_pls` (regressor). */
export declare class RandomSubspacePLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.ensembles.random_subspace_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_estimators: "int";
        readonly features_per_subspace: "int";
        readonly seed: "int";
    };
    constructor(params?: RandomSubspacePLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of PLSCox; unset values take the native defaults. */
export interface PLSCoxParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 1e-10. */
    tol?: number;
}
/** Native `models.heads.pls_cox` (regressor). */
export declare class PLSCox extends NativeEstimator implements Regressor {
    readonly methodId = "models.heads.pls_cox";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: PLSCoxParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of PLSGLM; unset values take the native defaults. */
export interface PLSGLMParams {
    /** Default 2. */
    n_components?: number;
    /** Default "gaussian". */
    family?: "gaussian" | "poisson" | "binomial";
    /** Default 100. */
    max_iter?: number;
    /** Default 1e-10. */
    tol?: number;
}
/** Native `models.heads.pls_glm` (regressor). */
export declare class PLSGLM extends NativeEstimator implements Regressor {
    readonly methodId = "models.heads.pls_glm";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly family: "enum";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: PLSGLMParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of LWPLS; unset values take the native defaults. */
export interface LWPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Required. */
    n_neighbors?: number;
    /** Default "weighted". */
    mode?: "weighted" | "knn";
}
/** Native `models.local.lw_pls` (regressor). */
export declare class LWPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.local.lw_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_neighbors: "int";
        readonly mode: "enum";
    };
    constructor(params?: LWPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of MBPLS; unset values take the native defaults. */
export interface MBPLSParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.multiblock.mb_pls` (regressor). Required fit inputs: blocks. */
export declare class MBPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.multiblock.mb_pls";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    constructor(params?: MBPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of MIRPLS; unset values take the native defaults. */
export interface MIRPLSParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.multiblock.mir_pls` (regressor). */
export declare class MIRPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.multiblock.mir_pls";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    constructor(params?: MIRPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of O2PLS; unset values take the native defaults. */
export interface O2PLSParams {
    /** Default 2. */
    n_predictive?: number;
    /** Default 1. */
    n_x_orthogonal?: number;
    /** Default 1. */
    n_y_orthogonal?: number;
}
/** Native `models.multiblock.o2pls` (regressor). */
export declare class O2PLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.multiblock.o2pls";
    readonly paramTypes: {
        readonly n_predictive: "int";
        readonly n_x_orthogonal: "int";
        readonly n_y_orthogonal: "int";
    };
    constructor(params?: O2PLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of OnPLS; unset values take the native defaults. */
export interface OnPLSParams {
    /** Default 1. */
    n_joint?: number;
    /** Required. */
    n_unique_per_block?: number[];
}
/** Native `models.multiblock.on_pls` (transformer). Required fit inputs: blocks. */
export declare class OnPLS extends NativeEstimator implements Transformer {
    readonly methodId = "models.multiblock.on_pls";
    readonly paramTypes: {
        readonly n_joint: "int";
        readonly n_unique_per_block: "int_array";
    };
    constructor(params?: OnPLSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ROSA; unset values take the native defaults. */
export interface ROSAParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.multiblock.rosa` (regressor). Required fit inputs: blocks. */
export declare class ROSA extends NativeEstimator implements Regressor {
    readonly methodId = "models.multiblock.rosa";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    constructor(params?: ROSAParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of SOPLS; unset values take the native defaults. */
export interface SOPLSParams {
    /** Required. */
    n_components_per_block?: number[];
}
/** Native `models.multiblock.so_pls` (regressor). Required fit inputs: blocks. */
export declare class SOPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.multiblock.so_pls";
    readonly paramTypes: {
        readonly n_components_per_block: "int_array";
    };
    constructor(params?: SOPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of CPPLS; unset values take the native defaults. */
export interface CPPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.5. */
    gamma?: number;
}
/** Native `models.pls.cppls` (regressor). */
export declare class CPPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.pls.cppls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly gamma: "double";
    };
    constructor(params?: CPPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of KernelPLS; unset values take the native defaults. */
export interface KernelPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default "rbf". */
    kernel?: "linear" | "rbf" | "polynomial" | "sigmoid";
    /** Default 0. */
    gamma?: number;
    /** Default 1. */
    coef0?: number;
    /** Default 3. */
    degree?: number;
}
/** Native `models.pls.kernel` (regressor). */
export declare class KernelPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.pls.kernel";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly kernel: "enum";
        readonly gamma: "double";
        readonly coef0: "double";
        readonly degree: "int";
    };
    constructor(params?: KernelPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of PCR; unset values take the native defaults. */
export interface PCRParams {
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default false. */
    scale_y?: boolean;
}
/** Native `models.pls.pcr` (transformer, regressor). */
export declare class PCR extends NativeEstimator implements Regressor, Transformer {
    readonly methodId = "models.pls.pcr";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: PCRParams);
    predict(X: Matrix): Matrix;
    transform(X: Matrix): Matrix;
}
/** Parameters of SimplePLS; unset values take the native defaults. */
export interface SimplePLSParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.pls.pls_fit_simple` (transformer, regressor). */
export declare class SimplePLS extends NativeEstimator implements Regressor, Transformer {
    readonly methodId = "models.pls.pls_fit_simple";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    constructor(params?: SimplePLSParams);
    predict(X: Matrix): Matrix;
    transform(X: Matrix): Matrix;
}
/** Parameters of PLSRegression; unset values take the native defaults. */
export interface PLSRegressionParams {
    /** Default 2. */
    n_components?: number;
    /** Default "nipals". */
    solver?: "nipals" | "simpls" | "orthogonal_scores" | "kernel_algorithm" | "wide_kernel" | "svd" | "power" | "randomized_svd";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `models.pls.pls_regression` (transformer, regressor). */
export declare class PLSRegression extends NativeEstimator implements Regressor, Transformer {
    readonly methodId = "models.pls.pls_regression";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly solver: "enum";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: PLSRegressionParams);
    predict(X: Matrix): Matrix;
    transform(X: Matrix): Matrix;
}
/** Parameters of ContinuumRegression; unset values take the native defaults. */
export interface ContinuumRegressionParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.5. */
    tau?: number;
}
/** Native `models.regularized.continuum_regression` (regressor). */
export declare class ContinuumRegression extends NativeEstimator implements Regressor {
    readonly methodId = "models.regularized.continuum_regression";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly tau: "double";
    };
    constructor(params?: ContinuumRegressionParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of Ridge; unset values take the native defaults. */
export interface RidgeParams {
    /** Default 1. */
    alpha?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
}
/** Native `models.regularized.ridge` (regressor). */
export declare class Ridge extends NativeEstimator implements Regressor {
    readonly methodId = "models.regularized.ridge";
    readonly paramTypes: {
        readonly alpha: "double";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
    };
    constructor(params?: RidgeParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of RidgePLS; unset values take the native defaults. */
export interface RidgePLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.1. */
    ridge_lambda?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `models.regularized.ridge_pls` (regressor). */
export declare class RidgePLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.regularized.ridge_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly ridge_lambda: "double";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: RidgePLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of RobustPLS; unset values take the native defaults. */
export interface RobustPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 1.345. */
    huber_k?: number;
    /** Default 5. */
    max_irls_iter?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `models.regularized.robust_pls` (regressor). */
export declare class RobustPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.regularized.robust_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly huber_k: "double";
        readonly max_irls_iter: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: RobustPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of WeightedPLS; unset values take the native defaults. */
export interface WeightedPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `models.regularized.weighted_pls` (regressor). */
export declare class WeightedPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.regularized.weighted_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: WeightedPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of FusedSparsePLS; unset values take the native defaults. */
export interface FusedSparsePLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.05. */
    l1_lambda?: number;
    /** Default 0.05. */
    fusion_lambda?: number;
}
/** Native `models.sparse.fused_sparse_pls` (regressor). */
export declare class FusedSparsePLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.sparse.fused_sparse_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly l1_lambda: "double";
        readonly fusion_lambda: "double";
    };
    constructor(params?: FusedSparsePLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of GroupSparsePLS; unset values take the native defaults. */
export interface GroupSparsePLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.05. */
    group_lambda?: number;
}
/** Native `models.sparse.group_sparse_pls` (regressor). Required fit inputs: feature_groups. */
export declare class GroupSparsePLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.sparse.group_sparse_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly group_lambda: "double";
    };
    constructor(params?: GroupSparsePLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of SparsePLSDA; unset values take the native defaults. */
export interface SparsePLSDAParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.05. */
    sparsity_lambda?: number;
}
/** Native `models.sparse.sparse_pls_da` (classifier). Required fit inputs: labels. */
export declare class SparsePLSDA extends NativeEstimator implements Classifier {
    readonly methodId = "models.sparse.sparse_pls_da";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly sparsity_lambda: "double";
    };
    protected readonly labelTarget = true;
    constructor(params?: SparsePLSDAParams);
    decisionFunction(X: Matrix): Matrix;
    predictLabels(X: Matrix): number[];
    classes(): number[];
}
/** Parameters of SparseSIMPLS; unset values take the native defaults. */
export interface SparseSIMPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.05. */
    sparsity_lambda?: number;
}
/** Native `models.sparse.sparse_simpls` (regressor). */
export declare class SparseSIMPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.sparse.sparse_simpls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly sparsity_lambda: "double";
    };
    constructor(params?: SparseSIMPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of ECR; unset values take the native defaults. */
export interface ECRParams {
    /** Default 2. */
    n_components?: number;
    /** Default 0.5. */
    alpha?: number;
}
/** Native `models.specialized.ecr` (regressor). */
export declare class ECR extends NativeEstimator implements Regressor {
    readonly methodId = "models.specialized.ecr";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly alpha: "double";
    };
    constructor(params?: ECRParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of GPRPLS; unset values take the native defaults. */
export interface GPRPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 1. */
    length_scale?: number;
    /** Default 0.001. */
    noise_level?: number;
}
/** Native `models.specialized.gpr_pls` (regressor). */
export declare class GPRPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.specialized.gpr_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly length_scale: "double";
        readonly noise_level: "double";
    };
    constructor(params?: GPRPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of MissingAwareNIPALS; unset values take the native defaults. */
export interface MissingAwareNIPALSParams {
    /** Default 2. */
    n_components?: number;
}
/** Native `models.specialized.missing_aware_nipals` (regressor). */
export declare class MissingAwareNIPALS extends NativeEstimator implements Regressor {
    readonly methodId = "models.specialized.missing_aware_nipals";
    readonly paramTypes: {
        readonly n_components: "int";
    };
    constructor(params?: MissingAwareNIPALSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of RecursivePLS; unset values take the native defaults. */
export interface RecursivePLSParams {
    /** Default 2. */
    n_components?: number;
    /** Required. */
    window_size?: number;
}
/** Native `models.specialized.recursive` (transformer, regressor). */
export declare class RecursivePLS extends NativeEstimator implements Regressor, Transformer {
    readonly methodId = "models.specialized.recursive";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly window_size: "int";
    };
    constructor(params?: RecursivePLSParams);
    predict(X: Matrix): Matrix;
    transform(X: Matrix): Matrix;
}
/** Parameters of NPLS; unset values take the native defaults. */
export interface NPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Required. */
    mode_j?: number;
    /** Required. */
    mode_k?: number;
}
/** Native `models.specialized.tensor_pls` (regressor). */
export declare class NPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.specialized.tensor_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly mode_j: "int";
        readonly mode_k: "int";
    };
    constructor(params?: NPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of DIPLS; unset values take the native defaults. */
export interface DIPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 1. */
    di_lambda?: number;
}
/** Native `models.transfer.di_pls` (regressor). Required fit inputs: target_domain. */
export declare class DIPLS extends NativeEstimator implements Regressor {
    readonly methodId = "models.transfer.di_pls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly di_lambda: "double";
    };
    constructor(params?: DIPLSParams);
    predict(X: Matrix): Matrix;
}
/** Parameters of DS; unset values take the native defaults. */
export interface DSParams {
}
/** Native `models.transfer.ds` (transformer). Required fit inputs: target_domain. */
export declare class DS extends NativeEstimator implements Transformer {
    readonly methodId = "models.transfer.ds";
    readonly paramTypes: {};
    constructor(params?: DSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of PDS; unset values take the native defaults. */
export interface PDSParams {
    /** Default 2. */
    window_half_width?: number;
}
/** Native `models.transfer.pds` (transformer). Required fit inputs: target_domain. */
export declare class PDS extends NativeEstimator implements Transformer {
    readonly methodId = "models.transfer.pds";
    readonly paramTypes: {
        readonly window_half_width: "int";
    };
    constructor(params?: PDSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of CorrelationOptimizedWarping; unset values take the native defaults. */
export interface CorrelationOptimizedWarpingParams {
    /** Default []. */
    reference?: number[];
    /** Default 32. */
    interval_size?: number;
    /** Default 5. */
    max_shift?: number;
}
/** Native `preprocessing.alignment.cow_align` (transformer). */
export declare class CorrelationOptimizedWarping extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.alignment.cow_align";
    readonly paramTypes: {
        readonly reference: "double_array";
        readonly interval_size: "int";
        readonly max_shift: "int";
    };
    constructor(params?: CorrelationOptimizedWarpingParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of DynamicTimeWarpingAlignment; unset values take the native defaults. */
export interface DynamicTimeWarpingAlignmentParams {
    /** Default []. */
    reference?: number[];
}
/** Native `preprocessing.alignment.dtw_align` (transformer). */
export declare class DynamicTimeWarpingAlignment extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.alignment.dtw_align";
    readonly paramTypes: {
        readonly reference: "double_array";
    };
    constructor(params?: DynamicTimeWarpingAlignmentParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of IcoshiftAlignment; unset values take the native defaults. */
export interface IcoshiftAlignmentParams {
    /** Default []. */
    reference?: number[];
    /** Default 32. */
    interval_size?: number;
    /** Default 5. */
    max_shift?: number;
}
/** Native `preprocessing.alignment.icoshift_align` (transformer). */
export declare class IcoshiftAlignment extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.alignment.icoshift_align";
    readonly paramTypes: {
        readonly reference: "double_array";
        readonly interval_size: "int";
        readonly max_shift: "int";
    };
    constructor(params?: IcoshiftAlignmentParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of CrossCorrelationAlignment; unset values take the native defaults. */
export interface CrossCorrelationAlignmentParams {
    /** Default []. */
    reference?: number[];
    /** Default 5. */
    max_shift?: number;
}
/** Native `preprocessing.alignment.xcorr_align` (transformer). */
export declare class CrossCorrelationAlignment extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.alignment.xcorr_align";
    readonly paramTypes: {
        readonly reference: "double_array";
        readonly max_shift: "int";
    };
    constructor(params?: CrossCorrelationAlignmentParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of AirPLS; unset values take the native defaults. */
export interface AirPLSParams {
    /** Default 1000000. */
    lam?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.airpls` (transformer). */
export declare class AirPLS extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.airpls";
    readonly paramTypes: {
        readonly lam: "double";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: AirPLSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ArPLS; unset values take the native defaults. */
export interface ArPLSParams {
    /** Default 100000. */
    lam?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.arpls` (transformer). */
export declare class ArPLS extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.arpls";
    readonly paramTypes: {
        readonly lam: "double";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: ArPLSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of AsLS; unset values take the native defaults. */
export interface AsLSParams {
    /** Default 1000000. */
    lam?: number;
    /** Default 0.01. */
    p?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.asls` (transformer). */
export declare class AsLS extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.asls";
    readonly paramTypes: {
        readonly lam: "double";
        readonly p: "double";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: AsLSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of BEADS; unset values take the native defaults. */
export interface BEADSParams {
    /** Default 100. */
    lam_0?: number;
    /** Default 0.5. */
    lam_1?: number;
    /** Default 0.5. */
    lam_2?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.beads` (transformer). */
export declare class BEADS extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.beads";
    readonly paramTypes: {
        readonly lam_0: "double";
        readonly lam_1: "double";
        readonly lam_2: "double";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: BEADSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Detrend; unset values take the native defaults. */
export interface DetrendParams {
    /** Default 1. */
    polyorder?: number;
}
/** Native `preprocessing.baselines.detrend` (transformer). */
export declare class Detrend extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.detrend";
    readonly paramTypes: {
        readonly polyorder: "int";
    };
    constructor(params?: DetrendParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of IAsLS; unset values take the native defaults. */
export interface IAsLSParams {
    /** Default 1000000. */
    lam?: number;
    /** Default 0.01. */
    p?: number;
    /** Default 0.0001. */
    lam_1?: number;
    /** Default 2. */
    polyorder?: number;
    /** Default 2. */
    diff_order?: number;
    /** Default 50. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.iasls` (transformer). */
export declare class IAsLS extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.iasls";
    readonly paramTypes: {
        readonly lam: "double";
        readonly p: "double";
        readonly lam_1: "double";
        readonly polyorder: "int";
        readonly diff_order: "int";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: IAsLSParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of IModPoly; unset values take the native defaults. */
export interface IModPolyParams {
    /** Default 2. */
    polyorder?: number;
    /** Default 250. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.imodpoly` (transformer). */
export declare class IModPoly extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.imodpoly";
    readonly paramTypes: {
        readonly polyorder: "int";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: IModPolyParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ModPoly; unset values take the native defaults. */
export interface ModPolyParams {
    /** Default 2. */
    polyorder?: number;
    /** Default 250. */
    max_iter?: number;
    /** Default 0.001. */
    tol?: number;
}
/** Native `preprocessing.baselines.modpoly` (transformer). */
export declare class ModPoly extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.modpoly";
    readonly paramTypes: {
        readonly polyorder: "int";
        readonly max_iter: "int";
        readonly tol: "double";
    };
    constructor(params?: ModPolyParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of RollingBall; unset values take the native defaults. */
export interface RollingBallParams {
    /** Default 20. */
    half_window?: number;
    /** Default 0. */
    smooth_half_window?: number;
}
/** Native `preprocessing.baselines.rolling_ball` (transformer). */
export declare class RollingBall extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.rolling_ball";
    readonly paramTypes: {
        readonly half_window: "int";
        readonly smooth_half_window: "int";
    };
    constructor(params?: RollingBallParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ScoreAugmentedProjectionStandardization; unset values take the native defaults. */
export interface ScoreAugmentedProjectionStandardizationParams {
    /** Default 5. */
    n_components?: number;
    /** Default 1. */
    score_weight?: number;
    /** Default true. */
    fit_intercept?: boolean;
    /** Default 0. */
    ridge?: number;
}
/** Native `preprocessing.baselines.saps` (transformer). Required fit inputs: target_domain. */
export declare class ScoreAugmentedProjectionStandardization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.saps";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly score_weight: "double";
        readonly fit_intercept: "bool";
        readonly ridge: "double";
    };
    constructor(params?: ScoreAugmentedProjectionStandardizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SNIP; unset values take the native defaults. */
export interface SNIPParams {
    /** Default 20. */
    max_half_window?: number;
}
/** Native `preprocessing.baselines.snip` (transformer). */
export declare class SNIP extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.baselines.snip";
    readonly paramTypes: {
        readonly max_half_window: "int";
    };
    constructor(params?: SNIPParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Derivate; unset values take the native defaults. */
export interface DerivateParams {
    /** Default 1. */
    order?: number;
    /** Default 1. */
    delta?: number;
}
/** Native `preprocessing.derivatives.derivate` (transformer). */
export declare class Derivate extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.derivatives.derivate";
    readonly paramTypes: {
        readonly order: "int";
        readonly delta: "double";
    };
    constructor(params?: DerivateParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FirstDerivative; unset values take the native defaults. */
export interface FirstDerivativeParams {
    /** Default 1. */
    delta?: number;
    /** Default 2. */
    edge_order?: number;
}
/** Native `preprocessing.derivatives.first_derivative` (transformer). */
export declare class FirstDerivative extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.derivatives.first_derivative";
    readonly paramTypes: {
        readonly delta: "double";
        readonly edge_order: "int";
    };
    constructor(params?: FirstDerivativeParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of NorrisWilliams; unset values take the native defaults. */
export interface NorrisWilliamsParams {
    /** Default 5. */
    segment?: number;
    /** Default 5. */
    gap?: number;
    /** Default 1. */
    derivative_order?: number;
    /** Default 1. */
    delta?: number;
}
/** Native `preprocessing.derivatives.norris_williams` (transformer). */
export declare class NorrisWilliams extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.derivatives.norris_williams";
    readonly paramTypes: {
        readonly segment: "int";
        readonly gap: "int";
        readonly derivative_order: "int";
        readonly delta: "double";
    };
    constructor(params?: NorrisWilliamsParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SavitzkyGolay; unset values take the native defaults. */
export interface SavitzkyGolayParams {
    /** Default 5. */
    window_length?: number;
    /** Default 2. */
    polyorder?: number;
    /** Default 0. */
    deriv?: number;
    /** Default 1. */
    delta?: number;
    /** Default "mirror". */
    mode?: "mirror" | "constant" | "nearest" | "wrap" | "interp";
    /** Default 0. */
    cval?: number;
}
/** Native `preprocessing.derivatives.savitzky_golay` (transformer). */
export declare class SavitzkyGolay extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.derivatives.savitzky_golay";
    readonly paramTypes: {
        readonly window_length: "int";
        readonly polyorder: "int";
        readonly deriv: "int";
        readonly delta: "double";
        readonly mode: "enum";
        readonly cval: "double";
    };
    constructor(params?: SavitzkyGolayParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SecondDerivative; unset values take the native defaults. */
export interface SecondDerivativeParams {
    /** Default 1. */
    delta?: number;
    /** Default 2. */
    edge_order?: number;
}
/** Native `preprocessing.derivatives.second_derivative` (transformer). */
export declare class SecondDerivative extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.derivatives.second_derivative";
    readonly paramTypes: {
        readonly delta: "double";
        readonly edge_order: "int";
    };
    constructor(params?: SecondDerivativeParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FlexiblePCA; unset values take the native defaults. */
export interface FlexiblePCAParams {
    /** Default 5. */
    n_components?: number;
}
/** Native `preprocessing.feature_selection.flexible_pca` (transformer). */
export declare class FlexiblePCA extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.feature_selection.flexible_pca";
    readonly paramTypes: {
        readonly n_components: "double";
    };
    constructor(params?: FlexiblePCAParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FlexibleSVD; unset values take the native defaults. */
export interface FlexibleSVDParams {
    /** Default 5. */
    n_components?: number;
}
/** Native `preprocessing.feature_selection.flexible_svd` (transformer). */
export declare class FlexibleSVD extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.feature_selection.flexible_svd";
    readonly paramTypes: {
        readonly n_components: "double";
    };
    constructor(params?: FlexibleSVDParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of EPO; unset values take the native defaults. */
export interface EPOParams {
    /** Default true. */
    scale?: boolean;
}
/** Native `preprocessing.orthogonalization.epo` (transformer). */
export declare class EPO extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.orthogonalization.epo";
    readonly paramTypes: {
        readonly scale: "bool";
    };
    constructor(params?: EPOParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of OSC; unset values take the native defaults. */
export interface OSCParams {
    /** Default 1. */
    n_components?: number;
    /** Default true. */
    scale?: boolean;
}
/** Native `preprocessing.orthogonalization.osc` (transformer). */
export declare class OSC extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.orthogonalization.osc";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly scale: "bool";
    };
    constructor(params?: OSCParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of CropTransformer; unset values take the native defaults. */
export interface CropTransformerParams {
    /** Required. */
    start?: number;
    /** Required. */
    end?: number;
}
/** Native `preprocessing.resampling.crop` (transformer). */
export declare class CropTransformer extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.resampling.crop";
    readonly paramTypes: {
        readonly start: "int";
        readonly end: "int";
    };
    constructor(params?: CropTransformerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of IntegerKBinsDiscretizer; unset values take the native defaults. */
export interface IntegerKBinsDiscretizerParams {
    /** Default 5. */
    n_bins?: number;
    /** Default "uniform". */
    strategy?: "uniform" | "quantile";
}
/** Native `preprocessing.resampling.kbins_discretizer` (transformer). */
export declare class IntegerKBinsDiscretizer extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.resampling.kbins_discretizer";
    readonly paramTypes: {
        readonly n_bins: "int";
        readonly strategy: "enum";
    };
    constructor(params?: IntegerKBinsDiscretizerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of RangeDiscretizer; unset values take the native defaults. */
export interface RangeDiscretizerParams {
    /** Required. */
    edges?: number[];
}
/** Native `preprocessing.resampling.range_discretizer` (transformer). */
export declare class RangeDiscretizer extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.resampling.range_discretizer";
    readonly paramTypes: {
        readonly edges: "double_array";
    };
    constructor(params?: RangeDiscretizerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ResampleTransformer; unset values take the native defaults. */
export interface ResampleTransformerParams {
    /** Required. */
    num_samples?: number;
}
/** Native `preprocessing.resampling.resample_transformer` (transformer). */
export declare class ResampleTransformer extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.resampling.resample_transformer";
    readonly paramTypes: {
        readonly num_samples: "int";
    };
    constructor(params?: ResampleTransformerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Resampler; unset values take the native defaults. */
export interface ResamplerParams {
    /** Default []. */
    target_wavelengths?: number[];
    /** Default "linear". */
    method?: "linear" | "nearest" | "cubic";
    /** Default 0. */
    crop_min?: number;
    /** Default 0. */
    crop_max?: number;
    /** Default false. */
    use_crop?: boolean;
    /** Default 0. */
    fill_value?: number;
    /** Default false. */
    bounds_error?: boolean;
    /** Default false. */
    extrapolate?: boolean;
    /** Default 0. */
    tgt_min?: number;
    /** Default 1. */
    tgt_step?: number;
    /** Default 0. */
    tgt_n?: number;
}
/** Native `preprocessing.resampling.resampler` (transformer). Required fit inputs: axis. */
export declare class Resampler extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.resampling.resampler";
    readonly paramTypes: {
        readonly target_wavelengths: "double_array";
        readonly method: "enum";
        readonly crop_min: "double";
        readonly crop_max: "double";
        readonly use_crop: "bool";
        readonly fill_value: "double";
        readonly bounds_error: "bool";
        readonly extrapolate: "bool";
        readonly tgt_min: "double";
        readonly tgt_step: "double";
        readonly tgt_n: "int";
    };
    constructor(params?: ResamplerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of BaselineCenter; unset values take the native defaults. */
export interface BaselineCenterParams {
}
/** Native `preprocessing.scaling.baseline` (transformer). */
export declare class BaselineCenter extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scaling.baseline";
    readonly paramTypes: {};
    constructor(params?: BaselineCenterParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of LogTransform; unset values take the native defaults. */
export interface LogTransformParams {
    /** Default 0. */
    base?: number;
    /** Default 0. */
    offset?: number;
    /** Default true. */
    auto_offset?: boolean;
    /** Default 1e-08. */
    min_value?: number;
}
/** Native `preprocessing.scaling.log_transform` (transformer). */
export declare class LogTransform extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scaling.log_transform";
    readonly paramTypes: {
        readonly base: "double";
        readonly offset: "double";
        readonly auto_offset: "bool";
        readonly min_value: "double";
    };
    constructor(params?: LogTransformParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Normalize; unset values take the native defaults. */
export interface NormalizeParams {
    /** Default -1. */
    feature_min?: number;
    /** Default 1. */
    feature_max?: number;
}
/** Native `preprocessing.scaling.normalize` (transformer). */
export declare class Normalize extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scaling.normalize";
    readonly paramTypes: {
        readonly feature_min: "double";
        readonly feature_max: "double";
    };
    constructor(params?: NormalizeParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SimpleScale; unset values take the native defaults. */
export interface SimpleScaleParams {
}
/** Native `preprocessing.scaling.simple_scale` (transformer). */
export declare class SimpleScale extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scaling.simple_scale";
    readonly paramTypes: {};
    constructor(params?: SimpleScaleParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of AreaNormalization; unset values take the native defaults. */
export interface AreaNormalizationParams {
    /** Default "sum". */
    method?: "sum" | "abs_sum" | "trapz";
}
/** Native `preprocessing.scatter.area_normalization` (transformer). */
export declare class AreaNormalization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.area_normalization";
    readonly paramTypes: {
        readonly method: "enum";
    };
    constructor(params?: AreaNormalizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of EMSC; unset values take the native defaults. */
export interface EMSCParams {
    /** Default 2. */
    degree?: number;
}
/** Native `preprocessing.scatter.emsc` (transformer). */
export declare class EMSC extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.emsc";
    readonly paramTypes: {
        readonly degree: "int";
    };
    constructor(params?: EMSCParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of LocalCentering; unset values take the native defaults. */
export interface LocalCenteringParams {
}
/** Native `preprocessing.scatter.local_centering` (transformer). Required fit inputs: target_domain. */
export declare class LocalCentering extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.local_centering";
    readonly paramTypes: {};
    constructor(params?: LocalCenteringParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of LSNV; unset values take the native defaults. */
export interface LSNVParams {
    /** Default 11. */
    window?: number;
    /** Default "reflect". */
    pad_mode?: "reflect" | "edge" | "constant";
    /** Default 0. */
    constant_value?: number;
}
/** Native `preprocessing.scatter.local_snv` (transformer). */
export declare class LSNV extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.local_snv";
    readonly paramTypes: {
        readonly window: "int";
        readonly pad_mode: "enum";
        readonly constant_value: "double";
    };
    constructor(params?: LSNVParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of LocalizedMSC; unset values take the native defaults. */
export interface LocalizedMSCParams {
    /** Default 32. */
    window_size?: number;
    /** Default []. */
    reference?: number[];
    /** Default 1e-12. */
    eps?: number;
}
/** Native `preprocessing.scatter.localized_msc` (transformer). */
export declare class LocalizedMSC extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.localized_msc";
    readonly paramTypes: {
        readonly window_size: "int";
        readonly reference: "double_array";
        readonly eps: "double";
    };
    constructor(params?: LocalizedMSCParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of MSC; unset values take the native defaults. */
export interface MSCParams {
}
/** Native `preprocessing.scatter.msc` (transformer). */
export declare class MSC extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.msc";
    readonly paramTypes: {};
    constructor(params?: MSCParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of PiecewiseMSC; unset values take the native defaults. */
export interface PiecewiseMSCParams {
    /** Default 32. */
    window_size?: number;
    /** Default []. */
    reference?: number[];
    /** Default 1e-12. */
    eps?: number;
}
/** Native `preprocessing.scatter.piecewise_msc` (transformer). */
export declare class PiecewiseMSC extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.piecewise_msc";
    readonly paramTypes: {
        readonly window_size: "int";
        readonly reference: "double_array";
        readonly eps: "double";
    };
    constructor(params?: PiecewiseMSCParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of PiecewiseSNV; unset values take the native defaults. */
export interface PiecewiseSNVParams {
    /** Default 32. */
    window_size?: number;
    /** Default 0. */
    ddof?: number;
    /** Default 1e-12. */
    eps?: number;
}
/** Native `preprocessing.scatter.piecewise_snv` (transformer). */
export declare class PiecewiseSNV extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.piecewise_snv";
    readonly paramTypes: {
        readonly window_size: "int";
        readonly ddof: "int";
        readonly eps: "double";
    };
    constructor(params?: PiecewiseSNVParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of RNV; unset values take the native defaults. */
export interface RNVParams {
    /** Default true. */
    with_center?: boolean;
    /** Default true. */
    with_scale?: boolean;
    /** Default 1.4826. */
    k?: number;
}
/** Native `preprocessing.scatter.robust_snv` (transformer). */
export declare class RNV extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.robust_snv";
    readonly paramTypes: {
        readonly with_center: "bool";
        readonly with_scale: "bool";
        readonly k: "double";
    };
    constructor(params?: RNVParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SNV; unset values take the native defaults. */
export interface SNVParams {
    /** Default true. */
    with_mean?: boolean;
    /** Default true. */
    with_std?: boolean;
    /** Default 0. */
    ddof?: number;
}
/** Native `preprocessing.scatter.snv` (transformer). */
export declare class SNV extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.snv";
    readonly paramTypes: {
        readonly with_mean: "bool";
        readonly with_std: "bool";
        readonly ddof: "int";
    };
    constructor(params?: SNVParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of VariableSortingNormalization; unset values take the native defaults. */
export interface VariableSortingNormalizationParams {
    /** Default 1e-12. */
    eps?: number;
}
/** Native `preprocessing.scatter.vsn` (transformer). */
export declare class VariableSortingNormalization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.vsn";
    readonly paramTypes: {
        readonly eps: "double";
    };
    constructor(params?: VariableSortingNormalizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of WeightedSNV; unset values take the native defaults. */
export interface WeightedSNVParams {
    /** Default []. */
    weights?: number[];
    /** Default 0. */
    ddof?: number;
    /** Default 1e-12. */
    eps?: number;
}
/** Native `preprocessing.scatter.weighted_snv` (transformer). */
export declare class WeightedSNV extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.scatter.weighted_snv";
    readonly paramTypes: {
        readonly weights: "double_array";
        readonly ddof: "int";
        readonly eps: "double";
    };
    constructor(params?: WeightedSNVParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FractionToPercent; unset values take the native defaults. */
export interface FractionToPercentParams {
}
/** Native `preprocessing.signal_conversion.fraction_to_percent` (transformer). */
export declare class FractionToPercent extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.signal_conversion.fraction_to_percent";
    readonly paramTypes: {};
    constructor(params?: FractionToPercentParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FromAbsorbance; unset values take the native defaults. */
export interface FromAbsorbanceParams {
    /** Default false. */
    is_percent?: boolean;
}
/** Native `preprocessing.signal_conversion.from_absorbance` (transformer). */
export declare class FromAbsorbance extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.signal_conversion.from_absorbance";
    readonly paramTypes: {
        readonly is_percent: "bool";
    };
    constructor(params?: FromAbsorbanceParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of KubelkaMunk; unset values take the native defaults. */
export interface KubelkaMunkParams {
    /** Default false. */
    is_percent?: boolean;
    /** Default 1e-10. */
    epsilon?: number;
}
/** Native `preprocessing.signal_conversion.kubelka_munk` (transformer). */
export declare class KubelkaMunk extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.signal_conversion.kubelka_munk";
    readonly paramTypes: {
        readonly is_percent: "bool";
        readonly epsilon: "double";
    };
    constructor(params?: KubelkaMunkParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of PercentToFraction; unset values take the native defaults. */
export interface PercentToFractionParams {
}
/** Native `preprocessing.signal_conversion.percent_to_fraction` (transformer). */
export declare class PercentToFraction extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.signal_conversion.percent_to_fraction";
    readonly paramTypes: {};
    constructor(params?: PercentToFractionParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of ToAbsorbance; unset values take the native defaults. */
export interface ToAbsorbanceParams {
    /** Default false. */
    is_percent?: boolean;
    /** Default 1e-10. */
    epsilon?: number;
    /** Default true. */
    clip_negative?: boolean;
}
/** Native `preprocessing.signal_conversion.to_absorbance` (transformer). */
export declare class ToAbsorbance extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.signal_conversion.to_absorbance";
    readonly paramTypes: {
        readonly is_percent: "bool";
        readonly epsilon: "double";
        readonly clip_negative: "bool";
    };
    constructor(params?: ToAbsorbanceParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Gaussian; unset values take the native defaults. */
export interface GaussianParams {
    /** Default 1. */
    sigma?: number;
    /** Default 0. */
    order?: number;
    /** Default "reflect". */
    mode?: "reflect" | "constant" | "nearest" | "mirror" | "wrap";
    /** Default 0. */
    cval?: number;
    /** Default 4. */
    truncate?: number;
}
/** Native `preprocessing.smoothing.gaussian` (transformer). */
export declare class Gaussian extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.smoothing.gaussian";
    readonly paramTypes: {
        readonly sigma: "double";
        readonly order: "int";
        readonly mode: "enum";
        readonly cval: "double";
        readonly truncate: "double";
    };
    constructor(params?: GaussianParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of FCKStaticTransformer; unset values take the native defaults. */
export interface FCKStaticTransformerParams {
    /** Required. */
    kernel_size?: number;
    /** Required. */
    alphas?: number[];
    /** Required. */
    sigmas?: number[];
}
/** Native `preprocessing.specialized.fck_static` (transformer). */
export declare class FCKStaticTransformer extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.specialized.fck_static";
    readonly paramTypes: {
        readonly kernel_size: "int";
        readonly alphas: "double_array";
        readonly sigmas: "double_array";
    };
    constructor(params?: FCKStaticTransformerParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of DirectStandardization; unset values take the native defaults. */
export interface DirectStandardizationParams {
    /** Default true. */
    fit_intercept?: boolean;
    /** Default 0. */
    ridge?: number;
}
/** Native `preprocessing.transfer.direct_standardization` (transformer). Required fit inputs: target_domain. */
export declare class DirectStandardization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.transfer.direct_standardization";
    readonly paramTypes: {
        readonly fit_intercept: "bool";
        readonly ridge: "double";
    };
    constructor(params?: DirectStandardizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of PiecewiseDirectStandardization; unset values take the native defaults. */
export interface PiecewiseDirectStandardizationParams {
    /** Default 5. */
    window_size?: number;
    /** Default true. */
    fit_intercept?: boolean;
    /** Default 0. */
    ridge?: number;
}
/** Native `preprocessing.transfer.piecewise_direct_standardization` (transformer). Required fit inputs: target_domain. */
export declare class PiecewiseDirectStandardization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.transfer.piecewise_direct_standardization";
    readonly paramTypes: {
        readonly window_size: "int";
        readonly fit_intercept: "bool";
        readonly ridge: "double";
    };
    constructor(params?: PiecewiseDirectStandardizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of RobustDirectStandardization; unset values take the native defaults. */
export interface RobustDirectStandardizationParams {
    /** Default true. */
    fit_intercept?: boolean;
    /** Default 0. */
    ridge?: number;
    /** Default 0.9. */
    trim_quantile?: number;
    /** Default 3. */
    max_iter?: number;
}
/** Native `preprocessing.transfer.robust_direct_standardization` (transformer). Required fit inputs: target_domain. */
export declare class RobustDirectStandardization extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.transfer.robust_direct_standardization";
    readonly paramTypes: {
        readonly fit_intercept: "bool";
        readonly ridge: "double";
        readonly trim_quantile: "double";
        readonly max_iter: "int";
    };
    constructor(params?: RobustDirectStandardizationParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of SlopeBiasCorrection; unset values take the native defaults. */
export interface SlopeBiasCorrectionParams {
}
/** Native `preprocessing.transfer.slope_bias` (transformer). */
export declare class SlopeBiasCorrection extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.transfer.slope_bias";
    readonly paramTypes: {};
    constructor(params?: SlopeBiasCorrectionParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Haar; unset values take the native defaults. */
export interface HaarParams {
}
/** Native `preprocessing.wavelets.haar` (transformer). */
export declare class Haar extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.haar";
    readonly paramTypes: {};
    constructor(params?: HaarParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of Wavelet; unset values take the native defaults. */
export interface WaveletParams {
    /** Default "haar". */
    family?: "haar" | "db4" | "sym4" | "coif1";
    /** Default "periodization". */
    mode?: "periodization" | "symmetric" | "zero";
}
/** Native `preprocessing.wavelets.wavelet` (transformer). */
export declare class Wavelet extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.wavelet";
    readonly paramTypes: {
        readonly family: "enum";
        readonly mode: "enum";
    };
    constructor(params?: WaveletParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of WaveletDenoise; unset values take the native defaults. */
export interface WaveletDenoiseParams {
    /** Default "db4". */
    family?: "haar" | "db4" | "sym4" | "coif1";
    /** Default "periodization". */
    mode?: "periodization" | "symmetric" | "zero";
    /** Default 3. */
    level?: number;
    /** Default "soft". */
    threshold_mode?: "soft" | "hard";
    /** Default "median". */
    noise_estimator?: "median" | "std";
}
/** Native `preprocessing.wavelets.wavelet_denoise` (transformer). */
export declare class WaveletDenoise extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.wavelet_denoise";
    readonly paramTypes: {
        readonly family: "enum";
        readonly mode: "enum";
        readonly level: "int";
        readonly threshold_mode: "enum";
        readonly noise_estimator: "enum";
    };
    constructor(params?: WaveletDenoiseParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of WaveletFeatures; unset values take the native defaults. */
export interface WaveletFeaturesParams {
    /** Default "haar". */
    family?: "haar" | "db4" | "sym4" | "coif1";
    /** Default "periodization". */
    mode?: "periodization" | "symmetric" | "zero";
    /** Default 3. */
    max_level?: number;
    /** Default "energy". */
    entropy?: "energy" | "histogram";
}
/** Native `preprocessing.wavelets.wavelet_features` (transformer). */
export declare class WaveletFeatures extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.wavelet_features";
    readonly paramTypes: {
        readonly family: "enum";
        readonly mode: "enum";
        readonly max_level: "int";
        readonly entropy: "enum";
    };
    constructor(params?: WaveletFeaturesParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of WaveletPCA; unset values take the native defaults. */
export interface WaveletPCAParams {
    /** Default "haar". */
    family?: "haar" | "db4" | "sym4" | "coif1";
    /** Default "periodization". */
    mode?: "periodization" | "symmetric" | "zero";
    /** Default 2. */
    max_level?: number;
    /** Default 5. */
    n_components?: number;
}
/** Native `preprocessing.wavelets.wavelet_pca` (transformer). */
export declare class WaveletPCA extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.wavelet_pca";
    readonly paramTypes: {
        readonly family: "enum";
        readonly mode: "enum";
        readonly max_level: "int";
        readonly n_components: "double";
    };
    constructor(params?: WaveletPCAParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of WaveletSVD; unset values take the native defaults. */
export interface WaveletSVDParams {
    /** Default "haar". */
    family?: "haar" | "db4" | "sym4" | "coif1";
    /** Default "periodization". */
    mode?: "periodization" | "symmetric" | "zero";
    /** Default 2. */
    max_level?: number;
    /** Default 5. */
    n_components?: number;
}
/** Native `preprocessing.wavelets.wavelet_svd` (transformer). */
export declare class WaveletSVD extends NativeEstimator implements Transformer {
    readonly methodId = "preprocessing.wavelets.wavelet_svd";
    readonly paramTypes: {
        readonly family: "enum";
        readonly mode: "enum";
        readonly max_level: "int";
        readonly n_components: "double";
    };
    constructor(params?: WaveletSVDParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of BiPLS; unset values take the native defaults. */
export interface BiPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    interval_width?: number;
    /** Default 2. */
    min_intervals?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.bipls` (selector). */
export declare class BiPLS extends NativeEstimator implements Selector {
    readonly methodId = "selection.bipls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly interval_width: "int";
        readonly min_intervals: "int";
        readonly cv: "int";
    };
    constructor(params?: BiPLSParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of BVE; unset values take the native defaults. */
export interface BVEParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    n_steps?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.bve` (selector). */
export declare class BVE extends NativeEstimator implements Selector {
    readonly methodId = "selection.bve";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_steps: "int";
        readonly min_features: "int";
        readonly cv: "int";
    };
    constructor(params?: BVEParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of CARS; unset values take the native defaults. */
export interface CARSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    n_iterations?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.cars` (selector). */
export declare class CARS extends NativeEstimator implements Selector {
    readonly methodId = "selection.cars";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly min_features: "int";
        readonly cv: "int";
    };
    constructor(params?: CARSParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of EMCUVE; unset values take the native defaults. */
export interface EMCUVEParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    noise_features?: number;
    /** Default 0. */
    noise_seed?: number;
    /** Default 10. */
    n_ensembles?: number;
    /** Default 0.5. */
    vote_threshold?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.emcuve` (selector). */
export declare class EMCUVE extends NativeEstimator implements Selector {
    readonly methodId = "selection.emcuve";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly noise_features: "int";
        readonly noise_seed: "int";
        readonly n_ensembles: "int";
        readonly vote_threshold: "double";
        readonly cv: "int";
    };
    constructor(params?: EMCUVEParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of GA; unset values take the native defaults. */
export interface GAParams {
    /** Default 2. */
    n_components?: number;
    /** Default 30. */
    n_generations?: number;
    /** Default 40. */
    population_size?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 0. */
    max_features?: number;
    /** Default 0.05. */
    mutation_rate?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.ga` (selector). */
export declare class GA extends NativeEstimator implements Selector {
    readonly methodId = "selection.ga";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_generations: "int";
        readonly population_size: "int";
        readonly min_features: "int";
        readonly max_features: "int";
        readonly mutation_rate: "double";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: GAParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of IntervalGenerator; unset values take the native defaults. */
export interface IntervalGeneratorParams {
    /** Default 32. */
    interval_size?: number;
    /** Default 0. */
    step?: number;
}
/** Native `selection.interval` (transformer). */
export declare class IntervalGenerator extends NativeEstimator implements Transformer {
    readonly methodId = "selection.interval";
    readonly paramTypes: {
        readonly interval_size: "int";
        readonly step: "int";
    };
    constructor(params?: IntervalGeneratorParams);
    transform(X: Matrix): Matrix;
}
/** Parameters of IPW; unset values take the native defaults. */
export interface IPWParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default 20. */
    n_iterations?: number;
    /** Default 0.5. */
    damping?: number;
    /** Default 1e-06. */
    weight_floor?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.ipw` (selector). */
export declare class IPW extends NativeEstimator implements Selector {
    readonly methodId = "selection.ipw";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly damping: "double";
        readonly weight_floor: "double";
        readonly cv: "int";
    };
    constructor(params?: IPWParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of IRF; unset values take the native defaults. */
export interface IRFParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default 100. */
    n_iterations?: number;
    /** Default 5. */
    window_size?: number;
    /** Default 5. */
    initial_intervals?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.irf` (selector). */
export declare class IRF extends NativeEstimator implements Selector {
    readonly methodId = "selection.irf";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly window_size: "int";
        readonly initial_intervals: "int";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: IRFParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of IRIV; unset values take the native defaults. */
export interface IRIVParams {
    /** Default 2. */
    n_components?: number;
    /** Default 5. */
    max_rounds?: number;
    /** Default 5. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.iriv` (selector). */
export declare class IRIV extends NativeEstimator implements Selector {
    readonly methodId = "selection.iriv";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly max_rounds: "int";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: IRIVParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of PSO; unset values take the native defaults. */
export interface PSOParams {
    /** Default 2. */
    n_components?: number;
    /** Default 30. */
    n_swarm?: number;
    /** Default 50. */
    n_iterations?: number;
    /** Default 0.729. */
    w?: number;
    /** Default 1.494. */
    c1?: number;
    /** Default 1.494. */
    c2?: number;
    /** Default 4. */
    v_max?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.pso` (selector). */
export declare class PSO extends NativeEstimator implements Selector {
    readonly methodId = "selection.pso";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_swarm: "int";
        readonly n_iterations: "int";
        readonly w: "double";
        readonly c1: "double";
        readonly c2: "double";
        readonly v_max: "double";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: PSOParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of RandomFrog; unset values take the native defaults. */
export interface RandomFrogParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default 100. */
    n_iterations?: number;
    /** Default 20. */
    initial_size?: number;
    /** Default 0. */
    min_size?: number;
    /** Default 0. */
    max_size?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.random_frog` (selector). */
export declare class RandomFrog extends NativeEstimator implements Selector {
    readonly methodId = "selection.random_frog";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly initial_size: "int";
        readonly min_size: "int";
        readonly max_size: "int";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: RandomFrogParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of Randomization; unset values take the native defaults. */
export interface RandomizationParams {
    /** Default 2. */
    n_components?: number;
    /** Default 200. */
    n_permutations?: number;
    /** Default 0. */
    randomization_seed?: number;
    /** Default 0.05. */
    alpha?: number;
}
/** Native `selection.randomization` (selector). */
export declare class Randomization extends NativeEstimator implements Selector {
    readonly methodId = "selection.randomization";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_permutations: "int";
        readonly randomization_seed: "int";
        readonly alpha: "double";
    };
    constructor(params?: RandomizationParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of REP; unset values take the native defaults. */
export interface REPParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    n_steps?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 1. */
    remove_count?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.rep` (selector). */
export declare class REP extends NativeEstimator implements Selector {
    readonly methodId = "selection.rep";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_steps: "int";
        readonly min_features: "int";
        readonly remove_count: "int";
        readonly cv: "int";
    };
    constructor(params?: REPParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of SCARS; unset values take the native defaults. */
export interface SCARSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    n_iterations?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 0.8. */
    sample_fraction?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.scars` (selector). */
export declare class SCARS extends NativeEstimator implements Selector {
    readonly methodId = "selection.scars";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly min_features: "int";
        readonly sample_fraction: "double";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: SCARSParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of Shaving; unset values take the native defaults. */
export interface ShavingParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    n_steps?: number;
    /** Default 0. */
    min_features?: number;
    /** Default 0.2. */
    shave_fraction?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.shaving` (selector). */
export declare class Shaving extends NativeEstimator implements Selector {
    readonly methodId = "selection.shaving";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_steps: "int";
        readonly min_features: "int";
        readonly shave_fraction: "double";
        readonly cv: "int";
    };
    constructor(params?: ShavingParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of SiPLS; unset values take the native defaults. */
export interface SiPLSParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    interval_width?: number;
    /** Default 2. */
    combination_size?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.sipls` (selector). */
export declare class SiPLS extends NativeEstimator implements Selector {
    readonly methodId = "selection.sipls";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly interval_width: "int";
        readonly combination_size: "int";
        readonly cv: "int";
    };
    constructor(params?: SiPLSParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of SPA; unset values take the native defaults. */
export interface SPAParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
}
/** Native `selection.spa` (selector). */
export declare class SPA extends NativeEstimator implements Selector {
    readonly methodId = "selection.spa";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
    };
    constructor(params?: SPAParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of ST; unset values take the native defaults. */
export interface STParams {
    /** Required. */
    thresholds?: number[];
    /** Default 2. */
    n_components?: number;
    /** Default 0. */
    min_selected?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.st` (selector). */
export declare class ST extends NativeEstimator implements Selector {
    readonly methodId = "selection.st";
    readonly paramTypes: {
        readonly thresholds: "double_array";
        readonly n_components: "int";
        readonly min_selected: "int";
        readonly cv: "int";
    };
    constructor(params?: STParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of Stability; unset values take the native defaults. */
export interface StabilityParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.stability` (selector). */
export declare class Stability extends NativeEstimator implements Selector {
    readonly methodId = "selection.stability";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly cv: "int";
    };
    constructor(params?: StabilityParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of T2; unset values take the native defaults. */
export interface T2Params {
    /** Required. */
    alpha_thresholds?: number[];
    /** Default 2. */
    n_components?: number;
    /** Default 0. */
    min_selected?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.t2` (selector). */
export declare class T2 extends NativeEstimator implements Selector {
    readonly methodId = "selection.t2";
    readonly paramTypes: {
        readonly alpha_thresholds: "double_array";
        readonly n_components: "int";
        readonly min_selected: "int";
        readonly cv: "int";
    };
    constructor(params?: T2Params);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of UVE; unset values take the native defaults. */
export interface UVEParams {
    /** Default 2. */
    n_components?: number;
    /** Default 50. */
    noise_features?: number;
    /** Default 0. */
    noise_seed?: number;
    /** Default -1. */
    min_features?: number;
    /** Default 3. */
    cv?: number;
}
/** Native `selection.uve` (selector). */
export declare class UVE extends NativeEstimator implements Selector {
    readonly methodId = "selection.uve";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly noise_features: "int";
        readonly noise_seed: "int";
        readonly min_features: "int";
        readonly cv: "int";
    };
    constructor(params?: UVEParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of VariableSelect; unset values take the native defaults. */
export interface VariableSelectParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default "vip". */
    rank_method?: "vip" | "coefficient" | "selectivity_ratio";
}
/** Native `selection.variable_select` (selector). */
export declare class VariableSelect extends NativeEstimator implements Selector {
    readonly methodId = "selection.variable_select";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly rank_method: "enum";
    };
    constructor(params?: VariableSelectParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of VIPSPA; unset values take the native defaults. */
export interface VIPSPAParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default 0.3. */
    vip_threshold?: number;
}
/** Native `selection.vip_spa` (selector). */
export declare class VIPSPA extends NativeEstimator implements Selector {
    readonly methodId = "selection.vip_spa";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly vip_threshold: "double";
    };
    constructor(params?: VIPSPAParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of VISSA; unset values take the native defaults. */
export interface VISSAParams {
    /** Default 2. */
    n_components?: number;
    /** Default 10. */
    n_iterations?: number;
    /** Default 60. */
    n_submodels?: number;
    /** Default 0.1. */
    ratio_kept?: number;
    /** Default 0.5. */
    threshold?: number;
    /** Default 0.05. */
    floor_probability?: number;
    /** Default 3. */
    cv?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `selection.vissa` (selector). */
export declare class VISSA extends NativeEstimator implements Selector {
    readonly methodId = "selection.vissa";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly n_iterations: "int";
        readonly n_submodels: "int";
        readonly ratio_kept: "double";
        readonly threshold: "double";
        readonly floor_probability: "double";
        readonly cv: "int";
        readonly seed: "int";
    };
    constructor(params?: VISSAParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of WVC; unset values take the native defaults. */
export interface WVCParams {
    /** Required. */
    top_k?: number;
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    normalize?: boolean;
}
/** Native `selection.wvc` (selector). */
export declare class WVC extends NativeEstimator implements Selector {
    readonly methodId = "selection.wvc";
    readonly paramTypes: {
        readonly top_k: "int";
        readonly n_components: "int";
        readonly normalize: "bool";
    };
    constructor(params?: WVCParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of WVCThreshold; unset values take the native defaults. */
export interface WVCThresholdParams {
    /** Default 2. */
    n_components?: number;
    /** Default true. */
    normalize?: boolean;
    /** Default 0. */
    score_threshold?: number;
    /** Default 1. */
    threshold_factor?: number;
    /** Default 0. */
    min_selected?: number;
}
/** Native `selection.wvc_threshold` (selector). */
export declare class WVCThreshold extends NativeEstimator implements Selector {
    readonly methodId = "selection.wvc_threshold";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly normalize: "bool";
        readonly score_threshold: "double";
        readonly threshold_factor: "double";
        readonly min_selected: "int";
    };
    constructor(params?: WVCThresholdParams);
    transform(X: Matrix): Matrix;
    selectedIndices(): number[];
}
/** Parameters of BinnedStratifiedGroupKFold; unset values take the native defaults. */
export interface BinnedStratifiedGroupKFoldParams {
    /** Default 5. */
    n_splits?: number;
    /** Default 5. */
    n_bins?: number;
    /** Default "uniform". */
    strategy?: "uniform" | "quantile";
    /** Default true. */
    shuffle?: boolean;
    /** Default 0. */
    seed?: number;
}
/** Native `splitters.binned_strat_group_kfold` (splitter). Required inputs: y, groups. */
export declare class BinnedStratifiedGroupKFold extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.binned_strat_group_kfold";
    readonly paramTypes: {
        readonly n_splits: "int";
        readonly n_bins: "int";
        readonly strategy: "enum";
        readonly shuffle: "bool";
        readonly seed: "int";
    };
    constructor(params?: BinnedStratifiedGroupKFoldParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of KBinsStratified; unset values take the native defaults. */
export interface KBinsStratifiedParams {
    /** Default 0.25. */
    test_size?: number;
    /** Default 0. */
    seed?: number;
    /** Default 5. */
    n_bins?: number;
    /** Default "uniform". */
    strategy?: "uniform" | "quantile";
}
/** Native `splitters.kbins_stratified` (splitter). Required inputs: y. */
export declare class KBinsStratified extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.kbins_stratified";
    readonly paramTypes: {
        readonly test_size: "double";
        readonly seed: "int";
        readonly n_bins: "int";
        readonly strategy: "enum";
    };
    constructor(params?: KBinsStratifiedParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of KennardStone; unset values take the native defaults. */
export interface KennardStoneParams {
    /** Default 0.25. */
    test_size?: number;
}
/** Native `splitters.kennard_stone` (splitter). */
export declare class KennardStone extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.kennard_stone";
    readonly paramTypes: {
        readonly test_size: "double";
    };
    constructor(params?: KennardStoneParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of KMeans; unset values take the native defaults. */
export interface KMeansParams {
    /** Default 0.25. */
    test_size?: number;
    /** Default 0. */
    seed?: number;
    /** Default 100. */
    max_iter?: number;
}
/** Native `splitters.kmeans` (splitter). */
export declare class KMeans extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.kmeans";
    readonly paramTypes: {
        readonly test_size: "double";
        readonly seed: "int";
        readonly max_iter: "int";
    };
    constructor(params?: KMeansParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of SPlitSplitter; unset values take the native defaults. */
export interface SPlitSplitterParams {
    /** Default 0.25. */
    test_size?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `splitters.split_splitter` (splitter). */
export declare class SPlitSplitter extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.split_splitter";
    readonly paramTypes: {
        readonly test_size: "double";
        readonly seed: "int";
    };
    constructor(params?: SPlitSplitterParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of SPXY; unset values take the native defaults. */
export interface SPXYParams {
    /** Default 0.25. */
    test_size?: number;
}
/** Native `splitters.spxy` (splitter). Required inputs: y. */
export declare class SPXY extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.spxy";
    readonly paramTypes: {
        readonly test_size: "double";
    };
    constructor(params?: SPXYParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of SPXYFold; unset values take the native defaults. */
export interface SPXYFoldParams {
    /** Default 5. */
    n_splits?: number;
    /** Default "euclidean". */
    y_metric?: "x_only" | "euclidean" | "hamming";
}
/** Native `splitters.spxy_fold` (splitter). Required inputs: y. */
export declare class SPXYFold extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.spxy_fold";
    readonly paramTypes: {
        readonly n_splits: "int";
        readonly y_metric: "enum";
    };
    constructor(params?: SPXYFoldParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of SPXYGroupFold; unset values take the native defaults. */
export interface SPXYGroupFoldParams {
    /** Default 5. */
    n_splits?: number;
    /** Default "euclidean". */
    y_metric?: "x_only" | "euclidean" | "hamming";
    /** Default "mean". */
    aggregation?: "mean" | "median";
}
/** Native `splitters.spxy_g_fold` (splitter). Required inputs: y, groups. */
export declare class SPXYGroupFold extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.spxy_g_fold";
    readonly paramTypes: {
        readonly n_splits: "int";
        readonly y_metric: "enum";
        readonly aggregation: "enum";
    };
    constructor(params?: SPXYGroupFoldParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of SystematicCircular; unset values take the native defaults. */
export interface SystematicCircularParams {
    /** Default 0.25. */
    test_size?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `splitters.systematic_circular` (splitter). Required inputs: y. */
export declare class SystematicCircular extends NativeProcedure implements Splitter {
    readonly methodId = "splitters.systematic_circular";
    readonly paramTypes: {
        readonly test_size: "double";
        readonly seed: "int";
    };
    constructor(params?: SystematicCircularParams);
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Parameters of HotellingT2; unset values take the native defaults. */
export interface HotellingT2Params {
    /** Default 5. */
    n_components?: number;
    /** Default 0.05. */
    alpha?: number;
}
/** Native `utilities.hotelling_t2` (generic). */
export declare class HotellingT2 extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.hotelling_t2";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly alpha: "double";
    };
    constructor(params?: HotellingT2Params);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of Moments; unset values take the native defaults. */
export interface MomentsParams {
}
/** Native `utilities.moments` (generic). Required inputs: y. */
export declare class Moments extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.moments";
    readonly paramTypes: {};
    constructor(params?: MomentsParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of QResiduals; unset values take the native defaults. */
export interface QResidualsParams {
    /** Default 5. */
    n_components?: number;
    /** Default 0.05. */
    alpha?: number;
}
/** Native `utilities.q_residuals` (generic). */
export declare class QResiduals extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.q_residuals";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly alpha: "double";
    };
    constructor(params?: QResidualsParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of SignalTypeDetector; unset values take the native defaults. */
export interface SignalTypeDetectorParams {
    /** Default 0.7. */
    confidence_threshold?: number;
}
/** Native `utilities.signal_type_detector` (generic). */
export declare class SignalTypeDetector extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.signal_type_detector";
    readonly paramTypes: {
        readonly confidence_threshold: "double";
    };
    constructor(params?: SignalTypeDetectorParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of Sweep; unset values take the native defaults. */
export interface SweepParams {
    /** Default 5. */
    cv?: number;
    /** Default [0.01, 0.1, 1, 10]. */
    ridge_lambdas?: number[];
    /** Default [1, 2, 3, 4, 5]. */
    pls_components?: number[];
    /** Default "ridge". */
    heads?: "ridge" | "pls" | "ridge_pls";
    /** Default true. */
    center_x?: boolean;
    /** Default true. */
    scale_x?: boolean;
    /** Default true. */
    center_y?: boolean;
    /** Default true. */
    scale_y?: boolean;
}
/** Native `utilities.sweep` (generic). Required inputs: y. */
export declare class Sweep extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.sweep";
    readonly paramTypes: {
        readonly cv: "int";
        readonly ridge_lambdas: "double_array";
        readonly pls_components: "int_array";
        readonly heads: "enum";
        readonly center_x: "bool";
        readonly scale_x: "bool";
        readonly center_y: "bool";
        readonly scale_y: "bool";
    };
    constructor(params?: SweepParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
/** Parameters of TransferMetrics; unset values take the native defaults. */
export interface TransferMetricsParams {
    /** Default 10. */
    n_components?: number;
    /** Default 10. */
    k_neighbors?: number;
    /** Default 0. */
    seed?: number;
}
/** Native `utilities.transfer_metrics` (generic). Required inputs: target_domain. */
export declare class TransferMetrics extends NativeProcedure implements Procedure {
    readonly methodId = "utilities.transfer_metrics";
    readonly paramTypes: {
        readonly n_components: "int";
        readonly k_neighbors: "int";
        readonly seed: "int";
    };
    constructor(params?: TransferMetricsParams);
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
