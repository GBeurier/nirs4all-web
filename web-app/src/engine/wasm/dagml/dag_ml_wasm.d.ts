/* tslint:disable */
/* eslint-disable */

export class LocalImplementationRegistry {
    free(): void;
    [Symbol.dispose](): void;
    bind_training_loss(node_task_json: string, role_index: number): TrainingLossBinding;
    clear(): void;
    descriptors_json(): string;
    constructor();
    register_loss(loss_reference_json: string, implementation: Function): void;
    register_metric(metric_reference_json: string, implementation: Function): void;
    resolve_loss(loss_reference_json: string): Function;
    resolve_metric(metric_reference_json: string): Function;
    resolve_training_loss(training_loss_role_json: string, phase: string): Function;
    toJSON(): any;
    unregister_loss(loss_reference_json: string): Function;
    unregister_metric(metric_reference_json: string): Function;
    readonly size: number;
}

export class TrainingLossBinding {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly invoke: Function;
    readonly required_attestation_json: string;
}

/**
 * Validate named source/sample coverage and return identity-only row indices.
 */
export function align_named_source_rows_json(request_json: string): string;

/**
 * Attach independently derived, target-free or external-test V2 cohort evidence.
 */
export function attach_predict_cohort_to_envelope_json(envelope_json: string, cohort_request_json: string): string;

/**
 * Assemble the canonical opaque payload set consumed by Core's bounded ZIP writer.
 */
export function build_archive_v2_native_portable_payloads_json(archive_id: string, outcome_json: string, package_json: string): string;

export function build_execution_plan_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string): string;

/**
 * Build an execution plan and lower an explicit set of native training-loss
 * roles into its node plans. The supplied set replaces every node's roles.
 */
export function build_execution_plan_with_training_losses_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string, training_loss_roles_json: string): string;

export function compile_pipeline_dsl_artifact_json(json: string): string;

export function compile_pipeline_dsl_artifact_with_controllers_json(dsl_json: string, controller_manifests_json: string): string;

export function compile_pipeline_dsl_graph_json(json: string): string;

export function contract_manifest_json(): string;

export function dag_ml_version(): string;

export function derive_controller_manifest_json(host_controller_spec_json: string): string;

export function derive_controller_manifest_list_json(host_controller_specs_json: string): string;

/**
 * Execute one phase of a campaign with the in-process [`SequentialScheduler`],
 * invoking host operators through the supplied JS callback.
 *
 * - `graph_json` / `campaign_json` / `controller_manifests_json`: the same
 *   inputs as [`build_execution_plan_json`]. The campaign's
 *   `split_invocation.fold_set` drives the FIT_CV fold loop.
 * - `js_invoke`: `(controllerId: string, taskJson: string, exactSeed: string | null)
 *   => nodeResultJson: string`, **synchronous** (no `await` across this boundary).
 *   A callback may return `lineage.seed: null`; the bridge injects the native
 *   `u64` from the task before scheduler validation.
 *
 * Returns the phase's `Vec<NodeResult>` as JSON (predictions + lineage).
 */
export function execute_campaign_phase_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string, run_id: string, root_seed: number, phase: string, js_invoke: Function): string;

export function execute_campaign_phase_u64_json(plan_id: string, graph_json: string, campaign_json: string, controller_manifests_json: string, run_id: string, root_seed: string, phase: string, js_invoke: Function): string;

/**
 * Execute one phase from a previously built and validated execution plan.
 *
 * Unlike [`execute_campaign_phase_json`], this preserves native training-loss
 * roles already lowered into `NodePlan.training_losses`. Every embedded
 * controller manifest must exactly match the independently supplied trusted
 * runtime registry before any callback is dispatched.
 */
export function execute_execution_plan_phase_json(execution_plan_json: string, trusted_controller_manifests_json: string, run_id: string, root_seed: number, phase: string, js_invoke: Function): string;

/**
 * Full-width seed variant for JavaScript hosts. Pass an exact decimal u64 string.
 */
export function execute_execution_plan_phase_u64_json(execution_plan_json: string, trusted_controller_manifests_json: string, run_id: string, root_seed: string, phase: string, js_invoke: Function): string;

/**
 * Execute a no-splitter REFIT once and return the closed package and node evidence.
 * The synchronous JS callback owns host-sidecar operator state by artifact ID.
 */
