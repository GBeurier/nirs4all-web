/* tslint:disable */
/* eslint-disable */

export function build_execution_plan_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string): string;

export function compile_pipeline_dsl_artifact_json(json: string): string;

export function compile_pipeline_dsl_artifact_with_controllers_json(dsl_json: string, controller_manifests_json: string): string;

export function compile_pipeline_dsl_graph_json(json: string): string;

export function contract_manifest_json(): string;

export function dag_ml_version(): string;

/**
 * Execute one phase of a campaign with the in-process [`SequentialScheduler`],
 * invoking host operators through the supplied JS callback.
 *
 * - `graph_json` / `campaign_json` / `controller_manifests_json`: the same
 *   inputs as [`build_execution_plan_json`]. The campaign's
 *   `split_invocation.fold_set` drives the FIT_CV fold loop.
 * - `js_invoke`: `(controllerId: string, taskJson: string) => nodeResultJson: string`,
 *   **synchronous** (no `await` across this boundary).
 *
 * Returns the phase's `Vec<NodeResult>` as JSON (predictions + lineage).
 */
export function execute_campaign_phase_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string, run_id: string, root_seed: number, phase: string, js_invoke: Function): string;

export function fold_set_fingerprint_json(json: string): string;

/**
 * Build a K-fold `FoldSet` from a `KFoldSpec` JSON + a JSON array of sample ids.
 * dag-ml owns the split — the host stops building folds itself.
 */
export function kfold_split_json(spec_json: string, sample_ids_json: string, id: string): string;

/**
 * Build a stratified K-fold `FoldSet`: same OOF-once guarantee as K-fold, but
 * balanced by a per-sample class label. `strata_json` is a JSON object mapping
 * sample id → class label (identity-keyed metadata, never feature values).
 */
export function stratified_kfold_split_json(spec_json: string, sample_ids_json: string, strata_json: string, id: string): string;

export function validate_campaign_json(json: string): void;

export function validate_controller_manifest_json(json: string): void;

export function validate_controller_manifest_list_json(json: string): void;

export function validate_execution_bundle_json(json: string): void;

export function validate_execution_plan_json(json: string): void;

export function validate_fold_set_json(json: string): void;

export function validate_graph_json(json: string): void;

export function validate_pipeline_dsl_json(json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_execution_plan_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_artifact_json: (a: number, b: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_artifact_with_controllers_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_graph_json: (a: number, b: number) => [number, number, number, number];
    readonly contract_manifest_json: () => [number, number, number, number];
    readonly dag_ml_version: () => [number, number];
    readonly execute_campaign_phase_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: any) => [number, number, number, number];
    readonly fold_set_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly kfold_split_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly stratified_kfold_split_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly validate_campaign_json: (a: number, b: number) => [number, number];
    readonly validate_controller_manifest_json: (a: number, b: number) => [number, number];
    readonly validate_controller_manifest_list_json: (a: number, b: number) => [number, number];
    readonly validate_execution_bundle_json: (a: number, b: number) => [number, number];
    readonly validate_execution_plan_json: (a: number, b: number) => [number, number];
    readonly validate_fold_set_json: (a: number, b: number) => [number, number];
    readonly validate_graph_json: (a: number, b: number) => [number, number];
    readonly validate_pipeline_dsl_json: (a: number, b: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
