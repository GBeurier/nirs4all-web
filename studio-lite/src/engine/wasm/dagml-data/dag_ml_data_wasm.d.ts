/* tslint:disable */
/* eslint-disable */

/**
 * Eager in-WASM provider over `dag-ml-data-provider`'s `InMemoryProvider`.
 *
 * JSON in, JSON out; handles cross as decimal strings (JS cannot represent the
 * full `u64` range as a number). Available only with the `provider` feature.
 */
export class WasmInMemoryProvider {
    free(): void;
    [Symbol.dispose](): void;
    data_feature_buffer_bindings(data_handle: string): string;
    feature_block(view_handle: string, feature_set_id: string): string;
    feature_buffer_manifests(): string;
    feature_collation(view_handle: string, selector_json: string): string;
    make_view(data_handle: string, view_json: string): string;
    materialize(request_json: string): string;
    constructor(envelope_json: string, target_tables_json?: string | null, feature_tables_json?: string | null, f64_feature_matrices_json?: string | null);
    release(handle: string): boolean;
    target_block(view_handle: string, target_id: string): string;
    view_identity(view_handle: string): string;
}

export function build_coordinator_data_plan_envelope_json(schema_json: string, data_plan_json: string, sample_relations_json?: string | null): string;

export function contract_manifest_json(): string;

export function dag_ml_data_version(): string;

export function data_plan_fingerprint_json(json: string): string;

export function dataset_schema_fingerprint_json(json: string): string;

export function fold_set_fingerprint_json(json: string): string;

export function plan_model_input_json(schema_json: string, model_input_json: string, adapter_registry_json: string, request_json: string): string;

export function sample_relation_table_fingerprint_json(json: string): string;

export function validate_adapter_registry_json(json: string): void;

export function validate_coordinator_data_plan_envelope_json(json: string): void;

export function validate_data_plan_json(json: string): void;

export function validate_dataset_schema_json(json: string): void;

export function validate_fold_set_against_sample_relations_json(fold_set_json: string, sample_relations_json: string): void;

export function validate_fold_set_json(json: string): void;

export function validate_model_input_spec_json(json: string): void;

export function validate_sample_relation_table_json(json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasminmemoryprovider_free: (a: number, b: number) => void;
    readonly build_coordinator_data_plan_envelope_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly contract_manifest_json: () => [number, number, number, number];
    readonly dag_ml_data_version: () => [number, number];
    readonly data_plan_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly dataset_schema_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly fold_set_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly plan_model_input_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly sample_relation_table_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_adapter_registry_json: (a: number, b: number) => [number, number];
    readonly validate_coordinator_data_plan_envelope_json: (a: number, b: number) => [number, number];
    readonly validate_data_plan_json: (a: number, b: number) => [number, number];
    readonly validate_dataset_schema_json: (a: number, b: number) => [number, number];
    readonly validate_fold_set_against_sample_relations_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly validate_fold_set_json: (a: number, b: number) => [number, number];
    readonly validate_model_input_spec_json: (a: number, b: number) => [number, number];
    readonly validate_sample_relation_table_json: (a: number, b: number) => [number, number];
    readonly wasminmemoryprovider_data_feature_buffer_bindings: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasminmemoryprovider_feature_block: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasminmemoryprovider_feature_buffer_manifests: (a: number) => [number, number, number, number];
    readonly wasminmemoryprovider_feature_collation: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasminmemoryprovider_make_view: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasminmemoryprovider_materialize: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasminmemoryprovider_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasminmemoryprovider_release: (a: number, b: number, c: number) => [number, number, number];
    readonly wasminmemoryprovider_target_block: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasminmemoryprovider_view_identity: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
