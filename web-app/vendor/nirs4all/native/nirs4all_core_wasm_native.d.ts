/* tslint:disable */
/* eslint-disable */

/**
 * Validated generic `.n4a` storage held in WASM memory. The container is opened
 * once, owns the caller's allocation without a Rust-side copy and is immutable
 * afterwards. Readers return exact bytes. Owner semantics stay report-only and
 * no Methods or DAG-ML runtime is involved. The working-memory budget is the
 * optional caller declaration; Core adds no content cap of its own.
 */
export class N4aContainerHandle {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Admission of `bytes` against the budget this handle was opened with.
     */
    admit(bytes: bigint): void;
    /**
     * An independent copy of the original archive bytes.
     */
    archive_bytes(): Uint8Array;
    /**
     * `length` bytes of the original archive from `offset`.
     */
    archive_chunk(offset: bigint, length: bigint): Uint8Array;
    archive_length(): bigint;
    /**
     * JSON array of the member paths an embedded artifact owns (empty for a
     * reference artifact), or `undefined` for an unknown artifact id.
     */
    artifact_member_paths_json(artifact_id: string): string | undefined;
    /**
     * Streaming buffer size derived from this handle's budget.
     */
    chunk_bytes(): bigint;
    /**
     * The exact stored `manifest.json` bytes.
     */
    manifest_bytes(): Uint8Array;
    /**
     * The exact bytes of one inventoried member, or `undefined`.
     */
    member(path: string): Uint8Array | undefined;
    /**
     * `length` bytes of a member from `offset`, or `undefined` for an unknown
     * member. The bytes were validated when the container was opened.
     */
    member_chunk(path: string, offset: bigint, length: bigint): Uint8Array | undefined;
    /**
     * Byte length of one inventoried member, or `undefined`.
     */
    member_length(path: string): bigint | undefined;
    /**
     * Consumes the transferred bytes. Any physical, manifest, memory or
     * integrity failure is a refusal and no handle exists. Hosts admit the
     * byte length with `n4a_admit` before the wasm-bindgen copy.
     */
    constructor(archive_bytes: Uint8Array, memory_budget?: bigint | null);
    /**
     * Core's container view as JSON text (storage status, receipt, manifest,
     * semantic report). Reading is not executability.
     */
    view_json(): string;
}

/**
 * Read-only prediction plan. Core validates the container and record, IO
 * normalises the record, and DAG-ML re-admits the exact strings below inside
 * `replay_training_package_json`. The plan carries features and sample IDs
 * only: it has no target accessor at all.
 */
export class N4aPredictPlan {
    free(): void;
    [Symbol.dispose](): void;
    envelopes_json(): string;
    /**
     * `record` is `undefined` for the stored input or exact external IO bytes.
     */
    constructor(archive_bytes: Uint8Array, entrypoint: string, record: Uint8Array | null | undefined, source_id: string, partition: string, require_training_schema: boolean, request_id: string, memory_budget?: bigint | null);
    package_json(): string;
    receipt_json(): string;
    request_json(): string;
    sample_ids_json(): string;
    target_names_json(): string;
    /**
     * Row-major features in `sample_ids` order. Copied once per call; the
     * facade reads it once per plan.
     */
    x(): Float64Array;
    readonly cols: number;
    readonly rows: number;
}

/**
 * Phase one of a stored-recipe retrain: Core validates the archive once and
 * keeps only the stored recipe and source ID. The host then supplies its
 * trusted controller manifests to `plan`. Anything outside the closed native
 * model profile is refused by the constructor.
 */
export class N4aRetrainFacts {
    free(): void;
    [Symbol.dispose](): void;
    constructor(archive_bytes: Uint8Array, memory_budget?: bigint | null);
    /**
     * Plan the retrain from this archive's stored recipe and source.
     */
    plan(record: Uint8Array, manifests_json: string, run_id: string, memory_budget?: bigint | null): N4aTrainPlan;
}