export function execute_initial_full_refit_json(plan_json: string, trusted_controller_manifests_json: string, envelope_json: string, training_sample_ids_json: string, package_id: string, run_id: string, root_seed: string, js_invoke: Function): string;

/**
 * Execute native CV/SELECT/REFIT and capture a self-contained predictor package.
 * This synchronous lane derives influence in the core and requires every
 * fitted artifact to be native-portable. Caller-owned controllers are closed
 * by the caller, including after an exception. Exact JSON strings preserve u64.
 */
export function execute_training_json(request_json: string, data_envelopes_json: string, relations_json: string, package_id: string, outcome_id: string, run_id: string, bundle_id: string, js_invoke: Function): string;

export function fold_set_fingerprint_json(json: string): string;

/**
 * Build a native group-disjoint FoldSet from explicit sample -> group identities.
 * No group inference, clipping, randomization or feature values occur in the binding.
 */
export function group_kfold_split_json(spec_json: string, sample_groups_json: string, id: string): string;

/**
 * Evaluate one FIT_CV fold only, then return to the browser coordinator for
 * its optimizer's prune decision before any later fold is dispatched.
 */
export function host_hpo_evaluate_worker_fold_json(task_json: string, fold_index: number, trusted_controller_manifests_json: string, data_envelope_json: string, request_json: string, js_invoke: Function): string;

/**
 * Evaluate one candidate inside its own Web Worker/WASM instance. The
 * browser's dispatcher sends the serialized `HostHpoWorkerTask` to a worker,
 * which invokes this function with its local synchronous controller callback.
 */
export function host_hpo_evaluate_worker_task_json(task_json: string, trusted_controller_manifests_json: string, data_envelope_json: string, request_json: string, js_invoke: Function): string;

/**
 * Run one-worker host HPO with native fold scoring, pruning and durable
 * checkpoint transitions. Both callbacks are synchronous: the controller is
 * `(controllerId, taskJson, exactSeed) => nodeResultJson`; the optimizer is
 * `(operation, payloadJson) => replyJson` (see README). The browser persists
 * its own optimizer state and native checkpoint before returning from each
 * `prepare_terminal`/`checkpoint` callback.
 */
export function host_hpo_search_json(execution_plan_json: string, trusted_controller_manifests_json: string, data_envelope_json: string, request_json: string, checkpoint_json: string | null | undefined, js_invoke: Function, js_optimizer: Function): string;

/**
 * Run a true browser worker window: dispatch every candidate before awaiting
 * any Promise, then reconcile results with native core in trial order. The
 * dispatcher has shape `(taskJson) => Promise<workerResultJson>`; each worker
 * owns a separate WASM instance and invokes `host_hpo_evaluate_worker_task_json`.
 * The existing synchronous `host_hpo_search_json` remains available.
 */
export function host_hpo_search_parallel_json(execution_plan_json: string, trusted_controller_manifests_json: string, data_envelope_json: string, request_json: string, checkpoint_json: string | null | undefined, max_workers: number, js_dispatch: Function, js_optimizer: Function): Promise<string>;

/**
 * Attach a new V2 PREDICT cohort to the package's signed training envelope.
 */
export function initial_full_refit_predict_envelope_json(package_json: string, cohort_json: string): string;

/**
 * Build a K-fold `FoldSet` from a `KFoldSpec` JSON + a JSON array of sample ids.
 * dag-ml owns the split — the host stops building folds itself.
 */
export function kfold_split_json(spec_json: string, sample_ids_json: string, id: string): string;

export function loss_execution_attestation_json(training_loss_role_json: string, phase: string): string;

/**
 * One HostControllerSpec per graph role of an n4m method manifest
 * (`n4m_method_manifest_json`).
 */
export function n4m_host_controller_specs_json(manifest_json: string): string;

/**
 * Sign a descriptor whose native facts were inspected by the owning bridge.
 * Consumers must reinspect N4ME bytes before accepting this descriptor.
 */
export function native_estimator_descriptor_json(json: string): string;

/**
 * Validate a browser-persisted prepared terminal and seal interrupted trials
 * before resuming search. This is the same recovery contract as PyO3/C ABI.
 */
export function recover_host_hpo_checkpoint_json(checkpoint_json: string, prepared_json: string, interrupted_json: string): string;

/**
 * Replay selected package outputs on a fresh V2 cohort without training.
 * Raw native payloads are hydrated from the package; host sidecars use exact
 * caller-owned artifact handles registered for this invocation only.
 */
