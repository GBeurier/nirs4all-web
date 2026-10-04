import type { Matrix } from "./types.js";
export interface MultimodalSourceSchema {
    representation_id: string;
    input_shape: number[];
    dtype: string;
    identity: string;
}
export type MultimodalSourceSchemas = Record<string, MultimodalSourceSchema>;
export interface RawTensor {
    data: Float32Array | Float64Array;
    shape: number[];
    strides?: number[];
}
export type MultimodalBlocks = Record<string, RawTensor | Array<[number | string, string]>>;
export interface MultimodalRecipe {
    schema_version: number;
    fusion: string;
    source_order: string[];
    encoders: Record<string, Record<string, unknown>>;
    source_weights: Record<string, number>;
    model: {
        method_id: string;
        params: Record<string, unknown>;
    };
}
/** Complete native early-fusion pipeline, portable as a bounded N4MF state. */
export declare class MultimodalPipeline {
    private ptr;
    private readonly sourceOrder;
    readonly recipe: MultimodalRecipe;
    readonly sourceSchemas: MultimodalSourceSchemas;
    constructor(recipe: MultimodalRecipe, sourceSchemas: MultimodalSourceSchemas);
    private handle;
    fit(blocks: MultimodalBlocks, y: Matrix | Float64Array): this;
    predict(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): Matrix;
    transform(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): Matrix;
    private operation;
    exportState(): Uint8Array;
    static fromState(state: Uint8Array, recipe: MultimodalRecipe, sourceSchemas: MultimodalSourceSchemas): MultimodalPipeline;
    dispose(): void;
}
/** Original class labels; numeric labels require lossless JS/int64 transport. */
export type MultimodalClassLabel = string | number;
/** Native raw PLS-logistic classifier; N4MC states contain no training rows. */
export declare class MultimodalClassifierPipeline {
    private ptr;
    private classNames;
    private readonly sourceOrder;
    readonly recipe: MultimodalRecipe;
    readonly sourceSchemas: MultimodalSourceSchemas;
    constructor(recipe: MultimodalRecipe, sourceSchemas: MultimodalSourceSchemas);
    private createHandle;
    private handle;
    private static classIds;
    fit(blocks: MultimodalBlocks, y: readonly MultimodalClassLabel[]): this;
    classes(): MultimodalClassLabel[];
    labelNames(): MultimodalClassLabel[] | undefined;
    predict(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): MultimodalClassLabel[];
    predictProba(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): Matrix;
    decisionFunction(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): Matrix;
    transform(blocks: MultimodalBlocks, schemas?: MultimodalSourceSchemas): Matrix;
    private matrixOperation;
    exportState(): Uint8Array;
    static fromState(state: Uint8Array, recipe: MultimodalRecipe, sourceSchemas: MultimodalSourceSchemas, options?: {
        classNames?: MultimodalClassLabel[];
    }): MultimodalClassifierPipeline;
    dispose(): void;
}