/**
 * Sealed canonical `.n4a` bytes with the view of the same fit.
 */
export class N4aSealed {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    bytes(): Uint8Array;
    view_json(): string;
}

/**
 * Validated metadata of an externally held archive. Member and archive bytes
 * stay with the host's source; every later read is verified by the host feeding
 * the bytes it actually read into an `N4aStreamVerifier`. Semantics are not
 * evaluated because no member bytes were read here.
 */
export class N4aSourceHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    admit(bytes: bigint): void;
    archive_length(): bigint;
    artifact_member_paths_json(artifact_id: string): string | undefined;
    chunk_bytes(): bigint;
    manifest_bytes(): Uint8Array;
    /**
     * `[data_offset, byte_length]` of a member in the source, or `undefined`.
     */
    member_range(path: string): BigUint64Array | undefined;
    /**
     * Compare the bytes actually read for the whole archive with the receipt.
     */
    verify_archive(verifier: N4aStreamVerifier): void;
    /**
     * Compare the bytes actually read for `path` with the validated receipt.
     */
    verify_member(path: string, verifier: N4aStreamVerifier): void;
    /**
     * Core's metadata view: `semantics` and `training_view` are `not_evaluated`.
     */
    view_json(): string;
}

/**
 * Drives Core's one sans-IO scanner over a host-owned random-access source. The
 * host reads exactly the requested ranges and feeds them back; all physical
 * parsing, CRC, SHA and manifest checks stay in Core.
 */
export class N4aSourceScan {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The bytes of exactly the pending read. A short or long read is refused.
     */
    feed(bytes: Uint8Array): void;
    /**
     * Complete validation. The handle keeps metadata only, never member bytes.
     */
    finish(): N4aSourceHandle;
    /**
     * `archive_len` is the exact source size. A budget too small for the
     * scanner's buffer is refused here.
     */
    constructor(archive_len: bigint, memory_budget?: bigint | null);
    /**
     * Length of the pending read, or `undefined` when the scan is ready to finish.
     */
    next_length(): bigint | undefined;
    /**
     * Offset of the pending read, or `undefined` when the scan is ready to finish.
     */
    next_offset(): bigint | undefined;
}

/**
 * Incremental hash of bytes a host actually read from a retained source. It is
 * compared with the validated receipt by `N4aSourceHandle::verify_*`, or turned
 * into a member digest by `N4aStreamWriter::add_member`. One use only.
 */
export class N4aStreamVerifier {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    update(bytes: Uint8Array): void;
}

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
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Register one new member by the digest of the bytes the host just read.
     */
    add_member(path: string, verifier: N4aStreamVerifier): void;
    /**
     * Plan from the added members alone.
     */
    build(): void;
    /**
     * Plan an update of a bytes-held base. Its retained digests come from the
     * base's validated inventory; the base is never changed.
     */
    build_from_bytes_base(base: N4aContainerHandle): void;
    /**
     * Plan an update of an externally held base (same rules).
     */
    build_from_source_base(base: N4aSourceHandle): void;
    /**
     * Exact final archive size, known before any byte is written.
     */
    byte_length(): bigint;
    /**
     * Complete the write; the container SHA-256 comes from the bytes written.
     * Returns the receipt as JSON text.
     */
    finish(): string;
    /**
     * The frame bytes of the current step, to append to the sink unchanged.
     */
    frame(): Uint8Array;
    member_length(): bigint;
    member_path(): string;
    /**
     * `manifest` is the exact manifest JSON; it is parsed by Core.
     */
    constructor(manifest: Uint8Array, memory_budget?: bigint | null);
    /**
     * Advance the plan: 0 = complete, 1 = a frame to append (`frame`),
     * 2 = a member payload to stream (`member_path`, `member_length`).
     */
    next_step(): number;
    /**
     * Account one payload chunk of the current member. Core compares the member's
     * digest at the following `next_step`.
     */
    update_member(chunk: Uint8Array): void;
}

