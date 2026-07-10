import { Matrix } from "./types.js";
export declare class MethodResult {
    private _ptr;
    constructor(ptr: number);
    /** Generic runner for the `(ctx, cfg, X[, Y, ...views], ...scalar-extras)
     *  -> n4m_method_result_t**` family — the bulk of the ~150 method_result
     *  producers. Matrix views are built BigInt-safe via makeMatrixView, so
     *  the deep entrypoints get correct dimensions under WASM_BIGINT=1.
     *  Returns an owning MethodResult; read outputs with matrix()/vector().
     *
     *  `extra` are the positional scalar args after the views, matching the C
     *  signature: "int" -> int32_t, "double" -> double, "int64" -> int64_t.
     *  (Methods taking raw caller buffers — e.g. weighted_pls sample_weights —
     *  need a thin per-method wrapper that mallocs the buffer; not handled
     *  here.) */
    static run(symbol: string, ctxHandle: number, cfgHandle: number, views: Matrix[], extra?: ReadonlyArray<{
        kind: "int" | "double" | "int64";
        value: number;
    }>): MethodResult;
    get handle(): number;
    /** Read a named double matrix by name. Returns a copy in JS-owned memory. */
    matrix(name: string): Matrix;
    /** Read a named int32 vector. */
    vectorInt(name: string): Int32Array;
    /** Read a named scalar (returns NaN if not present). */
    scalar(name: string): number;
    destroy(): void;
}
