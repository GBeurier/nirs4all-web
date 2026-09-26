import type { Context } from "./context.js";
import type { Matrix } from "./types.js";
/** The 15 pipeline kinds currently implemented by the native core. */
export declare enum PipelineOperatorKind {
    IDENTITY = 0,
    CENTER = 1,
    AUTOSCALE = 2,
    PARETO_SCALE = 3,
    SNV = 4,
    MSC = 5,
    EMSC = 6,
    DETREND_POLY = 7,
    SAVGOL_SMOOTH = 8,
    SAVGOL_DERIVATIVE = 9,
    NORRIS_WILLIAMS = 10,
    ASLS_BASELINE = 11,
    OSC = 12,
    EPO = 13,
    WAVELET_DENOISE = 14
}
export interface PipelineStep {
    readonly kind: PipelineOperatorKind;
    /** Original positional native parameters; defaults remain an empty vector. */
    readonly params: readonly number[];
}
/** Owning JS façade for an ordered, fitted C ABI preprocessing pipeline. */
export declare class NativePreprocessingPipeline {
    private _ptr;
    private readonly _ctx;
    readonly nFeatures: number;
    readonly steps: readonly PipelineStep[];
    private constructor();
    /** Fit an ordered recipe. OSC and EPO require Y; others may omit it. */
    static fit(ctx: Context, steps: readonly PipelineStep[], X: Matrix, Y?: Matrix): NativePreprocessingPipeline;
    /** Import fitted N4MP bytes; optionally attest against an external recipe. */
    static fromBytes(ctx: Context, bytes: Uint8Array, expectedSteps?: readonly PipelineStep[]): NativePreprocessingPipeline;
    /** Transform new rows using only native fitted state. */
    transform(X: Matrix): Matrix;
    /** Export the native fitted state and ordered recipe in N4MP format. */
    toBytes(): Uint8Array;
    destroy(): void;
}
