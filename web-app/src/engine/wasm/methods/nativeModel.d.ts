import type { Context } from "./context.js";
import type { MethodResult } from "./methodResult.js";
import type { Matrix } from "./types.js";
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
    /** Export the complete native model as N4MM bytes. */
    toN4mm(): Uint8Array;
    destroy(): void;
}
