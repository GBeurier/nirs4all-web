import type { Matrix } from "./types.js";
export interface SpectralEncodingOptions {
    kind: "lvse" | "gcu";
    width?: number;
    rank?: number;
    overlap?: number;
    standardize?: boolean;
    snv?: boolean;
    maxIter?: number;
    tolerance?: number;
}
/** Fitted native LVSE/GCU. Call dispose() to release its WASM handle. */
export declare class SpectralEncoder {
    private ptr;
    private features;
    private outputs;
    constructor(options: SpectralEncodingOptions);
    private check;
    fit(X: Matrix): this;
    transform(X: Matrix): Matrix;
    /** LVSE without SNV: transform(X) = X @ operator.T + offset. */
    exportAffine(): {
        operator: Matrix;
        offset: Float64Array;
    };
    dispose(): void;
}
