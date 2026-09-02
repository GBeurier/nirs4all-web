/* tslint:disable */
/* eslint-disable */

/**
 * A fully validated, single-model Methods Archive V2 projection.
 */
export class ValidatedMethodsArchiveV2 {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Bind authoritative Methods/WASM inspection fields to the inventoried
     * N4MM bytes and return DAG-ML's typed descriptor JSON.
     *
     * The public JavaScript facade obtains these primitive fields only from
     * `@nirs4all/methods.inspectN4mm`. Core supplies the artifact hash and
     * controller from the validated archive, while DAG-ML owns all pure
     * controller/algorithm/capability/dimension policy and TCV1 identity.
     */
    bind_inspected_native_predictor_v1(inspection_schema_version: number, format_version: number, writer_abi_major: number, writer_abi_minor: number, writer_abi_patch: number, storage_algorithm: number, training_samples: bigint, n_features: number, n_targets: number, n_components: number, capabilities: bigint): string;
    model_bytes(): Uint8Array;
    /**
     * Validate through Core before returning any package or model bytes.
     */
    constructor(archive_bytes: Uint8Array);
    package_json(): string;
    target_names_json(): string;
    readonly abi_min_minor: number;
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
    readonly validatedmethodsarchivev2_abi_min_minor: (a: number) => number;
    readonly validatedmethodsarchivev2_archive_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_archive_sha256: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_artifact_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_bind_inspected_native_predictor_v1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number, k: number, l: bigint) => [number, number, number, number];
    readonly validatedmethodsarchivev2_binding_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_model_bytes: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_new: (a: number, b: number) => [number, number, number];
    readonly validatedmethodsarchivev2_node_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_package_json: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_port_name: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_target_names_json: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
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