/**
 * Training plan produced from an IO record plus a recipe, or from the recipe
 * stored in a validated archive. DAG-ML request assembly, IO identities and
 * folds are Rust-owned; JavaScript only executes the exact strings and seals
 * the result through Core.
 */
export class N4aTrainPlan {
    free(): void;
    [Symbol.dispose](): void;
    envelopes_json(): string;
    /**
     * `manifests_json` are the trusted controller manifests of the executing
     * host; the request embeds exactly these.
     */
    constructor(record: Uint8Array, source_id: string, recipe_json: string, manifests_json: string, run_id: string, memory_budget?: bigint | null);
    relations_json(): string;
    request_json(): string;
    sample_ids_json(): string;
    /**
     * Core's owner seal of the DAG-ML outcome and package this plan requested.
     */
    seal(outcome_json: string, package_json: string, container_id: string, embed_training_record: boolean, memory_budget?: bigint | null): N4aSealed;
    target_names_json(): string;
    /**
     * Row-major features and targets in `sample_ids` order; each is copied
     * once per plan by the facade.
     */
    x(): Float64Array;
    y(): Float64Array;
    readonly bundle_id: string;
    readonly cols: number;
    readonly outcome_id: string;
    readonly package_id: string;
    readonly rows: number;
    readonly run_id: string;
    readonly source_id: string;
}

/**
 * Transfers member byte arrays into WASM memory one call at a time so no
 * `js-sys` dependency is needed. Each array is moved, not cloned. The builder
 * is consumed by `finish` / `finish_update`; the owner writer enforces every
 * duplicate-path, closure and memory rule. Hosts admit each array with
 * `n4a_admit` before `add_member`.
 */
export class N4aWriter {
    free(): void;
    [Symbol.dispose](): void;
    add_member(path: string, bytes: Uint8Array): void;
    /**
     * Write a new container from exactly the added members.
     */
    finish(manifest: Uint8Array, memory_budget?: bigint | null): N4aWritten;
    /**
     * Write a new container: every member the manifest declares takes the
     * added bytes, otherwise the base's. The base handle is never changed.
     */
    finish_update(base: N4aContainerHandle, manifest: Uint8Array, memory_budget?: bigint | null): N4aWritten;
    constructor();
}

/**
 * A written container: the receipt as JSON text and the archive bytes,
 * which `into_bytes` hands over without cloning.
 */
export class N4aWritten {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Consumes this object; read `receipt_json` first.
     */
    into_bytes(): Uint8Array;
    receipt_json(): string;
}

/**
 * Sans-IO scientific reader over one already scanned external source. Hosts
 * feed only scientific members they materialize; the strict DAG read requests
 * determine which are required, and foreign payloads need not be loaded.
 */
export class NativePackageMemberReader {
    free(): void;
    [Symbol.dispose](): void;
    add_member(path: string, bytes: Uint8Array): void;
    /**
     * Call before a wasm-bindgen buffer transfer. It is an authorized working
     * set check, independent of physical content size.
     */
    admit_member(byte_length: bigint): void;
    /**
     * Reuse the scanned metadata and verified member buffers; no archive
     * reconstruction, whole-file copy, rescan or second member hash occurs.
     */
    finish(entrypoint: string | null | undefined, operation: string): ValidatedPortableArchiveV2;
    constructor(source: N4aSourceHandle, memory_budget?: bigint | null);
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
    static with_entrypoint(archive_bytes: Uint8Array, entrypoint?: string | null, memory_budget_bytes?: bigint | null): ValidatedMethodsArchiveV2;
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
    package_bytes(): Uint8Array;
    state_member_bytes(artifact_id: string): Uint8Array;
    training_outcome_bytes(): Uint8Array;
    view_json(): string;
    /**
     * Storage/strict scientific inspection supports Package3; execution is separate.
     */
    static with_entrypoint(archive_bytes: Uint8Array, entrypoint?: string | null, memory_budget_bytes?: bigint | null): ValidatedPortableArchiveV2;
    readonly archive_id: string;
    readonly archive_sha256: string;
    readonly package_schema_version: number;
}

