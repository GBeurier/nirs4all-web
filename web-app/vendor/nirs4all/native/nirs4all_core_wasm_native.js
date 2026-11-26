/* @ts-self-types="./nirs4all_core_wasm_native.d.ts" */

/**
 * Validated generic `.n4a` storage held in WASM memory. The container is opened
 * once, owns the caller's allocation without a Rust-side copy and is immutable
 * afterwards. Readers return exact bytes. Owner semantics stay report-only and
 * no Methods or DAG-ML runtime is involved. The working-memory budget is the
 * optional caller declaration; Core adds no content cap of its own.
 */
export class N4aContainerHandle {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aContainerHandleFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4acontainerhandle_free(ptr, 0);
    }
    /**
     * Admission of `bytes` against the budget this handle was opened with.
     * @param {bigint} bytes
     */
    admit(bytes) {
        const ret = wasm.n4acontainerhandle_admit(this.__wbg_ptr, bytes);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * An independent copy of the original archive bytes.
     * @returns {Uint8Array}
     */
    archive_bytes() {
        const ret = wasm.n4acontainerhandle_archive_bytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * `length` bytes of the original archive from `offset`.
     * @param {bigint} offset
     * @param {bigint} length
     * @returns {Uint8Array}
     */
    archive_chunk(offset, length) {
        const ret = wasm.n4acontainerhandle_archive_chunk(this.__wbg_ptr, offset, length);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {bigint}
     */
    archive_length() {
        const ret = wasm.n4acontainerhandle_archive_length(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * JSON array of the member paths an embedded artifact owns (empty for a
     * reference artifact), or `undefined` for an unknown artifact id.
     * @param {string} artifact_id
     * @returns {string | undefined}
     */
    artifact_member_paths_json(artifact_id) {
        const ptr0 = passStringToWasm0(artifact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4acontainerhandle_artifact_member_paths_json(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * Streaming buffer size derived from this handle's budget.
     * @returns {bigint}
     */
    chunk_bytes() {
        const ret = wasm.n4acontainerhandle_chunk_bytes(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * The exact stored `manifest.json` bytes.
     * @returns {Uint8Array}
     */
    manifest_bytes() {
        const ret = wasm.n4acontainerhandle_manifest_bytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The exact bytes of one inventoried member, or `undefined`.
     * @param {string} path
     * @returns {Uint8Array | undefined}
     */
    member(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4acontainerhandle_member(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * `length` bytes of a member from `offset`, or `undefined` for an unknown
     * member. The bytes were validated when the container was opened.
     * @param {string} path
     * @param {bigint} offset
     * @param {bigint} length
     * @returns {Uint8Array | undefined}
     */
    member_chunk(path, offset, length) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4acontainerhandle_member_chunk(this.__wbg_ptr, ptr0, len0, offset, length);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * Byte length of one inventoried member, or `undefined`.
     * @param {string} path
     * @returns {bigint | undefined}
     */
    member_length(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4acontainerhandle_member_length(this.__wbg_ptr, ptr0, len0);
        return ret[0] === 0 ? undefined : BigInt.asUintN(64, ret[1]);
    }
    /**
     * Consumes the transferred bytes. Any physical, manifest, memory or
     * integrity failure is a refusal and no handle exists. Hosts admit the
     * byte length with `n4a_admit` before the wasm-bindgen copy.
     * @param {Uint8Array} archive_bytes
     * @param {bigint | null} [memory_budget]
     */
    constructor(archive_bytes, memory_budget) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4acontainerhandle_new(ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aContainerHandleFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Core's container view as JSON text (storage status, receipt, manifest,
     * semantic report). Reading is not executability.
     * @returns {string}
     */
    view_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4acontainerhandle_view_json(this.__wbg_ptr);
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
}
if (Symbol.dispose) N4aContainerHandle.prototype[Symbol.dispose] = N4aContainerHandle.prototype.free;

/**
 * Read-only prediction plan. Core validates the container and record, IO
 * normalises the record, and DAG-ML re-admits the exact strings below inside
 * `replay_training_package_json`. The plan carries features and sample IDs
 * only: it has no target accessor at all.
 */
export class N4aPredictPlan {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aPredictPlanFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4apredictplan_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get cols() {
        const ret = wasm.n4apredictplan_cols(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    envelopes_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4apredictplan_envelopes_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * `record` is `undefined` for the stored input or exact external IO bytes.
     * @param {Uint8Array} archive_bytes
     * @param {string} entrypoint
     * @param {Uint8Array | null | undefined} record
     * @param {string} source_id
     * @param {string} partition
     * @param {boolean} require_training_schema
     * @param {string} request_id
     * @param {bigint | null} [memory_budget]
     */
    constructor(archive_bytes, entrypoint, record, source_id, partition, require_training_schema, request_id, memory_budget) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(entrypoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(record) ? 0 : passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        var len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(source_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(partition, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(request_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.n4apredictplan_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, require_training_schema, ptr5, len5, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aPredictPlanFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    package_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4apredictplan_package_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    receipt_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4apredictplan_receipt_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    request_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4apredictplan_request_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get rows() {
        const ret = wasm.n4apredictplan_rows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    sample_ids_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4apredictplan_sample_ids_json(this.__wbg_ptr);
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
    target_names_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4apredictplan_target_names_json(this.__wbg_ptr);
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
     * Row-major features in `sample_ids` order. Copied once per call; the
     * facade reads it once per plan.
     * @returns {Float64Array}
     */
    x() {
        const ret = wasm.n4apredictplan_x(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) N4aPredictPlan.prototype[Symbol.dispose] = N4aPredictPlan.prototype.free;

/**
 * Phase one of a stored-recipe retrain: Core validates the archive once and
 * keeps only the stored recipe and source ID. The host then supplies its
 * trusted controller manifests to `plan`. Anything outside the closed native
 * model profile is refused by the constructor.
 */
export class N4aRetrainFacts {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aRetrainFactsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4aretrainfacts_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} archive_bytes
     * @param {bigint | null} [memory_budget]
     */
    constructor(archive_bytes, memory_budget) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4aretrainfacts_new(ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aRetrainFactsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Plan the retrain from this archive's stored recipe and source.
     * @param {Uint8Array} record
     * @param {string} manifests_json
     * @param {string} run_id
     * @param {bigint | null} [memory_budget]
     * @returns {N4aTrainPlan}
     */
    plan(record, manifests_json, run_id, memory_budget) {
        const ptr0 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(manifests_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(run_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.n4aretrainfacts_plan(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return N4aTrainPlan.__wrap(ret[0]);
    }
}
if (Symbol.dispose) N4aRetrainFacts.prototype[Symbol.dispose] = N4aRetrainFacts.prototype.free;

/**
 * Sealed canonical `.n4a` bytes with the view of the same fit.
 */
export class N4aSealed {
    static __wrap(ptr) {
        const obj = Object.create(N4aSealed.prototype);
        obj.__wbg_ptr = ptr;
        N4aSealedFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aSealedFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4asealed_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    bytes() {
        const ret = wasm.n4asealed_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    view_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4asealed_view_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) N4aSealed.prototype[Symbol.dispose] = N4aSealed.prototype.free;

/**
 * Validated metadata of an externally held archive. Member and archive bytes
 * stay with the host's source; every later read is verified by the host feeding
 * the bytes it actually read into an `N4aStreamVerifier`. Semantics are not
 * evaluated because no member bytes were read here.
 */
export class N4aSourceHandle {
    static __wrap(ptr) {
        const obj = Object.create(N4aSourceHandle.prototype);
        obj.__wbg_ptr = ptr;
        N4aSourceHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aSourceHandleFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4asourcehandle_free(ptr, 0);
    }
    /**
     * @param {bigint} bytes
     */
    admit(bytes) {
        const ret = wasm.n4asourcehandle_admit(this.__wbg_ptr, bytes);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {bigint}
     */
    archive_length() {
        const ret = wasm.n4asourcehandle_archive_length(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @param {string} artifact_id
     * @returns {string | undefined}
     */
    artifact_member_paths_json(artifact_id) {
        const ptr0 = passStringToWasm0(artifact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4asourcehandle_artifact_member_paths_json(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @returns {bigint}
     */
    chunk_bytes() {
        const ret = wasm.n4asourcehandle_chunk_bytes(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {Uint8Array}
     */
    manifest_bytes() {
        const ret = wasm.n4asourcehandle_manifest_bytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * `[data_offset, byte_length]` of a member in the source, or `undefined`.
     * @param {string} path
     * @returns {BigUint64Array | undefined}
     */
    member_range(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4asourcehandle_member_range(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        }
        return v2;
    }
    /**
     * Compare the bytes actually read for the whole archive with the receipt.
     * @param {N4aStreamVerifier} verifier
     */
    verify_archive(verifier) {
        _assertClass(verifier, N4aStreamVerifier);
        const ret = wasm.n4asourcehandle_verify_archive(this.__wbg_ptr, verifier.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Compare the bytes actually read for `path` with the validated receipt.
     * @param {string} path
     * @param {N4aStreamVerifier} verifier
     */
    verify_member(path, verifier) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(verifier, N4aStreamVerifier);
        const ret = wasm.n4asourcehandle_verify_member(this.__wbg_ptr, ptr0, len0, verifier.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Core's metadata view: `semantics` and `training_view` are `not_evaluated`.
     * @returns {string}
     */
    view_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4asourcehandle_view_json(this.__wbg_ptr);
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
}
if (Symbol.dispose) N4aSourceHandle.prototype[Symbol.dispose] = N4aSourceHandle.prototype.free;

/**
 * Drives Core's one sans-IO scanner over a host-owned random-access source. The
 * host reads exactly the requested ranges and feeds them back; all physical
 * parsing, CRC, SHA and manifest checks stay in Core.
 */
export class N4aSourceScan {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aSourceScanFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4asourcescan_free(ptr, 0);
    }
    /**
     * The bytes of exactly the pending read. A short or long read is refused.
     * @param {Uint8Array} bytes
     */
    feed(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4asourcescan_feed(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Complete validation. The handle keeps metadata only, never member bytes.
     * @returns {N4aSourceHandle}
     */
    finish() {
        const ret = wasm.n4asourcescan_finish(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return N4aSourceHandle.__wrap(ret[0]);
    }
    /**
     * `archive_len` is the exact source size. A budget too small for the
     * scanner's buffer is refused here.
     * @param {bigint} archive_len
     * @param {bigint | null} [memory_budget]
     */
    constructor(archive_len, memory_budget) {
        const ret = wasm.n4asourcescan_new(archive_len, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aSourceScanFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Length of the pending read, or `undefined` when the scan is ready to finish.
     * @returns {bigint | undefined}
     */
    next_length() {
        const ret = wasm.n4asourcescan_next_length(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        return ret[0] === 0 ? undefined : BigInt.asUintN(64, ret[1]);
    }
    /**
     * Offset of the pending read, or `undefined` when the scan is ready to finish.
     * @returns {bigint | undefined}
     */
    next_offset() {
        const ret = wasm.n4asourcescan_next_offset(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        return ret[0] === 0 ? undefined : BigInt.asUintN(64, ret[1]);
    }
}
if (Symbol.dispose) N4aSourceScan.prototype[Symbol.dispose] = N4aSourceScan.prototype.free;

/**
 * Incremental hash of bytes a host actually read from a retained source. It is
 * compared with the validated receipt by `N4aSourceHandle::verify_*`, or turned
 * into a member digest by `N4aStreamWriter::add_member`. One use only.
 */
export class N4aStreamVerifier {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aStreamVerifierFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4astreamverifier_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.n4astreamverifier_new();
        this.__wbg_ptr = ret;
        N4aStreamVerifierFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Uint8Array} bytes
     */
    update(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4astreamverifier_update(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) N4aStreamVerifier.prototype[Symbol.dispose] = N4aStreamVerifier.prototype.free;

/**
 * Two-pass streaming writer driven over Core's sans-IO `N4aWritePlan`. Pass 1:
 * the host hashes every new member through an `N4aStreamVerifier` and registers
 * it with `add_member`. `build*` completes the physical set (members the
 * manifest declares and the host did not supply come from the base inventory,
 * without hashing) and fixes the exact archive size. Pass 2: the host loops
 * `next_step`, appending every frame to its sink and streaming every member's
 * payload through `update_member`; a source that changed between the passes is
 * refused by Core, and the sink must then be discarded.
 */
export class N4aStreamWriter {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aStreamWriterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4astreamwriter_free(ptr, 0);
    }
    /**
     * Register one new member by the digest of the bytes the host just read.
     * @param {string} path
     * @param {N4aStreamVerifier} verifier
     */
    add_member(path, verifier) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(verifier, N4aStreamVerifier);
        const ret = wasm.n4astreamwriter_add_member(this.__wbg_ptr, ptr0, len0, verifier.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Plan from the added members alone.
     */
    build() {
        const ret = wasm.n4astreamwriter_build(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Plan an update of a bytes-held base. Its retained digests come from the
     * base's validated inventory; the base is never changed.
     * @param {N4aContainerHandle} base
     */
    build_from_bytes_base(base) {
        _assertClass(base, N4aContainerHandle);
        const ret = wasm.n4astreamwriter_build_from_bytes_base(this.__wbg_ptr, base.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Plan an update of an externally held base (same rules).
     * @param {N4aSourceHandle} base
     */
    build_from_source_base(base) {
        _assertClass(base, N4aSourceHandle);
        const ret = wasm.n4astreamwriter_build_from_source_base(this.__wbg_ptr, base.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Exact final archive size, known before any byte is written.
     * @returns {bigint}
     */
    byte_length() {
        const ret = wasm.n4astreamwriter_byte_length(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Complete the write; the container SHA-256 comes from the bytes written.
     * Returns the receipt as JSON text.
     * @returns {string}
     */
    finish() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4astreamwriter_finish(this.__wbg_ptr);
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
     * The frame bytes of the current step, to append to the sink unchanged.
     * @returns {Uint8Array}
     */
    frame() {
        const ret = wasm.n4astreamwriter_frame(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {bigint}
     */
    member_length() {
        const ret = wasm.n4astreamwriter_member_length(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * @returns {string}
     */
    member_path() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4astreamwriter_member_path(this.__wbg_ptr);
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
     * `manifest` is the exact manifest JSON; it is parsed by Core.
     * @param {Uint8Array} manifest
     * @param {bigint | null} [memory_budget]
     */
    constructor(manifest, memory_budget) {
        const ptr0 = passArray8ToWasm0(manifest, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4astreamwriter_new(ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aStreamWriterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Advance the plan: 0 = complete, 1 = a frame to append (`frame`),
     * 2 = a member payload to stream (`member_path`, `member_length`).
     * @returns {number}
     */
    next_step() {
        const ret = wasm.n4astreamwriter_next_step(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Account one payload chunk of the current member. Core compares the member's
     * digest at the following `next_step`.
     * @param {Uint8Array} chunk
     */
    update_member(chunk) {
        const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4astreamwriter_update_member(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) N4aStreamWriter.prototype[Symbol.dispose] = N4aStreamWriter.prototype.free;

/**
 * Training plan produced from an IO record plus a recipe, or from the recipe
 * stored in a validated archive. DAG-ML request assembly, IO identities and
 * folds are Rust-owned; JavaScript only executes the exact strings and seals
 * the result through Core.
 */
export class N4aTrainPlan {
    static __wrap(ptr) {
        const obj = Object.create(N4aTrainPlan.prototype);
        obj.__wbg_ptr = ptr;
        N4aTrainPlanFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aTrainPlanFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4atrainplan_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get bundle_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_bundle_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get cols() {
        const ret = wasm.n4atrainplan_cols(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    envelopes_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_envelopes_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * `manifests_json` are the trusted controller manifests of the executing
     * host; the request embeds exactly these.
     * @param {Uint8Array} record
     * @param {string} source_id
     * @param {string} recipe_json
     * @param {string} manifests_json
     * @param {string} run_id
     * @param {bigint | null} [memory_budget]
     */
    constructor(record, source_id, recipe_json, manifests_json, run_id, memory_budget) {
        const ptr0 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(source_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(recipe_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(manifests_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(run_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.n4atrainplan_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        N4aTrainPlanFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get outcome_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_outcome_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get package_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_package_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    relations_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_relations_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    request_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_request_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get rows() {
        const ret = wasm.n4atrainplan_rows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get run_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_run_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    sample_ids_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4atrainplan_sample_ids_json(this.__wbg_ptr);
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
     * Core's owner seal of the DAG-ML outcome and package this plan requested.
     * @param {string} outcome_json
     * @param {string} package_json
     * @param {string} container_id
     * @param {boolean} embed_training_record
     * @param {bigint | null} [memory_budget]
     * @returns {N4aSealed}
     */
    seal(outcome_json, package_json, container_id, embed_training_record, memory_budget) {
        const ptr0 = passStringToWasm0(outcome_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(package_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(container_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.n4atrainplan_seal(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, embed_training_record, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return N4aSealed.__wrap(ret[0]);
    }
    /**
     * @returns {string}
     */
    get source_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4atrainplan_source_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    target_names_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.n4atrainplan_target_names_json(this.__wbg_ptr);
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
     * Row-major features and targets in `sample_ids` order; each is copied
     * once per plan by the facade.
     * @returns {Float64Array}
     */
    x() {
        const ret = wasm.n4atrainplan_x(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    y() {
        const ret = wasm.n4atrainplan_y(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) N4aTrainPlan.prototype[Symbol.dispose] = N4aTrainPlan.prototype.free;

/**
 * Transfers member byte arrays into WASM memory one call at a time so no
 * `js-sys` dependency is needed. Each array is moved, not cloned. The builder
 * is consumed by `finish` / `finish_update`; the owner writer enforces every
 * duplicate-path, closure and memory rule. Hosts admit each array with
 * `n4a_admit` before `add_member`.
 */
export class N4aWriter {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aWriterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4awriter_free(ptr, 0);
    }
    /**
     * @param {string} path
     * @param {Uint8Array} bytes
     */
    add_member(path, bytes) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.n4awriter_add_member(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Write a new container from exactly the added members.
     * @param {Uint8Array} manifest
     * @param {bigint | null} [memory_budget]
     * @returns {N4aWritten}
     */
    finish(manifest, memory_budget) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passArray8ToWasm0(manifest, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4awriter_finish(ptr, ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return N4aWritten.__wrap(ret[0]);
    }
    /**
     * Write a new container: every member the manifest declares takes the
     * added bytes, otherwise the base's. The base handle is never changed.
     * @param {N4aContainerHandle} base
     * @param {Uint8Array} manifest
     * @param {bigint | null} [memory_budget]
     * @returns {N4aWritten}
     */
    finish_update(base, manifest, memory_budget) {
        const ptr = this.__destroy_into_raw();
        _assertClass(base, N4aContainerHandle);
        const ptr0 = passArray8ToWasm0(manifest, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.n4awriter_finish_update(ptr, base.__wbg_ptr, ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return N4aWritten.__wrap(ret[0]);
    }
    constructor() {
        const ret = wasm.n4awriter_new();
        this.__wbg_ptr = ret;
        N4aWriterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) N4aWriter.prototype[Symbol.dispose] = N4aWriter.prototype.free;

/**
 * A written container: the receipt as JSON text and the archive bytes,
 * which `into_bytes` hands over without cloning.
 */
export class N4aWritten {
    static __wrap(ptr) {
        const obj = Object.create(N4aWritten.prototype);
        obj.__wbg_ptr = ptr;
        N4aWrittenFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        N4aWrittenFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_n4awritten_free(ptr, 0);
    }
    /**
     * Consumes this object; read `receipt_json` first.
     * @returns {Uint8Array}
     */
    into_bytes() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.n4awritten_into_bytes(ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    receipt_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.n4awritten_receipt_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) N4aWritten.prototype[Symbol.dispose] = N4aWritten.prototype.free;

/**
 * Sans-IO scientific reader over one already scanned external source. Hosts
 * feed only scientific members they materialize; the strict DAG read requests
 * determine which are required, and foreign payloads need not be loaded.
 */
export class NativePackageMemberReader {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NativePackageMemberReaderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_nativepackagememberreader_free(ptr, 0);
    }
    /**
     * @param {string} path
     * @param {Uint8Array} bytes
     */
    add_member(path, bytes) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.nativepackagememberreader_add_member(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Call before a wasm-bindgen buffer transfer. It is an authorized working
     * set check, independent of physical content size.
     * @param {bigint} byte_length
     */
    admit_member(byte_length) {
        const ret = wasm.nativepackagememberreader_admit_member(this.__wbg_ptr, byte_length);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Reuse the scanned metadata and verified member buffers; no archive
     * reconstruction, whole-file copy, rescan or second member hash occurs.
     * @param {string | null | undefined} entrypoint
     * @param {string} operation
     * @returns {ValidatedPortableArchiveV2}
     */
    finish(entrypoint, operation) {
        var ptr0 = isLikeNone(entrypoint) ? 0 : passStringToWasm0(entrypoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.nativepackagememberreader_finish(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ValidatedPortableArchiveV2.__wrap(ret[0]);
    }
    /**
     * @param {N4aSourceHandle} source
     * @param {bigint | null} [memory_budget]
     */
    constructor(source, memory_budget) {
        _assertClass(source, N4aSourceHandle);
        const ret = wasm.nativepackagememberreader_new(source.__wbg_ptr, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        NativePackageMemberReaderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) NativePackageMemberReader.prototype[Symbol.dispose] = NativePackageMemberReader.prototype.free;

/**
 * A fully validated, single-model Methods Archive V2 projection.
 */
export class ValidatedMethodsArchiveV2 {
    static __wrap(ptr) {
        const obj = Object.create(ValidatedMethodsArchiveV2.prototype);
        obj.__wbg_ptr = ptr;
        ValidatedMethodsArchiveV2Finalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ValidatedMethodsArchiveV2Finalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_validatedmethodsarchivev2_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get abi_min_minor() {
        const ret = wasm.validatedmethodsarchivev2_abi_min_minor(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get archive_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_archive_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get archive_sha256() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_archive_sha256(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get artifact_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_artifact_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Bind authoritative Methods/WASM inspection fields to the inventoried
     * N4MM bytes and return DAG-ML's typed descriptor JSON.
     *
     * The public JavaScript facade obtains these primitive fields only from
     * `@nirs4all/methods.inspectN4mm`. Core supplies the artifact hash and
     * controller from the validated archive, while DAG-ML owns all pure
     * controller/algorithm/capability/dimension policy and TCV1 identity.
     * @param {number} inspection_schema_version
     * @param {number} format_version
     * @param {number} writer_abi_major
     * @param {number} writer_abi_minor
     * @param {number} writer_abi_patch
     * @param {number} storage_algorithm
     * @param {bigint} training_samples
     * @param {number} n_features
     * @param {number} n_targets
     * @param {number} n_components
     * @param {bigint} capabilities
     * @param {boolean} pipeline_present
     * @param {number} pipeline_schema_version
     * @param {number} pipeline_operator_count
     * @param {number} pipeline_first_operator
     * @param {number} pipeline_second_operator
     * @param {number} savgol_window
     * @param {number} savgol_poly_degree
     * @param {number} savgol_derivative
     * @param {number} pipeline_semantic_profile
     * @param {number} savgol_delta
     * @param {number} pipeline_raw_n_features
     * @param {number} pipeline_model_n_features
     * @param {number} pipeline_fingerprint_algorithm
     * @param {bigint} pipeline_fingerprint
     * @param {number} snv_axis
     * @param {boolean} snv_with_mean
     * @param {boolean} snv_with_std
     * @param {number} snv_ddof
     * @param {number} savgol_mode
     * @param {number} savgol_cval
     * @returns {string}
     */
    bind_inspected_native_predictor_v1(inspection_schema_version, format_version, writer_abi_major, writer_abi_minor, writer_abi_patch, storage_algorithm, training_samples, n_features, n_targets, n_components, capabilities, pipeline_present, pipeline_schema_version, pipeline_operator_count, pipeline_first_operator, pipeline_second_operator, savgol_window, savgol_poly_degree, savgol_derivative, pipeline_semantic_profile, savgol_delta, pipeline_raw_n_features, pipeline_model_n_features, pipeline_fingerprint_algorithm, pipeline_fingerprint, snv_axis, snv_with_mean, snv_with_std, snv_ddof, savgol_mode, savgol_cval) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_bind_inspected_native_predictor_v1(this.__wbg_ptr, inspection_schema_version, format_version, writer_abi_major, writer_abi_minor, writer_abi_patch, storage_algorithm, training_samples, n_features, n_targets, n_components, capabilities, pipeline_present, pipeline_schema_version, pipeline_operator_count, pipeline_first_operator, pipeline_second_operator, savgol_window, savgol_poly_degree, savgol_derivative, pipeline_semantic_profile, savgol_delta, pipeline_raw_n_features, pipeline_model_n_features, pipeline_fingerprint_algorithm, pipeline_fingerprint, snv_axis, snv_with_mean, snv_with_std, snv_ddof, savgol_mode, savgol_cval);
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
    get binding_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_binding_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get format_version() {
        const ret = wasm.validatedmethodsarchivev2_format_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    model_bytes() {
        const ret = wasm.validatedmethodsarchivev2_model_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Validate through Core before returning any package or model bytes.
     * @param {Uint8Array} archive_bytes
     */
    constructor(archive_bytes) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validatedmethodsarchivev2_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ValidatedMethodsArchiveV2Finalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get node_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_node_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    package_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_package_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get port_name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_port_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    target_names_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedmethodsarchivev2_target_names_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {Uint8Array} archive_bytes
     * @param {string | null} [entrypoint]
     * @param {bigint | null} [memory_budget_bytes]
     * @returns {ValidatedMethodsArchiveV2}
     */
    static with_entrypoint(archive_bytes, entrypoint, memory_budget_bytes) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(entrypoint) ? 0 : passStringToWasm0(entrypoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.validatedmethodsarchivev2_with_entrypoint(ptr0, len0, ptr1, len1, !isLikeNone(memory_budget_bytes), isLikeNone(memory_budget_bytes) ? BigInt(0) : memory_budget_bytes);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ValidatedMethodsArchiveV2.__wrap(ret[0]);
    }
}
if (Symbol.dispose) ValidatedMethodsArchiveV2.prototype[Symbol.dispose] = ValidatedMethodsArchiveV2.prototype.free;

/**
 * Core-validated storage inventory, not a controller authorization.
 * DAG-ML must validate the opaque package/member links before replay.
 */
export class ValidatedPortableArchiveV2 {
    static __wrap(ptr) {
        const obj = Object.create(ValidatedPortableArchiveV2.prototype);
        obj.__wbg_ptr = ptr;
        ValidatedPortableArchiveV2Finalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ValidatedPortableArchiveV2Finalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_validatedportablearchivev2_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get archive_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedportablearchivev2_archive_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get archive_sha256() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedportablearchivev2_archive_sha256(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    manifest_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedportablearchivev2_manifest_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} path
     * @returns {Uint8Array}
     */
    member_bytes(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validatedportablearchivev2_member_bytes(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @returns {string}
     */
    member_paths_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedportablearchivev2_member_paths_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {Uint8Array} archive_bytes
     */
    constructor(archive_bytes) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validatedportablearchivev2_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ValidatedPortableArchiveV2Finalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Uint8Array}
     */
    package_bytes() {
        const ret = wasm.validatedportablearchivev2_package_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get package_schema_version() {
        const ret = wasm.validatedportablearchivev2_package_schema_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {string} artifact_id
     * @returns {Uint8Array}
     */
    state_member_bytes(artifact_id) {
        const ptr0 = passStringToWasm0(artifact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validatedportablearchivev2_state_member_bytes(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @returns {Uint8Array}
     */
    training_outcome_bytes() {
        const ret = wasm.validatedportablearchivev2_training_outcome_bytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    view_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.validatedportablearchivev2_view_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Storage/strict scientific inspection supports Package3; execution is separate.
     * @param {Uint8Array} archive_bytes
     * @param {string | null} [entrypoint]
     * @param {bigint | null} [memory_budget_bytes]
     * @returns {ValidatedPortableArchiveV2}
     */
    static with_entrypoint(archive_bytes, entrypoint, memory_budget_bytes) {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(entrypoint) ? 0 : passStringToWasm0(entrypoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.validatedportablearchivev2_with_entrypoint(ptr0, len0, ptr1, len1, !isLikeNone(memory_budget_bytes), isLikeNone(memory_budget_bytes) ? BigInt(0) : memory_budget_bytes);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ValidatedPortableArchiveV2.__wrap(ret[0]);
    }
}
if (Symbol.dispose) ValidatedPortableArchiveV2.prototype[Symbol.dispose] = ValidatedPortableArchiveV2.prototype.free;

/**
 * Calibrate from a known immutable base; retained foreign content is carried
 * byte-for-byte and retained references cannot be rebound to changed facets.
 * @param {Uint8Array} base_bytes
 * @param {string | null | undefined} entrypoint
 * @param {Uint8Array} outcome_bytes
 * @param {Uint8Array} package_bytes
 * @param {string} container_id
 * @param {bigint | null} [memory_budget_bytes]
 * @returns {Uint8Array}
 */
export function calibrate_native_package_bytes(base_bytes, entrypoint, outcome_bytes, package_bytes, container_id, memory_budget_bytes) {
    const ptr0 = passArray8ToWasm0(base_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(entrypoint) ? 0 : passStringToWasm0(entrypoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(outcome_bytes, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(package_bytes, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passStringToWasm0(container_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.calibrate_native_package_bytes(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, !isLikeNone(memory_budget_bytes), isLikeNone(memory_budget_bytes) ? BigInt(0) : memory_budget_bytes);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
}

/**
 * @param {string} source
 * @param {string} replay
 * @param {string} relations
 * @param {string} truth
 * @param {string} coverages
 * @param {string} small_sample_policy
 * @returns {string}
 */
export function calibrate_workflow_replay_json(source, replay, relations, truth, coverages, small_sample_policy) {
    let deferred8_0;
    let deferred8_1;
    try {
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(replay, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(relations, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(truth, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(coverages, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(small_sample_policy, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.calibrate_workflow_replay_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        var ptr7 = ret[0];
        var len7 = ret[1];
        if (ret[3]) {
            ptr7 = 0; len7 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred8_0 = ptr7;
        deferred8_1 = len7;
        return getStringFromWasm0(ptr7, len7);
    } finally {
        wasm.__wbindgen_free(deferred8_0, deferred8_1, 1);
    }
}

/**
 * @param {string} _package
 * @param {string} archive_sha
 * @param {string} sample_ids
 * @param {string} values
 * @param {string} descriptor
 * @returns {string}
 */
export function calibrated_methods_points_json(_package, archive_sha, sample_ids, values, descriptor) {
    let deferred7_0;
    let deferred7_1;
    try {
        const ptr0 = passStringToWasm0(_package, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(archive_sha, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sample_ids, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(values, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(descriptor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.calibrated_methods_points_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

/**
 * @param {string} _package
 * @param {string} request
 * @param {string} replay
 * @returns {string}
 */
export function calibrated_prediction_json(_package, request, replay) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(_package, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(request, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(replay, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.calibrated_prediction_json(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {string} calibration
 * @param {string} intervals
 * @param {string} truth
 * @returns {string}
 */
export function conformal_metrics_json(calibration, intervals, truth) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(calibration, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(intervals, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(truth, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.conformal_metrics_json(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {string} _package
 * @param {string} archive_sha
 * @param {string} sample_ids
 * @param {string} values
 * @param {string} descriptor
 * @returns {string}
 */
export function frozen_methods_points_json(_package, archive_sha, sample_ids, values, descriptor) {
    let deferred7_0;
    let deferred7_1;
    try {
        const ptr0 = passStringToWasm0(_package, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(archive_sha, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sample_ids, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(values, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(descriptor, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.frozen_methods_points_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

/**
 * @param {string} input
 * @returns {string}
 */
export function generate_variants_json(input) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_variants_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Open externally supplied `.n4a` bytes at the owner boundary and return the
 * closed native-produced model view (manifest, receipt, training outcome) as
 * JSON text. Inspection is not executability. `memory_budget` is the optional
 * working-memory budget in bytes; `undefined` leaves only the allocator.
 * @param {Uint8Array} archive_bytes
 * @param {bigint | null} [memory_budget]
 * @returns {string}
 */
export function inspect_n4a_bytes(archive_bytes, memory_budget) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(archive_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.inspect_n4a_bytes(ptr0, len0, !isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Core's admission of `bytes` against a budget. Hosts call this BEFORE a
 * wasm-bindgen argument copy or any other allocation Core cannot make fallible.
 * @param {bigint | null | undefined} memory_budget
 * @param {bigint} bytes
 */
export function n4a_admit(memory_budget, bytes) {
    const ret = wasm.n4a_admit(!isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget, bytes);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Streaming buffer size Core derives from a budget: a buffer size, never a
 * content limit.
 * @param {bigint | null} [memory_budget]
 * @returns {bigint}
 */
export function n4a_chunk_bytes(memory_budget) {
    const ret = wasm.n4a_chunk_bytes(!isLikeNone(memory_budget), isLikeNone(memory_budget) ? BigInt(0) : memory_budget);
    return BigInt.asUintN(64, ret);
}

/**
 * Validate the shared CPU/browser envelope in Rust before host presentation.
 * JSON fragments stay strings so JavaScript never rounds native uint64 seeds.
 * @param {string} input
 * @returns {string}
 */
export function native_pipeline_fragments_json(input) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.native_pipeline_fragments_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Resolve public PLS controls through the native owner before host parameter transport.
 * @param {string} input
 * @returns {string}
 */
export function pls_role_pipeline_contract_json(input) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pls_role_pipeline_contract_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} outcome_json
 * @param {string} dataset_label
 * @param {string} task_type_label
 * @returns {string}
 */
export function project_training_predictions_json(outcome_json, dataset_label, task_type_label) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(outcome_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(dataset_label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(task_type_label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.project_training_predictions_json(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {string} _package
 * @param {string} scenarios
 * @param {string} points
 * @param {string} truth
 * @returns {string}
 */
export function robustness_methods_points_json(_package, scenarios, points, truth) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(_package, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(scenarios, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(points, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(truth, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.robustness_methods_points_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * @param {string} _package
 * @param {string} scenarios
 * @param {string} replays
 * @param {string} truth
 * @returns {string}
 */
export function robustness_report_json(_package, scenarios, replays, truth) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(_package, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(scenarios, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(replays, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(truth, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.robustness_report_json(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * Synchronous artifact hashing for native DAG controller callbacks.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256_bytes(bytes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.sha256_bytes(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Validate the complete native portable payload closure for any supported
 * DAG predictor profile, without selecting a host execution backend.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function validate_portable_archive_v2(bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate_portable_archive_v2(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} scenarios
 * @returns {string}
 */
export function validate_robustness_scenarios_json(scenarios) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(scenarios, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate_robustness_scenarios_json(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} outcome_json
 * @param {string} predictions_json
 */
export function validate_training_predictions_json(outcome_json, predictions_json) {
    const ptr0 = passStringToWasm0(outcome_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(predictions_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_training_predictions_json(ptr0, len0, ptr1, len1);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Exact owner documents sealed into neutral Core V1 bytes, with no fit.
 * @param {string} container_id
 * @param {Uint8Array} outcome_bytes
 * @param {Uint8Array} package_bytes
 * @param {bigint | null} [memory_budget_bytes]
 * @returns {Uint8Array}
 */
export function write_native_predictor_package_bytes(container_id, outcome_bytes, package_bytes, memory_budget_bytes) {
    const ptr0 = passStringToWasm0(container_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(outcome_bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(package_bytes, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.write_native_predictor_package_bytes(ptr0, len0, ptr1, len1, ptr2, len2, !isLikeNone(memory_budget_bytes), isLikeNone(memory_budget_bytes) ? BigInt(0) : memory_budget_bytes);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * @param {string} container_id
 * @param {Uint8Array} package_bytes
 * @param {bigint | null} [memory_budget_bytes]
 * @returns {Uint8Array}
 */
export function write_native_refit_package_bytes(container_id, package_bytes, memory_budget_bytes) {
    const ptr0 = passStringToWasm0(container_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(package_bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.write_native_refit_package_bytes(ptr0, len0, ptr1, len1, !isLikeNone(memory_budget_bytes), isLikeNone(memory_budget_bytes) ? BigInt(0) : memory_budget_bytes);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
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
        "./nirs4all_core_wasm_native_bg.js": import0,
    };
}

const N4aContainerHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4acontainerhandle_free(ptr, 1));
const N4aPredictPlanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4apredictplan_free(ptr, 1));
const N4aRetrainFactsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4aretrainfacts_free(ptr, 1));
const N4aSealedFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4asealed_free(ptr, 1));
const N4aSourceHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4asourcehandle_free(ptr, 1));
const N4aSourceScanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4asourcescan_free(ptr, 1));
const N4aStreamVerifierFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4astreamverifier_free(ptr, 1));
const N4aStreamWriterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4astreamwriter_free(ptr, 1));
const N4aTrainPlanFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4atrainplan_free(ptr, 1));
const N4aWriterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4awriter_free(ptr, 1));
const N4aWrittenFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_n4awritten_free(ptr, 1));
const NativePackageMemberReaderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_nativepackagememberreader_free(ptr, 1));
const ValidatedMethodsArchiveV2Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_validatedmethodsarchivev2_free(ptr, 1));
const ValidatedPortableArchiveV2Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_validatedportablearchivev2_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigUint64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
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

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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
    cachedBigUint64ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
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
        module_or_path = new URL('nirs4all_core_wasm_native_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
