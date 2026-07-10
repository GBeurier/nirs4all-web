/** Loose typing of the Emscripten module factory's runtime instance. */
export interface EmModule {
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    HEAPF64: Float64Array;
    _malloc(size: number): number;
    _free(ptr: number): void;
    ccall<T>(name: string, returnType: string | null, argTypes: string[], args: unknown[]): T;
    cwrap<T extends Function>(name: string, returnType: string | null, argTypes: string[]): T;
    UTF8ToString(ptr: number): string;
    stringToUTF8(s: string, ptr: number, max: number): void;
    lengthBytesUTF8(s: string): number;
    getValue(ptr: number, type: string): number;
    setValue(ptr: number, value: number, type: string): void;
}
/** Load and cache the Emscripten module. Call once at app startup. */
export declare function loadModule(): Promise<EmModule>;
export declare function getModule(): EmModule;
export declare function checkStatus(status: number, ctxPtr?: number): void;
export declare const MATRIX_VIEW_SIZE = 48;
/** Allocate a matrix-view struct and copy `data` into the WASM heap.
 *  Returns the view pointer; caller must `free()` it.
 *
 *  NOTE: n4m_matrix_view_init_rowmajor takes `int64_t rows, int64_t cols`.
 *  The WASM module is built with `-s WASM_BIGINT=1`, so ccall marshals i64
 *  args as BigInt — passing a plain JS number for these slots silently
 *  corrupts the struct fields (rows/cols/strides become garbage, producing
 *  ~1e32 numerics downstream) and on emsdk >= 5.0.7 throws
 *  "TypeError: Cannot convert N to a BigInt". We therefore declare the two
 *  dimension args as 'i64' and pass BigInt(...). The data/out/dtype slots
 *  stay 32-bit. dtype defaults to N4M_DTYPE_F64 (= 1; see types.ts Dtype). */
export declare function makeMatrixView(data: Float64Array, rows: number, cols: number, dtype?: number): {
    viewPtr: number;
    dataPtr: number;
    free: () => void;
};
/** Read a core-owned `n4m_array_t*` (e.g. from n4m_model_get_array) into a
 *  JS-owned Float64Array. Does NOT free the array — the caller must call
 *  `n4m_array_free` afterwards. i64 view fields (rows @8, cols @16) are read
 *  as BigInt under WASM_BIGINT and narrowed with Number(). */
export declare function readArrayView(arrPtr: number): {
    data: Float64Array;
    rows: number;
    cols: number;
};