/**
 * Calibrate from a known immutable base; retained foreign content is carried
 * byte-for-byte and retained references cannot be rebound to changed facets.
 */
export function calibrate_native_package_bytes(base_bytes: Uint8Array, entrypoint: string | null | undefined, outcome_bytes: Uint8Array, package_bytes: Uint8Array, container_id: string, memory_budget_bytes?: bigint | null): Uint8Array;

export function calibrate_workflow_replay_json(source: string, replay: string, relations: string, truth: string, coverages: string, small_sample_policy: string): string;

export function calibrated_methods_points_json(_package: string, archive_sha: string, sample_ids: string, values: string, descriptor: string): string;

export function calibrated_prediction_json(_package: string, request: string, replay: string): string;

export function conformal_metrics_json(calibration: string, intervals: string, truth: string): string;

export function frozen_methods_points_json(_package: string, archive_sha: string, sample_ids: string, values: string, descriptor: string): string;

export function generate_variants_json(input: string): string;

/**
 * Open externally supplied `.n4a` bytes at the owner boundary and return the
 * closed native-produced model view (manifest, receipt, training outcome) as
 * JSON text. Inspection is not executability. `memory_budget` is the optional
 * working-memory budget in bytes; `undefined` leaves only the allocator.
 */
export function inspect_n4a_bytes(archive_bytes: Uint8Array, memory_budget?: bigint | null): string;

/**
 * Core's admission of `bytes` against a budget. Hosts call this BEFORE a
 * wasm-bindgen argument copy or any other allocation Core cannot make fallible.
 */
export function n4a_admit(memory_budget: bigint | null | undefined, bytes: bigint): void;

/**
 * Streaming buffer size Core derives from a budget: a buffer size, never a
 * content limit.
 */
export function n4a_chunk_bytes(memory_budget?: bigint | null): bigint;

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

/**
 * Exact owner documents sealed into neutral Core V1 bytes, with no fit.
 */
export function write_native_predictor_package_bytes(container_id: string, outcome_bytes: Uint8Array, package_bytes: Uint8Array, memory_budget_bytes?: bigint | null): Uint8Array;

