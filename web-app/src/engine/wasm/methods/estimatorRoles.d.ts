import type { Matrix } from "./types.js";
/** Regressor role: Data[n, p] + Target[n, q] -> Prediction[n, q]. */
export interface Regressor {
    predict(X: Matrix): Matrix;
}
/**
 * Classifier role: Data[n, p] + Labels[n] -> class ids and scores. The core
 * works on integer class ids; callers map their own label names.
 */
export interface Classifier {
    /** Class id of each row. */
    predictLabels(X: Matrix): number[];
    /** Method-defined class scores, one column per class in classes() order. */
    decisionFunction(X: Matrix): Matrix;
    /** Fitted class ids, ascending. */
    classes(): number[];
}
/** Classifier that defines class probabilities. */
export interface ProbabilisticClassifier extends Classifier {
    /** Class probabilities, one column per class in classes() order. */
    predictProba(X: Matrix): Matrix;
}
/**
 * Sample-filter role: Data[n, p] (+ Target) -> keep mask[n], train only.
 * Filters on the target read `y` at fit and in getMask; the others ignore it.
 */
export interface SampleFilter {
    /** Keep mask of the rows of X (true keeps the row). */
    getMask(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
}
/** Transformer role: Data[n, p] (+ Target) -> Data[n, k]. */
export interface Transformer {
    transform(X: Matrix): Matrix;
}
/** Selector role: Data[n, p] (+ Target) -> the k selected input columns. */
export interface Selector {
    /** Selected columns in ascending input order. */
    transform(X: Matrix): Matrix;
    /** Selected input columns (0-based) in native selection order. */
    selectedIndices(): number[];
}
/** Native parameter types, as published by the manifest. */
export type ParamType = "int" | "double" | "bool" | "enum" | "int_array" | "double_array";
export type ParamValue = number | boolean | string | number[];
/** Optional fit inputs; the native core refuses those a method does not use. */
export interface FitInputs {
    sampleWeight?: Float64Array | number[];
    groups?: number[];
    featureGroups?: number[];
    blocks?: number[];
    axis?: Float64Array | number[];
    XTarget?: Matrix;
    foldIds?: number[];
}
/** Runs `fn` with a fresh native context, destroyed afterwards. */
export declare function withContext<T>(fn: (ctx: number) => T): T;
export declare function readI64(ptr: number): number;
export type Alloc = {
    ptr: number;
    free: () => void;
};
export declare function cString(s: string): Alloc;
/** Validated native parameters of a method; the caller destroys them. */
export declare function nativeParams(ctx: number, method: NativeMethod): number;
/**
 * Runs `fn` over an n4m_fit_inputs_v1_t built from the given data. Per-row
 * inputs (y, labels, sampleWeight, groups, foldIds) must have one entry per
 * row of X and per-column inputs (featureGroups, axis) one per column; the
 * lengths are checked here with the argument named, and again natively.
 */
export declare function withFitInputs<T>(X: Matrix, y: Matrix | Float64Array | ArrayLike<number> | undefined, labels: boolean, inputs: FitInputs, fn: (struct: number, hold: (a: Alloc) => number) => T): T;
/** Parameters of one catalog method (estimator or procedure). */
export declare abstract class NativeMethod {
    /** Catalog method id, for example "models.pls.pls_regression". */
    abstract readonly methodId: string;
    /** Parameter name -> native type. */
    abstract readonly paramTypes: Readonly<Record<string, ParamType>>;
    /** Explicit parameter values (unset ones take the native default). */
    params: Record<string, ParamValue | undefined>;
    /** Registers a generated class so fromN4me() and methodClass() find it. */
    static register(methodId: string, cls: new () => NativeMethod): void;
}
/** The native manifest: every method's roles, node kinds, fit inputs and typed parameters. */
export declare function manifest(): {
    abi: string;
    methods: Array<Record<string, unknown>>;
};
/** The generated class of a catalog method id. */
export declare function methodClass(methodId: string): new () => NativeMethod;
/** Base of every generated estimator: parameters, fit and N4ME state. */
export declare abstract class NativeEstimator extends NativeMethod {
    /** True when the fit target is class labels (classifiers). */
    protected readonly labelTarget: boolean;
    private ptr;
    get fitted(): boolean;
    /**
     * Fit on row-major X and the target: responses for a regressor (a vector
     * or a row-major matrix, one row per row of X), integer class ids for a
     * classifier (one per row). Returns this. The fitted state is replaced
     * only when the fit succeeds: a failed refit leaves the previous one.
     */
    fit(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): this;
    /** True when the fitted state embeds training rows (kernel PLS, GPR-PLS, LW-PLS, ...). */
    containsTrainingRows(): boolean;
    /**
     * Portable fitted state (N4ME bytes), readable by every n4m binding. A
     * state that embeds training rows (containsTrainingRows()) is refused
     * unless `allowTrainingRows` is set: sharing the export shares them.
     */
    toN4me(options?: {
        allowTrainingRows?: boolean;
    }): Uint8Array;
    /** Rebuilds a fitted estimator of the class registered for its method. */
    static fromN4me(payload: Uint8Array): NativeEstimator;
    /** Releases the native estimator. */
    dispose(): void;
    protected predictMatrix(X: Matrix): Matrix;
    protected transformMatrix(X: Matrix): Matrix;
    protected decisionMatrix(X: Matrix): Matrix;
    protected probaMatrix(X: Matrix): Matrix;
    protected labelArray(X: Matrix): number[];
    protected maskArray(X: Matrix, y?: Float64Array | ArrayLike<number>): boolean[];
    protected classArray(): number[];
    protected selectedIndexArray(): number[];
    /** Reads a (handle, out, capacity, out_count) integer list. */
    private indexArray;
    private matrixOp;
    private handle;
    private static methodIdOf;
}
/** Splitter role: Data[n, p] (+ Target, groups) -> folds of 0-based row indices. */
export interface Splitter {
    split(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
}
/** Augmenter role: Data[n, p] -> augmented Data[n, p], train only. */
export interface Augmenter {
    augment(X: Matrix, axis?: Float64Array | number[]): Matrix;
}
/** Augmenter that mixes rows (mixup): the targets are mixed with the same draw, row for row. */
export interface TargetMixingAugmenter {
    augment(X: Matrix, y: Matrix | Float64Array | ArrayLike<number>, axis?: Float64Array | number[]): {
        X: Matrix;
        Y: Matrix;
    };
}
/** Generic procedure (diagnostics, utilities): inputs -> named outputs. */
export interface Procedure {
    run(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
export interface Fold {
    train: number[];
    test: number[];
}
/** A named output: a matrix, an integer vector or a scalar. */
export type ProcedureOutput = Matrix | number[] | number;
/** Base of the generated procedures: one native run, no fitted state. */
export declare abstract class NativeProcedure extends NativeMethod {
    protected runRaw<T>(X: Matrix, y: Matrix | Float64Array | ArrayLike<number> | undefined, inputs: FitInputs, read: (result: number) => T): T;
    protected splitFolds(X: Matrix, y?: Float64Array | ArrayLike<number>, groups?: number[]): Fold[];
    protected augmentMatrix(X: Matrix, axis?: Float64Array | number[]): Matrix;
    protected augmentWithTargets(X: Matrix, y: Matrix | Float64Array | ArrayLike<number>, axis?: Float64Array | number[]): {
        X: Matrix;
        Y: Matrix;
    };
    protected runOutputs(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number>, inputs?: FitInputs): Record<string, ProcedureOutput>;
}
