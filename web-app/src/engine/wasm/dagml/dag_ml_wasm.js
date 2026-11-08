/* @ts-self-types="./dag_ml_wasm.d.ts" */

export class LocalImplementationRegistry {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LocalImplementationRegistryFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_localimplementationregistry_free(ptr, 0);
    }
    /**
     * @param {string} node_task_json
     * @param {number} role_index
     * @returns {TrainingLossBinding}
     */
    bind_training_loss(node_task_json, role_index) {
        const ret = wasm.localimplementationregistry_bind_training_loss(this.__wbg_ptr, node_task_json, role_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TrainingLossBinding.__wrap(ret[0]);
    }
    clear() {
        wasm.localimplementationregistry_clear(this.__wbg_ptr);
    }
    /**
     * @returns {string}
     */
    descriptors_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.localimplementationregistry_descriptors_json(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    constructor() {
        const ret = wasm.localimplementationregistry_new();
        this.__wbg_ptr = ret;
        LocalImplementationRegistryFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} loss_reference_json
     * @param {Function} implementation
     */
    register_loss(loss_reference_json, implementation) {
        const ret = wasm.localimplementationregistry_register_loss(this.__wbg_ptr, loss_reference_json, implementation);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} metric_reference_json
     * @param {Function} implementation
     */
    register_metric(metric_reference_json, implementation) {
        const ret = wasm.localimplementationregistry_register_metric(this.__wbg_ptr, metric_reference_json, implementation);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} loss_reference_json
     * @returns {Function}
     */
    resolve_loss(loss_reference_json) {
        const ret = wasm.localimplementationregistry_resolve_loss(this.__wbg_ptr, loss_reference_json);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} metric_reference_json
     * @returns {Function}
     */
    resolve_metric(metric_reference_json) {
        const ret = wasm.localimplementationregistry_resolve_metric(this.__wbg_ptr, metric_reference_json);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} training_loss_role_json
     * @param {string} phase
     * @returns {Function}
     */
    resolve_training_loss(training_loss_role_json, phase) {
        const ret = wasm.localimplementationregistry_resolve_training_loss(this.__wbg_ptr, training_loss_role_json, phase);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {number}
     */
    get size() {
        const ret = wasm.localimplementationregistry_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {any}
     */
    toJSON() {
        const ret = wasm.localimplementationregistry_toJSON(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} loss_reference_json
     * @returns {Function}
     */
    unregister_loss(loss_reference_json) {
        const ret = wasm.localimplementationregistry_unregister_loss(this.__wbg_ptr, loss_reference_json);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} metric_reference_json
     * @returns {Function}
     */
    unregister_metric(metric_reference_json) {
        const ret = wasm.localimplementationregistry_unregister_metric(this.__wbg_ptr, metric_reference_json);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) LocalImplementationRegistry.prototype[Symbol.dispose] = LocalImplementationRegistry.prototype.free;

export class TrainingLossBinding {
    static __wrap(ptr) {
        const obj = Object.create(TrainingLossBinding.prototype);
        obj.__wbg_ptr = ptr;
        TrainingLossBindingFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TrainingLossBindingFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_traininglossbinding_free(ptr, 0);
    }
    /**
     * @returns {Function}
     */
    get invoke() {
        const ret = wasm.traininglossbinding_invoke(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get required_attestation_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.traininglossbinding_required_attestation_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) TrainingLossBinding.prototype[Symbol.dispose] = TrainingLossBinding.prototype.free;

/**
 * Aggregate observation-level predictions to physical samples with an
 * existing `AggregationPolicy` and the attested sample relations.
 * @param {string} block_json
 * @param {string} relations_json
 * @param {string} policy_json
 * @param {string} requested_sample_order_json
 * @returns {string}
 */
export function aggregate_observation_predictions_json(block_json, relations_json, policy_json, requested_sample_order_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.aggregate_observation_predictions_json(block_json, relations_json, policy_json, requested_sample_order_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Validate named source/sample coverage and return identity-only row indices.
 * @param {string} request_json
 * @returns {string}
 */
export function align_named_source_rows_json(request_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.align_named_source_rows_json(request_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Attach independently derived, target-free or external-test V2 cohort evidence.
 * @param {string} envelope_json
 * @param {string} cohort_request_json
 * @returns {string}
 */
export function attach_predict_cohort_to_envelope_json(envelope_json, cohort_request_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.attach_predict_cohort_to_envelope_json(envelope_json, cohort_request_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} plan_id
 * @param {string} graph_json
 * @param {string} campaign_json
 * @param {string} controller_manifests_json
 * @returns {string}
 */
export function build_execution_plan_json(plan_id, graph_json, campaign_json, controller_manifests_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.build_execution_plan_json(plan_id, graph_json, campaign_json, controller_manifests_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Build an execution plan and lower an explicit set of native training-loss
 * roles into its node plans. The supplied set replaces every node's roles.
 * @param {string} plan_id
 * @param {string} graph_json
 * @param {string} campaign_json
 * @param {string} controller_manifests_json
 * @param {string} training_loss_roles_json
 * @returns {string}
 */
export function build_execution_plan_with_training_losses_json(plan_id, graph_json, campaign_json, controller_manifests_json, training_loss_roles_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.build_execution_plan_with_training_losses_json(plan_id, graph_json, campaign_json, controller_manifests_json, training_loss_roles_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 * @returns {string}
 */
export function compile_pipeline_dsl_artifact_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.compile_pipeline_dsl_artifact_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} dsl_json
 * @param {string} controller_manifests_json
 * @returns {string}
 */
export function compile_pipeline_dsl_artifact_with_controllers_json(dsl_json, controller_manifests_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.compile_pipeline_dsl_artifact_with_controllers_json(dsl_json, controller_manifests_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 * @returns {string}
 */
export function compile_pipeline_dsl_graph_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.compile_pipeline_dsl_graph_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function contract_manifest_json() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.contract_manifest_json();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function dag_ml_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.dag_ml_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} host_controller_spec_json
 * @returns {string}
 */
export function derive_controller_manifest_json(host_controller_spec_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.derive_controller_manifest_json(host_controller_spec_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} host_controller_specs_json
 * @returns {string}
 */
export function derive_controller_manifest_list_json(host_controller_specs_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.derive_controller_manifest_list_json(host_controller_specs_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Narrow a host-supplied `FoldSet` by removing target-missing samples (JSON array of ids) from
 * its universe, folds and groups and declaring them in `target_missing_sample_ids`. A fold that
 * loses all of its validation or training samples is refused with a `target_missing_exclusion`
 * error instead of being emitted.
 * @param {string} fold_set_json
 * @param {string} target_missing_json
 * @returns {string}
 */
export function exclude_target_missing_json(fold_set_json, target_missing_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.exclude_target_missing_json(fold_set_json, target_missing_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

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
 * @param {string} plan_id
 * @param {string} graph_json
 * @param {string} campaign_json
 * @param {string} controller_manifests_json
 * @param {string} run_id
 * @param {number} root_seed
 * @param {string} phase
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_campaign_phase_json(plan_id, graph_json, campaign_json, controller_manifests_json, run_id, root_seed, phase, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_campaign_phase_json(plan_id, graph_json, campaign_json, controller_manifests_json, run_id, root_seed, phase, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} plan_id
 * @param {string} graph_json
 * @param {string} campaign_json
 * @param {string} controller_manifests_json
 * @param {string} run_id
 * @param {string} root_seed
 * @param {string} phase
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_campaign_phase_u64_json(plan_id, graph_json, campaign_json, controller_manifests_json, run_id, root_seed, phase, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_campaign_phase_u64_json(plan_id, graph_json, campaign_json, controller_manifests_json, run_id, root_seed, phase, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Execute one phase from a previously built and validated execution plan.
 *
 * Unlike [`execute_campaign_phase_json`], this preserves native training-loss
 * roles already lowered into `NodePlan.training_losses`. Every embedded
 * controller manifest must exactly match the independently supplied trusted
 * runtime registry before any callback is dispatched.
 * @param {string} execution_plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} run_id
 * @param {number} root_seed
 * @param {string} phase
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_execution_plan_phase_json(execution_plan_json, trusted_controller_manifests_json, run_id, root_seed, phase, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_execution_plan_phase_json(execution_plan_json, trusted_controller_manifests_json, run_id, root_seed, phase, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Full-width seed variant for JavaScript hosts. Pass an exact decimal u64 string.
 * @param {string} execution_plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} run_id
 * @param {string} root_seed
 * @param {string} phase
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_execution_plan_phase_u64_json(execution_plan_json, trusted_controller_manifests_json, run_id, root_seed, phase, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_execution_plan_phase_u64_json(execution_plan_json, trusted_controller_manifests_json, run_id, root_seed, phase, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Execute FIT_CV of a built plan against an attested data envelope.
 *
 * The envelope's coordinator relations make native observation-to-sample
 * aggregation, cross-fold OOF scoring and the returned `ScoreSet` available to
 * hosts whose controllers emit observation-level predictions. `variant_id`
 * must name one plan variant; the run context is scoped to it.
 * @param {string} execution_plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} envelope_json
 * @param {string} variant_id
 * @param {string} run_id
 * @param {string} root_seed
 * @param {string} phase
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_execution_plan_phase_with_envelope_json(execution_plan_json, trusted_controller_manifests_json, envelope_json, variant_id, run_id, root_seed, phase, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_execution_plan_phase_with_envelope_json(execution_plan_json, trusted_controller_manifests_json, envelope_json, variant_id, run_id, root_seed, phase, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Execute a no-splitter REFIT once and return the closed package and node evidence.
 * The synchronous JS callback owns host-sidecar operator state by artifact ID.
 * @param {string} plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} envelope_json
 * @param {string} training_sample_ids_json
 * @param {string} package_id
 * @param {string} run_id
 * @param {string} root_seed
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_initial_full_refit_json(plan_json, trusted_controller_manifests_json, envelope_json, training_sample_ids_json, package_id, run_id, root_seed, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_initial_full_refit_json(plan_json, trusted_controller_manifests_json, envelope_json, training_sample_ids_json, package_id, run_id, root_seed, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run `execute_nested_selection` with JS controllers in the same worker.
 * `trusted_controller_manifests_json` resolves the request's graph nodes and
 * registers one bridge controller per manifest; `js_invoke` is
 * `(controllerId, taskJson, exactSeed) => nodeResultJson`. The envelope must
 * attest the request campaign's data bindings. The optional `js_metrics`
 * computes the selection and pooled metrics (`mse`, `rmse`, `mae`); without
 * it the DAG-ML metric registry is used. Returns the outcome JSON.
 * @param {string} request_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} data_envelope_json
 * @param {Function} js_invoke
 * @param {Function | null} [js_metrics]
 * @returns {string}
 */
export function execute_nested_selection_json(request_json, trusted_controller_manifests_json, data_envelope_json, js_invoke, js_metrics) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_nested_selection_json(request_json, trusted_controller_manifests_json, data_envelope_json, js_invoke, isLikeNone(js_metrics) ? 0 : addToExternrefTable0(js_metrics));
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Execute native CV/SELECT/REFIT and capture a self-contained predictor package.
 * This synchronous lane derives influence in the core and requires every
 * fitted artifact to be native-portable. Caller-owned controllers are closed
 * by the caller, including after an exception. Exact JSON strings preserve u64.
 * @param {string} request_json
 * @param {string} data_envelopes_json
 * @param {string} relations_json
 * @param {string} package_id
 * @param {string} outcome_id
 * @param {string} run_id
 * @param {string} bundle_id
 * @param {Function} js_invoke
 * @returns {string}
 */
export function execute_training_json(request_json, data_envelopes_json, relations_json, package_id, outcome_id, run_id, bundle_id, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.execute_training_json(request_json, data_envelopes_json, relations_json, package_id, outcome_id, run_id, bundle_id, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 * @returns {string}
 */
export function fold_set_fingerprint_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.fold_set_fingerprint_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Build a native group-disjoint FoldSet from explicit candidate ids and sample -> group identities.
 * No group inference, clipping, randomization or feature values occur in the binding.
 * `sample_ids_json` is a JSON array of candidate ids. Groups are required only for target-observed
 * candidates; groups outside the candidates are refused. `target_missing_json` behaves as in
 * [`kfold_split_json`]; any groups supplied for those missing candidates are ignored.
 * @param {string} spec_json
 * @param {string} sample_ids_json
 * @param {string} sample_groups_json
 * @param {string} id
 * @param {string | null} [target_missing_json]
 * @returns {string}
 */
export function group_kfold_split_json(spec_json, sample_ids_json, sample_groups_json, id, target_missing_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.group_kfold_split_json(spec_json, sample_ids_json, sample_groups_json, id, isLikeNone(target_missing_json) ? 0 : addToExternrefTable0(target_missing_json));
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Evaluate one FIT_CV fold only, then return to the browser coordinator for
 * its optimizer's prune decision before any later fold is dispatched.
 * @param {string} task_json
 * @param {number} fold_index
 * @param {string} trusted_controller_manifests_json
 * @param {string} data_envelope_json
 * @param {string} request_json
 * @param {Function} js_invoke
 * @returns {string}
 */
export function host_hpo_evaluate_worker_fold_json(task_json, fold_index, trusted_controller_manifests_json, data_envelope_json, request_json, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.host_hpo_evaluate_worker_fold_json(task_json, fold_index, trusted_controller_manifests_json, data_envelope_json, request_json, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Evaluate one candidate inside its own Web Worker/WASM instance. The
 * browser's dispatcher sends the serialized `HostHpoWorkerTask` to a worker,
 * which invokes this function with its local synchronous controller callback.
 * @param {string} task_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} data_envelope_json
 * @param {string} request_json
 * @param {Function} js_invoke
 * @returns {string}
 */
export function host_hpo_evaluate_worker_task_json(task_json, trusted_controller_manifests_json, data_envelope_json, request_json, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.host_hpo_evaluate_worker_task_json(task_json, trusted_controller_manifests_json, data_envelope_json, request_json, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run one-worker host HPO with native fold scoring, pruning and durable
 * checkpoint transitions. Both callbacks are synchronous: the controller is
 * `(controllerId, taskJson, exactSeed) => nodeResultJson`; the optimizer is
 * `(operation, payloadJson) => replyJson` (see README). The browser persists
 * its own optimizer state and native checkpoint before returning from each
 * `prepare_terminal`/`checkpoint` callback.
 * @param {string} execution_plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} data_envelope_json
 * @param {string} request_json
 * @param {string | null | undefined} checkpoint_json
 * @param {Function} js_invoke
 * @param {Function} js_optimizer
 * @returns {string}
 */
export function host_hpo_search_json(execution_plan_json, trusted_controller_manifests_json, data_envelope_json, request_json, checkpoint_json, js_invoke, js_optimizer) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.host_hpo_search_json(execution_plan_json, trusted_controller_manifests_json, data_envelope_json, request_json, isLikeNone(checkpoint_json) ? 0 : addToExternrefTable0(checkpoint_json), js_invoke, js_optimizer);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run a true browser worker window: dispatch every candidate before awaiting
 * any Promise, then reconcile results with native core in trial order. The
 * dispatcher has shape `(taskJson) => Promise<workerResultJson>`; each worker
 * owns a separate WASM instance and invokes `host_hpo_evaluate_worker_task_json`.
 * The existing synchronous `host_hpo_search_json` remains available.
 * @param {string} execution_plan_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} data_envelope_json
 * @param {string} request_json
 * @param {string | null | undefined} checkpoint_json
 * @param {number} max_workers
 * @param {Function} js_dispatch
 * @param {Function} js_optimizer
 * @returns {Promise<string>}
 */
export function host_hpo_search_parallel_json(execution_plan_json, trusted_controller_manifests_json, data_envelope_json, request_json, checkpoint_json, max_workers, js_dispatch, js_optimizer) {
    const ret = wasm.host_hpo_search_parallel_json(execution_plan_json, trusted_controller_manifests_json, data_envelope_json, request_json, isLikeNone(checkpoint_json) ? 0 : addToExternrefTable0(checkpoint_json), max_workers, js_dispatch, js_optimizer);
    return ret;
}

/**
 * Attach a new V2 PREDICT cohort to the package's signed training envelope.
 * @param {string} package_json
 * @param {string} cohort_json
 * @returns {string}
 */
export function initial_full_refit_predict_envelope_json(package_json, cohort_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.initial_full_refit_predict_envelope_json(package_json, cohort_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Build a K-fold `FoldSet` from a `KFoldSpec` JSON + a JSON array of sample ids.
 * dag-ml owns the split — the host stops building folds itself.
 *
 * `target_missing_json` (optional JSON array of sample ids) names samples whose target is
 * missing: they are kept out of every fold and declared in the returned
 * `FoldSet.target_missing_sample_ids`, so they never train or get scored but stay eligible for
 * PREDICT. Too few target-observed samples is refused with a `target_missing_exclusion` error.
 * @param {string} spec_json
 * @param {string} sample_ids_json
 * @param {string} id
 * @param {string | null} [target_missing_json]
 * @returns {string}
 */
export function kfold_split_json(spec_json, sample_ids_json, id, target_missing_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.kfold_split_json(spec_json, sample_ids_json, id, isLikeNone(target_missing_json) ? 0 : addToExternrefTable0(target_missing_json));
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} training_loss_role_json
 * @param {string} phase
 * @returns {string}
 */
export function loss_execution_attestation_json(training_loss_role_json, phase) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.loss_execution_attestation_json(training_loss_role_json, phase);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * One HostControllerSpec per graph role of an n4m method manifest
 * (`n4m_method_manifest_json`).
 * @param {string} manifest_json
 * @returns {string}
 */
export function n4m_host_controller_specs_json(manifest_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.n4m_host_controller_specs_json(manifest_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Sign a descriptor whose native facts were inspected by the owning bridge.
 * Consumers must reinspect N4ME bytes before accepting this descriptor.
 * @param {string} json
 * @returns {string}
 */
export function native_estimator_descriptor_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.native_estimator_descriptor_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Validate a browser-persisted prepared terminal and seal interrupted trials
 * before resuming search. This is the same recovery contract as PyO3/C ABI.
 * @param {string} checkpoint_json
 * @param {string} prepared_json
 * @param {string} interrupted_json
 * @returns {string}
 */
export function recover_host_hpo_checkpoint_json(checkpoint_json, prepared_json, interrupted_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.recover_host_hpo_checkpoint_json(checkpoint_json, prepared_json, interrupted_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Replay selected package outputs on a fresh V2 cohort without training.
 * Raw native payloads are hydrated from the package; host sidecars use exact
 * caller-owned artifact handles registered for this invocation only.
 * @param {string} package_json
 * @param {string} envelope_json
 * @param {string} output_ids_json
 * @param {string} artifact_handles_json
 * @param {string} run_id
 * @param {Function} js_invoke
 * @returns {string}
 */
export function replay_initial_full_refit_json(package_json, envelope_json, output_ids_json, artifact_handles_json, run_id, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.replay_initial_full_refit_json(package_json, envelope_json, output_ids_json, artifact_handles_json, run_id, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Replay a detached native-portable package; the core hydrates and releases
 * RAW artifacts for this invocation, including on failed prediction.
 * The trusted runtime manifests must match the package before any callback.
 * @param {string} package_json
 * @param {string} request_json
 * @param {string} data_envelopes_json
 * @param {string} trusted_controller_manifests_json
 * @param {string} outcome_id
 * @param {string} run_id
 * @param {Function} js_invoke
 * @returns {string}
 */
export function replay_training_package_json(package_json, request_json, data_envelopes_json, trusted_controller_manifests_json, outcome_id, run_id, js_invoke) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.replay_training_package_json(package_json, request_json, data_envelopes_json, trusted_controller_manifests_json, outcome_id, run_id, js_invoke);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 * @returns {string}
 */
export function sample_relation_set_fingerprint_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.sample_relation_set_fingerprint_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Score a sample-level prediction block against sample-level targets with the
 * named DAG metrics (mirrors `dagml_score_regression_prediction_block_json`).
 * @param {string} predictions_json
 * @param {string} targets_json
 * @param {string} metrics_json
 * @returns {string}
 */
export function score_regression_prediction_block_json(predictions_json, targets_json, metrics_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.score_regression_prediction_block_json(predictions_json, targets_json, metrics_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Rank candidate variants and return the winner — the SELECT phase for in-browser
 * generators/finetune. Selection stays in dag-ml (deterministic argmin/argmax +
 * id tie-break), not the host. `policy_json` = SelectionPolicy, `candidates_json`
 * = `CandidateScore` array. With `groups_json` (group id to candidate ids) returns a
 * {group → SelectionDecision} map; otherwise a single SelectionDecision.
 * @param {string} policy_json
 * @param {string} candidates_json
 * @param {string | null} [groups_json]
 * @returns {string}
 */
export function select_candidates_json(policy_json, candidates_json, groups_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.select_candidates_json(policy_json, candidates_json, isLikeNone(groups_json) ? 0 : addToExternrefTable0(groups_json));
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Resolve one explicitly named output of a signed portable package.
 * @param {string} package_json
 * @param {string} binding_id
 * @returns {string}
 */
export function select_portable_output_json(package_json, binding_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.select_portable_output_json(package_json, binding_id);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Select a CV fold for stacking test predictions from validation scores.
 * @param {string} request_json
 * @returns {string}
 */
export function select_stacking_fold_json(request_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.select_stacking_fold_json(request_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Select stacking producers from validation scores with the native policy.
 * @param {string} request_json
 * @returns {string}
 */
export function select_stacking_producers_json(request_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.select_stacking_producers_json(request_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 * @returns {string}
 */
export function sign_training_replay_request_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.sign_training_replay_request_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Sign an unsigned declaration using the same TCV1 contract as Python/C ABI.
 * Fingerprints are content seals, not cryptographic authorization signatures.
 * @param {string} json
 * @returns {string}
 */
export function sign_training_request_json(json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.sign_training_request_json(json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Objective-aware normalized CV-fold weights for stacking test predictions.
 * @param {string} request_json
 * @returns {string}
 */
export function stacking_fold_weights_json(request_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.stacking_fold_weights_json(request_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Build a stratified K-fold `FoldSet`: same OOF-once guarantee as K-fold, but
 * balanced by a per-sample class label. `strata_json` is a JSON object mapping
 * sample id → class label (identity-keyed metadata, never feature values).
 * `target_missing_json` behaves as in [`kfold_split_json`]; those samples need no label.
 * @param {string} spec_json
 * @param {string} sample_ids_json
 * @param {string} strata_json
 * @param {string} id
 * @param {string | null} [target_missing_json]
 * @returns {string}
 */
export function stratified_kfold_split_json(spec_json, sample_ids_json, strata_json, id, target_missing_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.stratified_kfold_split_json(spec_json, sample_ids_json, strata_json, id, isLikeNone(target_missing_json) ? 0 : addToExternrefTable0(target_missing_json));
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Derive an identity from an attested binding/envelope, without host hashing.
 * @param {string} binding_json
 * @param {string} envelope_json
 * @returns {string}
 */
export function training_data_identity_json(binding_json, envelope_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.training_data_identity_json(binding_json, envelope_json);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json
 */
export function validate_campaign_json(json) {
    const ret = wasm.validate_campaign_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_controller_manifest_json(json) {
    const ret = wasm.validate_controller_manifest_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_controller_manifest_list_json(json) {
    const ret = wasm.validate_controller_manifest_list_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_execution_bundle_json(json) {
    const ret = wasm.validate_execution_bundle_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_execution_plan_json(json) {
    const ret = wasm.validate_execution_plan_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_fold_set_json(json) {
    const ret = wasm.validate_fold_set_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_graph_json(json) {
    const ret = wasm.validate_graph_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Validate a signed no-splitter REFIT package before any host operator callback.
 * @param {string} package_json
 */
export function validate_initial_full_refit_package_json(package_json) {
    const ret = wasm.validate_initial_full_refit_package_json(package_json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @param {string} json
 */
export function validate_pipeline_dsl_json(json) {
    const ret = wasm.validate_pipeline_dsl_json(json);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_or_undefined_f9435d56bdcc06df: function(arg0) {
            const ret = arg0 == null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_symbol_3acc5de2aaea59b9: function(arg0) {
            const ret = typeof(arg0) === 'symbol';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_apply_b3c0654aebfdfdcd: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.apply(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_1875a20c43a36133: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_939a2607c4484b0b: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.call(arg1, arg2, arg3, arg4);
            return ret;
        }, arguments); },
        __wbg_charCodeAt_bbfbcedfafe34880: function(arg0, arg1) {
            const ret = arg0.charCodeAt(arg1 >>> 0);
            return ret;
        },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_hasInstance_62b7bb420e7d02aa: function() {
            const ret = Symbol.hasInstance;
            return ret;
        },
        __wbg_length_78dac82682e59660: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_5502aad30c185fc8: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h51a83d35f1b2856a(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h51a83d35f1b2856a(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_of_d5dbecdc59e02e34: function(arg0) {
            const ret = Array.of(arg0);
            return ret;
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_stringify_52ff602c1cc4fbb6: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_then_c949d5a25a4e78f8: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 178, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h099d61a787badafb);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./dag_ml_wasm_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h099d61a787badafb(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h099d61a787badafb(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h51a83d35f1b2856a(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h51a83d35f1b2856a(arg0, arg1, arg2, arg3);
}

const LocalImplementationRegistryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_localimplementationregistry_free(ptr, 1));
const TrainingLossBindingFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_traininglossbinding_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('dag_ml_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