export function write_native_refit_package_bytes(container_id: string, package_bytes: Uint8Array, memory_budget_bytes?: bigint | null): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_n4acontainerhandle_free: (a: number, b: number) => void;
    readonly __wbg_n4apredictplan_free: (a: number, b: number) => void;
    readonly __wbg_n4aretrainfacts_free: (a: number, b: number) => void;
    readonly __wbg_n4asealed_free: (a: number, b: number) => void;
    readonly __wbg_n4asourcehandle_free: (a: number, b: number) => void;
    readonly __wbg_n4asourcescan_free: (a: number, b: number) => void;
    readonly __wbg_n4astreamverifier_free: (a: number, b: number) => void;
    readonly __wbg_n4astreamwriter_free: (a: number, b: number) => void;
    readonly __wbg_n4atrainplan_free: (a: number, b: number) => void;
    readonly __wbg_n4awriter_free: (a: number, b: number) => void;
    readonly __wbg_n4awritten_free: (a: number, b: number) => void;
    readonly __wbg_nativepackagememberreader_free: (a: number, b: number) => void;
    readonly __wbg_validatedmethodsarchivev2_free: (a: number, b: number) => void;
    readonly __wbg_validatedportablearchivev2_free: (a: number, b: number) => void;
    readonly calibrate_native_package_bytes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: bigint) => [number, number, number, number];
    readonly calibrate_workflow_replay_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly calibrated_methods_points_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly calibrated_prediction_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly conformal_metrics_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly frozen_methods_points_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly generate_variants_json: (a: number, b: number) => [number, number, number, number];
    readonly inspect_n4a_bytes: (a: number, b: number, c: number, d: bigint) => [number, number, number, number];
    readonly n4a_admit: (a: number, b: bigint, c: bigint) => [number, number];
    readonly n4a_chunk_bytes: (a: number, b: bigint) => bigint;
    readonly n4acontainerhandle_admit: (a: number, b: bigint) => [number, number];
    readonly n4acontainerhandle_archive_bytes: (a: number) => [number, number, number, number];
    readonly n4acontainerhandle_archive_chunk: (a: number, b: bigint, c: bigint) => [number, number, number, number];
    readonly n4acontainerhandle_archive_length: (a: number) => bigint;
    readonly n4acontainerhandle_artifact_member_paths_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly n4acontainerhandle_chunk_bytes: (a: number) => bigint;
    readonly n4acontainerhandle_manifest_bytes: (a: number) => [number, number, number, number];
    readonly n4acontainerhandle_member: (a: number, b: number, c: number) => [number, number, number, number];
    readonly n4acontainerhandle_member_chunk: (a: number, b: number, c: number, d: bigint, e: bigint) => [number, number, number, number];
    readonly n4acontainerhandle_member_length: (a: number, b: number, c: number) => [number, bigint];
    readonly n4acontainerhandle_new: (a: number, b: number, c: number, d: bigint) => [number, number, number];
    readonly n4acontainerhandle_view_json: (a: number) => [number, number, number, number];
    readonly n4apredictplan_cols: (a: number) => number;
    readonly n4apredictplan_envelopes_json: (a: number) => [number, number];
    readonly n4apredictplan_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: bigint) => [number, number, number];
    readonly n4apredictplan_package_json: (a: number) => [number, number];
    readonly n4apredictplan_receipt_json: (a: number) => [number, number];
    readonly n4apredictplan_request_json: (a: number) => [number, number];
    readonly n4apredictplan_rows: (a: number) => number;
    readonly n4apredictplan_sample_ids_json: (a: number) => [number, number, number, number];
    readonly n4apredictplan_target_names_json: (a: number) => [number, number, number, number];
    readonly n4apredictplan_x: (a: number) => [number, number];
    readonly n4aretrainfacts_new: (a: number, b: number, c: number, d: bigint) => [number, number, number];
    readonly n4aretrainfacts_plan: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint) => [number, number, number];
    readonly n4asealed_bytes: (a: number) => [number, number];
    readonly n4asealed_view_json: (a: number) => [number, number];
    readonly n4asourcehandle_admit: (a: number, b: bigint) => [number, number];
    readonly n4asourcehandle_archive_length: (a: number) => bigint;
    readonly n4asourcehandle_artifact_member_paths_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly n4asourcehandle_chunk_bytes: (a: number) => bigint;
    readonly n4asourcehandle_manifest_bytes: (a: number) => [number, number, number, number];
    readonly n4asourcehandle_member_range: (a: number, b: number, c: number) => [number, number];
    readonly n4asourcehandle_verify_archive: (a: number, b: number) => [number, number];
    readonly n4asourcehandle_verify_member: (a: number, b: number, c: number, d: number) => [number, number];
    readonly n4asourcehandle_view_json: (a: number) => [number, number, number, number];
    readonly n4asourcescan_feed: (a: number, b: number, c: number) => [number, number];
    readonly n4asourcescan_finish: (a: number) => [number, number, number];
    readonly n4asourcescan_new: (a: bigint, b: number, c: bigint) => [number, number, number];
    readonly n4asourcescan_next_length: (a: number) => [number, bigint, number, number];
    readonly n4asourcescan_next_offset: (a: number) => [number, bigint, number, number];
    readonly n4astreamverifier_new: () => number;
    readonly n4astreamverifier_update: (a: number, b: number, c: number) => [number, number];
    readonly n4astreamwriter_add_member: (a: number, b: number, c: number, d: number) => [number, number];
    readonly n4astreamwriter_build: (a: number) => [number, number];
    readonly n4astreamwriter_build_from_bytes_base: (a: number, b: number) => [number, number];
    readonly n4astreamwriter_build_from_source_base: (a: number, b: number) => [number, number];
    readonly n4astreamwriter_byte_length: (a: number) => [bigint, number, number];
    readonly n4astreamwriter_finish: (a: number) => [number, number, number, number];
    readonly n4astreamwriter_frame: (a: number) => [number, number, number, number];
    readonly n4astreamwriter_member_length: (a: number) => [bigint, number, number];
    readonly n4astreamwriter_member_path: (a: number) => [number, number, number, number];
    readonly n4astreamwriter_new: (a: number, b: number, c: number, d: bigint) => [number, number, number];
    readonly n4astreamwriter_next_step: (a: number) => [number, number, number];
    readonly n4astreamwriter_update_member: (a: number, b: number, c: number) => [number, number];
    readonly n4atrainplan_bundle_id: (a: number) => [number, number];
    readonly n4atrainplan_cols: (a: number) => number;
    readonly n4atrainplan_envelopes_json: (a: number) => [number, number];
    readonly n4atrainplan_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: bigint) => [number, number, number];
    readonly n4atrainplan_outcome_id: (a: number) => [number, number];
    readonly n4atrainplan_package_id: (a: number) => [number, number];
    readonly n4atrainplan_relations_json: (a: number) => [number, number];
    readonly n4atrainplan_request_json: (a: number) => [number, number];
    readonly n4atrainplan_rows: (a: number) => number;
    readonly n4atrainplan_run_id: (a: number) => [number, number];
    readonly n4atrainplan_sample_ids_json: (a: number) => [number, number, number, number];
    readonly n4atrainplan_seal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: bigint) => [number, number, number];
    readonly n4atrainplan_source_id: (a: number) => [number, number];
    readonly n4atrainplan_target_names_json: (a: number) => [number, number, number, number];
    readonly n4atrainplan_x: (a: number) => [number, number];
    readonly n4atrainplan_y: (a: number) => [number, number];
    readonly n4awriter_add_member: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly n4awriter_finish: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number];
    readonly n4awriter_finish_update: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number, number];
    readonly n4awriter_new: () => number;
    readonly n4awritten_into_bytes: (a: number) => [number, number];
    readonly n4awritten_receipt_json: (a: number) => [number, number];
    readonly native_pipeline_fragments_json: (a: number, b: number) => [number, number, number, number];
    readonly nativepackagememberreader_add_member: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly nativepackagememberreader_admit_member: (a: number, b: bigint) => [number, number];
    readonly nativepackagememberreader_finish: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly nativepackagememberreader_new: (a: number, b: number, c: bigint) => [number, number, number];
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
    readonly validatedmethodsarchivev2_with_entrypoint: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number, number];
    readonly validatedportablearchivev2_archive_id: (a: number) => [number, number];
    readonly validatedportablearchivev2_archive_sha256: (a: number) => [number, number];
    readonly validatedportablearchivev2_manifest_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_member_bytes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly validatedportablearchivev2_member_paths_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_new: (a: number, b: number) => [number, number, number];
    readonly validatedportablearchivev2_package_bytes: (a: number) => [number, number];
    readonly validatedportablearchivev2_package_schema_version: (a: number) => number;
    readonly validatedportablearchivev2_state_member_bytes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly validatedportablearchivev2_training_outcome_bytes: (a: number) => [number, number, number, number];
    readonly validatedportablearchivev2_view_json: (a: number) => [number, number];
    readonly validatedportablearchivev2_with_entrypoint: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number, number];
    readonly write_native_predictor_package_bytes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number, number, number];
    readonly write_native_refit_package_bytes: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number, number, number];
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