export function replay_initial_full_refit_json(package_json: string, envelope_json: string, output_ids_json: string, artifact_handles_json: string, run_id: string, js_invoke: Function): string;

/**
 * Replay a detached native-portable package; the core hydrates and releases
 * RAW artifacts for this invocation, including on failed prediction.
 * The trusted runtime manifests must match the package before any callback.
 */
export function replay_training_package_json(package_json: string, request_json: string, data_envelopes_json: string, trusted_controller_manifests_json: string, outcome_id: string, run_id: string, js_invoke: Function): string;

export function sample_relation_set_fingerprint_json(json: string): string;

/**
 * Rank candidate variants and return the winner — the SELECT phase for in-browser
 * generators/finetune. Selection stays in dag-ml (deterministic argmin/argmax +
 * id tie-break), not the host. `policy_json` = SelectionPolicy, `candidates_json`
 * = `CandidateScore` array. With `groups_json` (group id to candidate ids) returns a
 * {group → SelectionDecision} map; otherwise a single SelectionDecision.
 */
export function select_candidates_json(policy_json: string, candidates_json: string, groups_json?: string | null): string;

/**
 * Resolve one explicitly named output of a signed portable package.
 */
export function select_portable_output_json(package_json: string, binding_id: string): string;

/**
 * Select a CV fold for stacking test predictions from validation scores.
 */
export function select_stacking_fold_json(request_json: string): string;

/**
 * Select stacking producers from validation scores with the native policy.
 */
export function select_stacking_producers_json(request_json: string): string;

export function sign_training_replay_request_json(json: string): string;

/**
 * Sign an unsigned declaration using the same TCV1 contract as Python/C ABI.
 * Fingerprints are content seals, not cryptographic authorization signatures.
 */
export function sign_training_request_json(json: string): string;

/**
 * Objective-aware normalized CV-fold weights for stacking test predictions.
 */
export function stacking_fold_weights_json(request_json: string): string;

/**
 * Build a stratified K-fold `FoldSet`: same OOF-once guarantee as K-fold, but
 * balanced by a per-sample class label. `strata_json` is a JSON object mapping
 * sample id → class label (identity-keyed metadata, never feature values).
 */
export function stratified_kfold_split_json(spec_json: string, sample_ids_json: string, strata_json: string, id: string): string;

/**
 * Derive an identity from an attested binding/envelope, without host hashing.
 */
export function training_data_identity_json(binding_json: string, envelope_json: string): string;

/**
 * Validate opaque archive members before replay can invoke a controller.
 */
export function validate_archive_v2_portable_payloads_json(manifest_json: string, package_json: string, members_json: string): string;

export function validate_campaign_json(json: string): void;

export function validate_controller_manifest_json(json: string): void;

export function validate_controller_manifest_list_json(json: string): void;

export function validate_execution_bundle_json(json: string): void;

export function validate_execution_plan_json(json: string): void;

export function validate_fold_set_json(json: string): void;

export function validate_graph_json(json: string): void;

/**
 * Validate a signed no-splitter REFIT package before any host operator callback.
 */
export function validate_initial_full_refit_package_json(package_json: string): void;

