/* tslint:disable */
/* eslint-disable */

export class CnnRegressor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Weights and scaling, for the controller's fitted state.
     */
    export_state(): Uint8Array;
    /**
     * `x`: row-major `rows × cols` features (blocks concatenated in branch order); `y`: one target per row.
     */
    fit(x: Float64Array | number[], rows: number, cols: number, y: Float64Array | number[]): void;
    static from_state(bytes: Uint8Array | number[]): CnnRegressor;
    constructor(config_json: string);
    /**
     * Predictions in target units.
     */
    predict(x: Float64Array | number[], rows: number, cols: number): Float64Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_cnnregressor_free: (a: number, b: number) => void;
    readonly cnnregressor_export_state: (a: number) => [number, number, number, number];
    readonly cnnregressor_fit: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly cnnregressor_from_state: (a: number, b: number) => [number, number, number];
    readonly cnnregressor_new: (a: number, b: number) => [number, number, number];
    readonly cnnregressor_predict: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
