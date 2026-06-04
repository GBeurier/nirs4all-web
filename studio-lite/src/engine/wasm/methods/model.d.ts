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
