import { MethodResult } from "./methodResult.js";
type ExactInteger = bigint | number;
export type SearchAxis = {
    kind: "int" | "log_int";
    low: ExactInteger;
    high: ExactInteger;
    step?: ExactInteger;
} | {
    kind: "float" | "log_float";
    low: number;
    high: number;
    step?: number;
} | {
    kind: "categorical";
    type: "string";
    choices: readonly string[];
} | {
    kind: "categorical";
    type: "integer";
    choices: readonly ExactInteger[];
} | {
    kind: "categorical";
    type: "float";
    choices: readonly number[];
} | {
    kind: "categorical";
    type: "boolean";
    choices: readonly boolean[];
} | {
    kind: "ordinal";
    choices: readonly number[];
} | {
    kind: "sorted_tuple";
    length: number;
    low: number;
    high: number;
    integer?: boolean;
};
export interface SearchConstraint {
    kind: "mutex_group" | "requires" | "exclude" | "condition_in" | "condition_not_in";
    refs: readonly string[];
    labels?: readonly (string | null)[];
}
export interface OptimizerOptions {
    sampler?: "random" | "sobol" | "lhs" | "ternary" | "ga" | "pso" | "cmaes" | "tpe" | "gp_ei";
    pruner?: "none" | "median" | "asha" | "hyperband" | "racing";
    direction?: "auto" | "minimize" | "maximize";
    evalMode?: "best" | "mean" | "robust_best";
    metric?: "rmse" | "mse" | "mae" | "r2" | "accuracy" | "balanced_accuracy" | "f1" | "logloss";
    liar?: "none" | "min" | "mean" | "max";
    startupTrials?: number;
    seed?: ExactInteger;
    timeoutSeconds?: number;
    maxResource?: number;
    reductionFactor?: number;
}
export type TrialValue = number | bigint | string | boolean | readonly (number | bigint)[];
export interface OptimizerTrial {
    id: bigint;
    parameters: Readonly<Record<string, TrialValue>>;
    rung: number;
    status: "running" | "completed" | "pruned" | "failed" | "cancelled";
}
export interface BatchResult {
    trials: readonly OptimizerTrial[];
    /** Nonzero only when native ask_batch committed a prefix before an error. */
    nativeStatus: number;
}
export interface OptimizerTrialRecord extends OptimizerTrial {
    readonly active: Readonly<Record<string, boolean>>;
    readonly score: number | null;
    readonly askSequence: bigint;
    readonly terminalSequence: bigint | null;
    readonly intermediates: readonly {
        sequence: bigint;
        step: number;
        score: number;
        shouldPrune: boolean;
    }[];
    readonly error: {
        code: string;
        message: string;
        retryable: boolean;
    } | null;
}
/** Owns a native optimizer and its context. Dispose it after use. */
export declare class Optimizer {
    private _ptr;
    private readonly context;
    readonly space: Readonly<Record<string, SearchAxis>>;
    private constructor();
    static create(space: Readonly<Record<string, SearchAxis>>, options?: OptimizerOptions, constraints?: readonly SearchConstraint[]): Optimizer;
    static load(blob: Uint8Array, space: Readonly<Record<string, SearchAxis>>): Optimizer;
    private get handle();
    private decodeTrial;
    ask(): OptimizerTrial;
    askBatch(n: number): BatchResult;
    /** Queue numeric values; categorical axes use zero-based choice indices. */
    enqueue(parameters: Readonly<Record<string, ExactInteger>>): void;
    tell(trial: OptimizerTrial | ExactInteger, status: "completed" | "pruned" | "failed" | "cancelled", score?: number, error?: string): void;
    intermediate(trial: OptimizerTrial | ExactInteger, step: number, score: number): boolean;
    best(): {
        trial: OptimizerTrial;
        score: number;
    };
    /** Owning native rich trace v1 snapshot. Caller must destroy the result. */
    trials(sinceId?: ExactInteger): MethodResult;
    /** Decode an owning rich-trace snapshot to typed JS values. */
    trialRecords(sinceId?: ExactInteger): readonly OptimizerTrialRecord[];
    /** Portable N4MOPT bytes, directly readable by Python/R/native bindings. */
    save(): Uint8Array;
    dispose(): void;
}
export {};
