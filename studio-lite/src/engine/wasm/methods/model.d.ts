import { Matrix } from "./types.js";
export interface PlsModel {
    /** Regression coefficients, row-major (n_features × n_targets). */
    coefficients: Float64Array;
    /** Per-feature mean used for centring. */
    xMean: Float64Array;
    /** Per-target mean used for centring. */
    yMean: Float64Array;
    /** Number of features `p` and targets `q`. */
    n_features: number;
    n_targets: number;
}
/** Fit a SIMPLS PLS-regression model on (X, Y).
 *
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix.
 * @param n_components number of latent components.
 */
export declare function fitPls(X: Matrix, Y: Matrix, n_components: number): PlsModel;
/** Predict from a fitted PlsModel for new X (row-major n_new × p). */
export declare function predictPls(model: PlsModel, X_new: Matrix): Matrix;
/** A fitted coefficient-based model produced by {@link fitModel}. */
export interface FittedModel {
    /** Regression coefficients, row-major (n_features × n_targets). */
    coefficients: Float64Array;
    /** Per-feature mean used for centring. */
    xMean: Float64Array;
    /** Per-target mean used for centring. */
    yMean: Float64Array;
    /** Per-target intercept (null when the model centres without one). */
    intercept: Float64Array | null;
    n_features: number;
    n_targets: number;
}
/** Fit any coefficient-based libn4m model by its catalog `type` token.
 *
 * Tier A (PLS / PLSRegression / PCR / PLSCanonical / PLSSVD / PLSDA) routes
 * through the algorithm-enum model API; Tier B (Ridge, RidgePLS, CPPLS, ...)
 * through the matching standalone fit. The `params` vector is the documented
 * positional contract per model (see the studio-lite catalog). Unknown or
 * non-coefficient tokens throw (the C side returns N4M_ERR_NOT_IMPLEMENTED).
 *
 * @param model catalog `type` token, e.g. `'Ridge'`.
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix.
 * @param n_components number of latent components (used by the PLS family).
 * @param params positional hyper-parameter vector for the model.
 */
export declare function fitModel(model: string, X: Matrix, Y: Matrix, n_components: number, params?: number[]): FittedModel;
/** Predict from a fitted {@link FittedModel} for new X (row-major n_new × p). */
export declare function predictModel(model: FittedModel, X_new: Matrix): Matrix;
/** A fitted AOM-PLS model — a {@link FittedModel} (so {@link predictModel}
 *  works unchanged) plus the screen result. Its `intercept` is a genuine
 *  input-space intercept and its `xMean` / `yMean` are zero, so prediction is
 *  the affine form  y = intercept + X.B  on RAW X. */
export interface AomModel extends FittedModel {
    /** Bank index of the operator the internal CV selected. */
    selectedOperator: number;
    /** Best internal-CV score of the selected operator. */
    score: number;
}
/** Fit AOM-PLS (operator-adaptive PLS) on (X, Y).
 *
 * Screens a bank of strict-linear preprocessing operators by internal k-fold CV
 * and fits SIMPLS on the winner, returning INPUT-SPACE coefficients so the model
 * predicts on RAW X — it is therefore used WITHOUT preceding preprocessing steps
 * (the screen does the preprocessing internally). Numerics are 100% libn4m
 * (`n4m_model_selection_aom_pls_select`); this only builds the bank + validation plan.
 *
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix.
 * @param maxComponents max latent components for the internal SIMPLS fits.
 * @param nFolds internal-CV fold count for the operator screen.
 * @param seed reserved (the contiguous-fold partition is deterministic).
 * @param operatorKinds optional `n4m_operator_kind_t` bank override; when
 *   omitted a default strict bank (identity / detrend / SG smooth / SG
 *   derivative / finite-difference) is screened.
 */
export declare function fitAom(X: Matrix, Y: Matrix, maxComponents: number, nFolds?: number, seed?: number, operatorKinds?: number[]): AomModel;
/** A fitted POP-PLS model — a {@link FittedModel} (so {@link predictModel}
 *  works unchanged) plus the per-component screen result. Its `intercept` is a
 *  genuine input-space intercept and its `xMean` / `yMean` are zero, so
 *  prediction is the affine form  y = intercept + X.B  on RAW X. */
export interface PopModel extends FittedModel {
    /** Bank index of the operator picked at each selected latent component
     *  (length = `selectedComponents`). */
    selectedOperators: number[];
    /** Number of latent components the per-component screen selected. */
    selectedComponents: number;
    /** Best internal-CV prefix score of the selected model. */
    score: number;
}
/** Fit POP-PLS (per-component operator-adaptive PLS) on (X, Y).
 *
 * Like AOM-PLS but picks one strict-linear operator PER latent component
 * (`n4m_model_selection_pop_pls_select`) rather than one for the whole model, then
 * returns INPUT-SPACE coefficients so it predicts on RAW X via the same affine
 * intercept path — so it is used WITHOUT preceding preprocessing steps (the
 * screen does the preprocessing internally). Numerics are 100% libn4m; this
 * only builds the bank + validation plan.
 *
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix.
 * @param maxComponents max latent components for the internal SIMPLS fits.
 * @param nFolds internal-CV fold count for the operator screen.
 * @param seed reserved (the contiguous-fold partition is deterministic).
 * @param operatorKinds optional `n4m_operator_kind_t` bank override; when
 *   omitted a default strict bank (identity / detrend / SG smooth / SG
 *   derivative / finite-difference) is screened.
 */