export function validate_pipeline_dsl_json(json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_localimplementationregistry_free: (a: number, b: number) => void;
    readonly __wbg_traininglossbinding_free: (a: number, b: number) => void;
    readonly align_named_source_rows_json: (a: number, b: number) => [number, number, number, number];
    readonly attach_predict_cohort_to_envelope_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly build_archive_v2_native_portable_payloads_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly build_execution_plan_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly build_execution_plan_with_training_losses_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_artifact_json: (a: number, b: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_artifact_with_controllers_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly compile_pipeline_dsl_graph_json: (a: number, b: number) => [number, number, number, number];
    readonly contract_manifest_json: () => [number, number, number, number];
    readonly dag_ml_version: () => [number, number];
    readonly derive_controller_manifest_json: (a: number, b: number) => [number, number, number, number];
    readonly derive_controller_manifest_list_json: (a: number, b: number) => [number, number, number, number];
    readonly execute_campaign_phase_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: any) => [number, number, number, number];
    readonly execute_campaign_phase_u64_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: any) => [number, number, number, number];
    readonly execute_execution_plan_phase_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: any) => [number, number, number, number];
    readonly execute_execution_plan_phase_u64_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: any) => [number, number, number, number];
    readonly execute_initial_full_refit_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: any) => [number, number, number, number];
    readonly execute_training_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: any) => [number, number, number, number];
    readonly fold_set_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly group_kfold_split_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly host_hpo_evaluate_worker_fold_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: any) => [number, number, number, number];
    readonly host_hpo_evaluate_worker_task_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: any) => [number, number, number, number];
    readonly host_hpo_search_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: any, l: any) => [number, number, number, number];
    readonly host_hpo_search_parallel_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: any, m: any) => any;
    readonly initial_full_refit_predict_envelope_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly kfold_split_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly localimplementationregistry_bind_training_loss: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly localimplementationregistry_clear: (a: number) => void;
    readonly localimplementationregistry_descriptors_json: (a: number) => [number, number, number, number];
    readonly localimplementationregistry_new: () => number;
    readonly localimplementationregistry_register_loss: (a: number, b: number, c: number, d: any) => [number, number];
    readonly localimplementationregistry_register_metric: (a: number, b: number, c: number, d: any) => [number, number];
    readonly localimplementationregistry_resolve_loss: (a: number, b: number, c: number) => [number, number, number];
    readonly localimplementationregistry_resolve_metric: (a: number, b: number, c: number) => [number, number, number];
    readonly localimplementationregistry_resolve_training_loss: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly localimplementationregistry_size: (a: number) => number;
    readonly localimplementationregistry_toJSON: (a: number) => [number, number, number];
    readonly localimplementationregistry_unregister_loss: (a: number, b: number, c: number) => [number, number, number];
    readonly localimplementationregistry_unregister_metric: (a: number, b: number, c: number) => [number, number, number];
    readonly loss_execution_attestation_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly n4m_host_controller_specs_json: (a: number, b: number) => [number, number, number, number];
    readonly native_estimator_descriptor_json: (a: number, b: number) => [number, number, number, number];
    readonly recover_host_hpo_checkpoint_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly replay_initial_full_refit_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: any) => [number, number, number, number];
    readonly replay_training_package_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: any) => [number, number, number, number];
    readonly sample_relation_set_fingerprint_json: (a: number, b: number) => [number, number, number, number];
    readonly select_candidates_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly select_portable_output_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly select_stacking_fold_json: (a: number, b: number) => [number, number, number, number];
    readonly select_stacking_producers_json: (a: number, b: number) => [number, number, number, number];
    readonly sign_training_replay_request_json: (a: number, b: number) => [number, number, number, number];
    readonly sign_training_request_json: (a: number, b: number) => [number, number, number, number];
    readonly stacking_fold_weights_json: (a: number, b: number) => [number, number, number, number];
    readonly stratified_kfold_split_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly training_data_identity_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly traininglossbinding_invoke: (a: number) => any;
    readonly traininglossbinding_required_attestation_json: (a: number) => [number, number];
    readonly validate_archive_v2_portable_payloads_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly validate_campaign_json: (a: number, b: number) => [number, number];
    readonly validate_controller_manifest_json: (a: number, b: number) => [number, number];
    readonly validate_controller_manifest_list_json: (a: number, b: number) => [number, number];
    readonly validate_execution_bundle_json: (a: number, b: number) => [number, number];
    readonly validate_execution_plan_json: (a: number, b: number) => [number, number];
    readonly validate_fold_set_json: (a: number, b: number) => [number, number];
    readonly validate_graph_json: (a: number, b: number) => [number, number];
    readonly validate_initial_full_refit_package_json: (a: number, b: number) => [number, number];
    readonly validate_pipeline_dsl_json: (a: number, b: number) => [number, number];
    readonly wasm_bindgen_dfd0b53baa41d632___convert__closures_____invoke___js_sys_6314793ba421de9a___Function_fn_wasm_bindgen_dfd0b53baa41d632___JsValue_____wasm_bindgen_dfd0b53baa41d632___sys__Undefined___js_sys_6314793ba421de9a___Function_fn_wasm_bindgen_dfd0b53baa41d632___JsValue_____wasm_bindgen_dfd0b53baa41d632___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_dfd0b53baa41d632___convert__closures_____invoke___wasm_bindgen_dfd0b53baa41d632___JsValue__core_608f92abc48d28da___result__Result_____wasm_bindgen_dfd0b53baa41d632___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
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
