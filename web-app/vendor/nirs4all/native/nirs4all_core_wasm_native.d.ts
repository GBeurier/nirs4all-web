/* tslint:disable */
/* eslint-disable */

/**
 * A fully validated, single-model Methods Archive V2 projection.
 */
export class ValidatedMethodsArchiveV2 {
    free(): void;
    [Symbol.dispose](): void;
    model_bytes(): Uint8Array;
    /**
     * Validate through Core before returning any package or model bytes.
     */
    constructor(archive_bytes: Uint8Array);
    package_json(): string;
    target_names_json(): string;
    readonly archive_id: string;
    readonly archive_sha256: string;
    readonly artifact_id: string;
    readonly binding_id: string;
    readonly node_id: string;
    readonly port_name: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_validatedmethodsarchivev2_free: (a: number, b: number) => void;
    readonly validatedmethodsarchivev2_archive_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_archive_sha256: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_artifact_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_binding_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_model_bytes: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_new: (a: number, b: number) => [number, number, number];
    readonly validatedmethodsarchivev2_node_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_package_json: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_port_name: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_target_names_json: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
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
