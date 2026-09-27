import { type FitInputs, type ParamValue } from "./estimatorRoles.js";
import type { Matrix } from "./types.js";
/**
 * A recipe step: a method id ("models.pls.cppls" or "n4m:models.pls.cppls"),
 * [methodId, params], {methodId, params} or a v8 recipe token
 * {class: "n4m:<id>", params}.
 */
export type RoleStep = string | [string, Record<string, ParamValue>] | {
    methodId: string;
    params?: Record<string, ParamValue>;
} | {
    class: string;
    params?: Record<string, ParamValue>;
};
/** Role a step plays in the pipeline. */
export type PipelineRole = "transformer" | "regressor" | "classifier" | "selector" | "sample_filter";
export interface RolePipelineStepInfo {
    methodId: string;
    role: PipelineRole;
    /** Index among the stateful steps; -1 for a sample filter (train-only). */
    stateIndex: number;
    /** The fitted state embeds training rows (export needs the opt-in). */
    containsTrainingRows: boolean;
    nFeaturesIn: number;
    nFeaturesOut: number;
}
export interface RolePipelineState {
    methodId: string;
    n4me: Uint8Array;
    containsTrainingRows: boolean;
}
/** Class labels: integer ids, or names mapped to ids in sorted order. */
export type ClassLabel = number | string;
/** Native trained recipe of role steps, portable as N4ME states. */
export declare class RolePipeline {
    readonly steps: ReadonlyArray<RoleStep>;
    private ptr;
    private names;
    private classNames;
    private constructor();
    /** An unfitted pipeline; the recipe is validated natively. */
    static fromSteps(steps: ReadonlyArray<RoleStep>): RolePipeline;
    /**
     * A fitted pipeline rebuilt from one N4ME state per stateful step. The
     * native import refuses states that contradict the recipe (count, method,
     * parameters, role, widths). classNames restores string class labels.
     */
    static fromStates(steps: ReadonlyArray<RoleStep>, states: ReadonlyArray<Uint8Array | RolePipelineState>, options?: {
        featureNames?: string[];
        classNames?: string[];
    }): RolePipeline;
    get fitted(): boolean;
    /** Input column names stored at fit or import (undefined: positional). */
    get featureNames(): string[] | undefined;
    /**
     * Fits every step natively. y holds responses for a final regressor (a
     * vector or a row-major matrix) or class labels for a final classifier;
     * featureNames are stored and checked at every later call. Returns this;
     * on failure the previous fit is kept.
     */
    fit(X: Matrix, y?: Matrix | Float64Array | ArrayLike<number> | ArrayLike<ClassLabel>, inputs?: FitInputs & {
        featureNames?: string[];
    }): this;
    /** Predictions of a final regressor. */
    predict(X: Matrix, featureNames?: string[]): Matrix;
    /** Rows after the transformers and selectors (the final step's input). */
    transform(X: Matrix, featureNames?: string[]): Matrix;
    /** Class scores of a final classifier, one column per class in classes() order. */
    decisionFunction(X: Matrix, featureNames?: string[]): Matrix;
    /** Class probabilities, for final classifiers that define them. */
    predictProba(X: Matrix, featureNames?: string[]): Matrix;
    /** Class labels of a final classifier (names when trained on names). */
    predictLabels(X: Matrix, featureNames?: string[]): ClassLabel[];
    /**
     * Label table of a classifier fitted on names (index = class id), else
     * undefined. Unlike classes() it keeps labels whose rows a sample filter
     * removed, so an exported pipeline can restore every name.
     */
    labelNames(): string[] | undefined;
    /** Fitted classes, ascending ids (names when trained on names). */
    classes(): ClassLabel[];
    /** Per step: method, role played, state index, fitted widths, training rows. */
    stepsInfo(): RolePipelineStepInfo[];
    /**
     * One N4ME state per stateful step. A state that embeds training rows is
     * refused unless allowTrainingRows is set.
     */
    exportStates(options?: {
        allowTrainingRows?: boolean;
    }): RolePipelineState[];
    /** Releases the native pipeline. */
    dispose(): void;
    private create;
    private publish;
    private handle;
    private label;
    private static setFeatureNames;
    /** Native width and feature-name check of X (names optional: positional). */
    private checkFeatures;
    private static stepInfo;
    private matrixOp;
}