export declare function fitPop(X: Matrix, Y: Matrix, maxComponents: number, nFolds?: number, seed?: number, operatorKinds?: number[]): PopModel;
/** Options for the AOM Ridge simplex blender. */
export interface AomRidgeOptions {
    /** operator/chain bank profile: 0 = compact, 1 = wide (default 0). */
    profile?: number;
    /** internal CV folds for OOF Ridge scoring (default 5). */
    cv?: number;
    /** Ridge λ candidate grid; omit for a default log grid. */
    ridgeLambdas?: number[];
    /** non-negative shrinkage of the simplex blend toward uniform (default 0.01). */
    regularizer?: number;
}
/** Fit the AOM Ridge simplex blender (n4m_ensemble_aom_ridge_blender_fit): builds
 *  a strict-linear chain bank internally, OOF-blends (chain, λ) Ridge candidates
 *  over `cv` contiguous folds, and returns the weighted final INPUT-SPACE
 *  coefficients + intercept — so it predicts on RAW X via the affine form
 *  y = intercept + X.B (used WITHOUT preceding preprocessing). */
export declare function fitAomRidge(X: Matrix, Y: Matrix, opts?: AomRidgeOptions): FittedModel;
/** Options for the AOM operator-PLS score stack (Ridge head). */
export interface AomStackOptions {
    /** operator bank profile: 0 = compact, 1 = wide (default 0). */
    profile?: number;
    /** internal CV folds for the (n_components, alpha) screen (default 5). */
    cv?: number;
    /** component grid endpoint — screens [1..maxComponents] (default 15). */
    maxComponents?: number;
    /** Ridge-head α grid; omit for a default log grid. */
    alphas?: number[];
    /** non-negative penalty on OOF-RMSE std in the selection criterion (default 0). */
    stdPenalty?: number;
    /** non-negative penalty on (mean_oof_rmse - mean_train_rmse) (default 0). */
    gapPenalty?: number;
}
/** Fit the AOM operator-PLS score stack with Ridge head
 *  (n4m_ensemble_aom_operator_pls_stack_fit). SINGLE-TARGET only (Y must be
 *  n × 1). Returns the stack folded into INPUT-SPACE coefficients + intercept,
 *  so it predicts on RAW X via the affine form (used WITHOUT preprocessing). */
export declare function fitAomStack(X: Matrix, Y: Matrix, opts?: AomStackOptions): FittedModel;
/** A train/test splitter kind for {@link computeSplit}. */
export type SplitKind = "KennardStone" | "SPXY" | "KMeans" | "KBinsStratified" | "DataTwinning" | "SystematicCircular";
/** Options for {@link computeSplit}. `testSize` is a fraction in (0, 1). */
export interface SplitOptions {
    /** test fraction in (0, 1); default 0.25. */
    testSize?: number;
    /** seed for the stochastic splitters (KMeans, KBinsStratified). */
    seed?: number;
    /** KMeans: max iterations (default 100). */
    maxIter?: number;
    /** KBinsStratified: number of Y bins (default 5). */
    nBins?: number;
    /** KBinsStratified: 0 = uniform-width bins, 1 = quantile bins. */
    strategy?: number;
}
/** Ordered row indices returned by libn4m splitters. */
export interface SplitIndices {
    trainIndices: Int32Array;
    testIndices: Int32Array;
}
/** Compute a single train/test split over the rows of X (and Y) via libn4m's
 * splitters, returning a `Uint8Array` mask of length n where 1 = test, 0 = train.
 *
 * Numerics are 100% libn4m (`n4m_wasm_split` → n4m_split_*). KennardStone and
 * SPXY are deterministic; KMeans and KBinsStratified use `opts.seed`. SPXY and
 * KBinsStratified need Y; KennardStone and KMeans use X only.
 *
 * @param kind splitter strategy.
 * @param X row-major (n × p) input matrix.
 * @param Y row-major (n × q) target matrix (required for SPXY / KBinsStratified).
 * @param opts split options (testSize / seed / maxIter / nBins / strategy).
 */
export declare function computeSplit(kind: SplitKind, X: Matrix, Y: Matrix | null, opts?: SplitOptions): Uint8Array;
/** Compute a train/test split and return the ordered train/test indices from libn4m.
 *
 * Unlike {@link computeSplit}, this preserves splitter-specific ordering, which matters
 * for strict parity with the native Python binding.
 */
export declare function computeSplitIndices(kind: SplitKind, X: Matrix, Y: Matrix | null, opts?: SplitOptions): SplitIndices;
export declare class Model {
    private _data;
    private constructor();
    static fit(_ctx: unknown, _cfg: unknown, X: Matrix, Y: Matrix, n_components?: number): Model;
    predict(_ctx: unknown, X_new: Matrix): Matrix;
    get coefficients(): Float64Array;
    get xMean(): Float64Array;
    get yMean(): Float64Array;
    destroy(): void;
}
