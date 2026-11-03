import type { Context } from "./context.js";
import type { MethodResult } from "./methodResult.js";
import { ModelArray, type Matrix } from "./types.js";
/** Component resolution of a PLS regression or PCR model (ABI 2.20). */
export interface ComponentResolution {
    /** Absolute X-Y cross-covariance resolution, in centred (scaled) X times
     *  Y units, shared by every component. */
    resolution: number;
    /** Per component: true when its cross-covariance is not above the
     *  resolution, whether mathematically undefined (exact value zero) or
     *  merely not resolved numerically (below the bound). PLS publishes such
     *  a component, and every later one, as a null component (zero latent
     *  columns, no contribution to the coefficients); PCR keeps a resolved
     *  X direction (n4m.h, N4M_MODEL_UNRESOLVED_COMPONENTS). */
    unresolved: boolean[];
}
export declare class NativeModel {
    private _ptr;
    private readonly _ctx;
    private constructor();
    /** Copy an affine MethodResult into a standalone native model. */
    static fromMethodResult(ctx: Context, result: MethodResult): NativeModel;
    /** Import a complete native N4MM model payload. */
    static fromN4mm(ctx: Context, payload: Uint8Array): NativeModel;
    /** Predict through libn4m; no coefficients are evaluated in JS. */
    predict(X: Matrix): Matrix;
    /** Copy one fitted-model array (n4m_model_get_array). */
    getArray(kind: ModelArray): Matrix;
    /** Component resolution and unresolved flags; throws N4mError
     *  (unsupported) for models that do not record them. */
    componentResolution(): ComponentResolution;
    /** Export the complete native model as N4MM bytes. */
    toN4mm(): Uint8Array;
    destroy(): void;
}
