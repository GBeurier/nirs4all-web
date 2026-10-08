/* tslint:disable */
/* eslint-disable */

/**
 * Bounded browser writer over the canonical Core stored-ZIP implementation.
 */
export class ArchiveV2Builder {
    free(): void;
    [Symbol.dispose](): void;
    add_member(path: string, bytes: Uint8Array): void;
    finish(): Uint8Array;
    constructor(manifest_json: string);
}

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
    bind_inspected_native_predictor_v1(inspection_schema_version: number, format_version: number, writer_abi_major: number, writer_abi_minor: number, writer_abi_patch: number, storage_algorithm: number, training_samples: bigint, n_features: number, n_targets: number, n_components: number, capabilities: bigint, pipeline_present: boolean, pipeline_schema_version: number, pipeline_operator_count: number, pipeline_first_operator: number, pipeline_second_operator: number, savgol_window: number, savgol_poly_degree: number, savgol_derivative: number, pipeline_semantic_profile: number, savgol_delta: number, pipeline_raw_n_features: number, pipeline_model_n_features: number, pipeline_fingerprint_algorithm: number, pipeline_fingerprint: bigint, snv_axis: number, snv_with_mean: boolean, snv_with_std: boolean, snv_ddof: number, savgol_mode: number, savgol_cval: number): string;
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
    readonly format_version: number;
    readonly node_id: string;
    readonly port_name: string;
}

/**
 * Core-validated storage inventory, not a controller authorization.
 * DAG-ML must validate the opaque package/member links before replay.
 */
export class ValidatedPortableArchiveV2 {
    free(): void;
    [Symbol.dispose](): void;
    manifest_json(): string;
    member_bytes(path: string): Uint8Array;
    member_paths_json(): string;
    constructor(archive_bytes: Uint8Array);
    readonly archive_id: string;
    readonly archive_sha256: string;
}

export function calibrate_workflow_replay_json(source: string, replay: string, relations: string, truth: string, coverages: string, small_sample_policy: string): string;

export function calibrated_methods_points_json(_package: string, archive_sha: string, sample_ids: string, values: string, descriptor: string): string;

export function calibrated_prediction_json(_package: string, request: string, replay: string): string;

export function conformal_metrics_json(calibration: string, intervals: string, truth: string): string;

export function frozen_methods_points_json(_package: string, archive_sha: string, sample_ids: string, values: string, descriptor: string): string;

export function generate_variants_json(input: string): string;

/**
 * Validate the shared CPU/browser envelope in Rust before host presentation.
 * JSON fragments stay strings so JavaScript never rounds native uint64 seeds.
 */
export function native_pipeline_fragments_json(input: string): string;

/**
 * Resolve public PLS controls through the native owner before host parameter transport.
 */
export function pls_role_pipeline_contract_json(input: string): string;

export function project_training_predictions_json(outcome_json: string, dataset_label: string, task_type_label: string): string;

export function robustness_methods_points_json(_package: string, scenarios: string, points: string, truth: string): string;

export function robustness_report_json(_package: string, scenarios: string, replays: string, truth: string): string;

/**
 * Synchronous artifact hashing for native DAG controller callbacks.
 */
export function sha256_bytes(bytes: Uint8Array): string;

/**
 * Validate the complete native portable payload closure for any supported
 * DAG predictor profile, without selecting a host execution backend.
 */
export function validate_portable_archive_v2(bytes: Uint8Array): string;

export function validate_robustness_scenarios_json(scenarios: string): string;

export function validate_training_predictions_json(outcome_json: string, predictions_json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_archivev2builder_free: (a: number, b: number) => void;
    readonly __wbg_validatedmethodsarchivev2_free: (a: number, b: number) => void;
    readonly __wbg_validatedportablearchivev2_free: (a: number, b: number) => void;
    readonly archivev2builder_add_member: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly archivev2builder_finish: (a: number) => [number, number, number, number];
    readonly archivev2builder_new: (a: number, b: number) => [number, number, number];
    readonly calibrate_workflow_replay_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly calibrated_methods_points_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly calibrated_prediction_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly conformal_metrics_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly frozen_methods_points_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly generate_variants_json: (a: number, b: number) => [number, number, number, number];
    readonly native_pipeline_fragments_json: (a: number, b: number) => [number, number, number, number];
    readonly pls_role_pipeline_contract_json: (a: number, b: number) => [number, number, number, number];
    readonly project_training_predictions_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly robustness_methods_points_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly robustness_report_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly sha256_bytes: (a: number, b: number) => [number, number];
    readonly validate_portable_archive_v2: (a: number, b: number) => [number, number, number, number];
    readonly validate_robustness_scenarios_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_training_predictions_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly validatedmethodsarchivev2_abi_min_minor: (a: number) => number;
    readonly validatedmethodsarchivev2_archive_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_archive_sha256: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_artifact_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_bind_inspected_native_predictor_v1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint, i: number, j: number, k: number, l: bigint, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: bigint, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number) => [number, number, number, number];
    readonly validatedmethodsarchivev2_binding_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_format_version: (a: number) => number;
    readonly validatedmethodsarchivev2_model_bytes: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_new: (a: number, b: number) => [number, number, number];
    readonly validatedmethodsarchivev2_node_id: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_package_json: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_port_name: (a: number) => [number, number];
    readonly validatedmethodsarchivev2_target_names_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_archive_id: (a: number) => [number, number];
    readonly validatedportablearchivev2_archive_sha256: (a: number) => [number, number];
    readonly validatedportablearchivev2_manifest_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_member_bytes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly validatedportablearchivev2_member_paths_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_new: (a: number, b: number) => [number, number, number];
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
