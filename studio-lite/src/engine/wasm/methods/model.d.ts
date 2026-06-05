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
