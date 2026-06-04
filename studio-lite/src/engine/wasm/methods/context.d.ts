/** RAII wrapper around n4m_context_t. */
export declare class Context {
    private _ptr;
    private constructor();
    /** Create a new context. Throws Pls4allError on failure. */
    static create(): Context;
    /** Returns the raw `n4m_context_t*` pointer (handle). */
    get handle(): number;
    /** Free the context. Safe to call multiple times. */
    destroy(): void;
    /** Set the RNG seed used by stochastic algorithms.
     *
     *  n4m_context_set_seed takes a uint64_t. Under WASM_BIGINT=1 the i64 slot
     *  must be marshalled as 'i64' with a BigInt — passing a JS number loses
     *  precision above 2^53 and throws "Cannot convert N to a BigInt" on emsdk
     *  >= 5.0.7 (same class of bug as the matrix-view dims; see ffi.ts). */
    setSeed(seed: bigint | number): void;
}
