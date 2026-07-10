export interface PpOperator {
    /** opaque WASM handle; 0 once destroyed */
    _ptr: number;
}
/** Create a preprocessing operator by catalog type token + numeric params. */
export declare function ppCreate(op: string, params?: number[]): PpOperator;
/** Fit a stateful operator on training data (no-op for stateless operators). */
export declare function ppFit(op: PpOperator, X: Float64Array, n: number, p: number): void;
/** Transform X (n×p, row-major) → a fresh Float64Array (n×p). */
export declare function ppTransform(op: PpOperator, X: Float64Array, n: number, p: number): Float64Array;
/** Serialize the fitted state (empty for stateless operators). */
export declare function ppGetState(op: PpOperator): Float64Array;
/** Restore a fitted state from getState() output (no-op for stateless ops). */
export declare function ppSetState(op: PpOperator, state: Float64Array): void;
/** Free the operator handle. */
export declare function ppDestroy(op: PpOperator): void;
