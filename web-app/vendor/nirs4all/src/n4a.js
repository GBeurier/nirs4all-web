// Canonical V1 `.n4a` L2 actions for JavaScript/WASM.
//
// Core's Rust/WASM bridge validates containers and records, asks IO for the
// dataset identities and DAG-ML for the training/replay requests, and seals the
// result. DAG-ML's WASM executor runs CV/selection/refit/replay and Methods
// fits or restores every estimator. This module only passes exact strings and
// typed arrays between them: it parses no recipe, package or record, hashes
// nothing per task and has no fallback fit.
//
// The handoff to the executor is private to this file. No exported function
// accepts an envelope, matrix, request or package.
import { loadArchiveV2Native } from './archive-v2.js';
import { loadDagMlWasm, loadMethodsWasm } from './index.js';

const requireValue = (ok, message) => { if (!ok) throw new TypeError(message); };

function bytesOf(value, name) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`${name} must be exact bytes (Uint8Array or ArrayBuffer), not text or an object.`);
}
const text = (value, name) => {
  requireValue(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string.`);
  return value;
};
const objectOf = (value) => {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Options must be an object.');
  return value;
};
// wasm-bindgen throws bare strings; surface the owner's refusal text as an Error.
function owner(call) {
  try {
    return call();
  } catch (error) {
    throw typeof error === 'string' ? new Error(error) : error;
  }
}

// The optional working-memory budget, as BigInt for Core's `Option<u64>`: a safe
// integer, a BigInt or exact decimal text, never rounded. `undefined` declares
// no Core ceiling. This is input validation only: no default and no maximum.
const U64_MAX = (1n << 64n) - 1n;
function budgetOf(options) {
  const value = options?.memoryBudgetBytes;
  if (value === undefined || value === null || value === '') return undefined;
  let budget;
  if (typeof value === 'bigint') budget = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) budget = BigInt(value);
  else if (typeof value === 'string' && /^[0-9]+$/.test(value)) budget = BigInt(value);
  else throw new TypeError('memoryBudgetBytes must be a safe integer, a BigInt or exact decimal text.');
  if (budget < 0n || budget > U64_MAX) throw new RangeError('memoryBudgetBytes must lie in 0..18446744073709551615.');
  return budget;
}
// Core admission BEFORE a wasm-bindgen argument copy: the copy itself is an
// allocation Core cannot make fallible. No budget means nothing to admit.
function admit(native, budget, ...lengths) {
  if (budget === undefined) return;
  const total = lengths.reduce((sum, length) => sum + BigInt(length), 0n);
  owner(() => native.n4a_admit(budget, total));
}

async function runtime(options) {
  const [dag, methods, native, adapter] = await Promise.all([
    options.dagMl ?? loadDagMlWasm(),
    options.methods ?? loadMethodsWasm(),
    loadArchiveV2Native(),
    options.estimatorAdapter ?? import('dag-ml-wasm/n4m-estimator-controller'),
  ]);
  if (typeof methods.loadModule === 'function') await methods.loadModule();
  const missing = [
    ['inspect_n4a_bytes', native], ['sha256_bytes', native],
    ['execute_training_json', dag], ['replay_training_package_json', dag],
  ].filter(([name, module]) => typeof module?.[name] !== 'function').map(([name]) => name);
  requireValue(missing.length === 0 && typeof native.N4aPredictPlan === 'function'
    && typeof native.N4aTrainPlan === 'function' && typeof adapter?.N4mWasmEstimatorControllers === 'function',
  `The loaded Core/DAG-ML WASM cohort does not expose the canonical .n4a actions (${missing.join(', ') || 'plans or estimator controller'}).`);
  return { dag, methods, native, Controller: adapter.N4mWasmEstimatorControllers, digest: (bytes) => native.sha256_bytes(bytes) };
}

// Each task picks its rows by sample ID from the one marshalled block.
function resolvers({ sourceId, ids, x, cols, y, width }) {
  const positions = new Map(ids.map((id, index) => [id, index]));
  requireValue(positions.size === ids.length, 'Plan sample IDs must be unique.');
  const select = (values, columns) => (wanted) => {
    const data = new Float64Array(wanted.length * columns);
    wanted.forEach((id, row) => {
      const position = positions.get(id);
      requireValue(position !== undefined, `Native task requested unknown sample '${id}'.`);
      data.set(values.subarray(position * columns, (position + 1) * columns), row * columns);
    });
    return { data, rows: wanted.length, cols: columns };
  };
  const features = select(x, cols), targets = y ? select(y, width) : null;
  return {
    resolveFeatures: ({ view }) => {
      requireValue(view.source_ids.length === 1 && view.source_ids[0] === sourceId, 'Native source mismatch.');
      return { sampleIds: [...view.sample_ids], matrix: features(view.sample_ids) };
    },
    resolveTargets: ({ sampleIds }) => {
      requireValue(targets, 'Target-free replay cannot request fitting labels.');
      return { sampleIds: [...sampleIds], matrix: targets(sampleIds) };
    },
  };
}

// Trusted manifests are needed before the plan (and its target names) exist.
function trustedManifests(deps) {
  const refuse = () => { throw new TypeError('Manifest probe carries no data.'); };
  const probe = new deps.Controller({ methods: deps.methods, dagMl: deps.dag, digest: deps.digest, targetNames: [],
    resolveFeatures: refuse, resolveTargets: refuse });
  try { return JSON.stringify(probe.manifests); } finally { probe.close(); }
}

// `early` is a Core object built before the runtime loads (the retrain facts).
// It is passed to `makePlan` and freed on every exit, including a runtime refusal.
async function train(options, makePlan, early) {
  try {
    const deps = await runtime(options);
    const plan = owner(() => makePlan(deps, trustedManifests(deps), early));
    try {
      const ids = JSON.parse(plan.sample_ids_json()), targetNames = JSON.parse(plan.target_names_json());
      const controller = new deps.Controller({ methods: deps.methods, dagMl: deps.dag, digest: deps.digest, targetNames,
        ...resolvers({ sourceId: plan.source_id, ids, x: plan.x(), cols: plan.cols, y: plan.y(), width: targetNames.length }) });
      try {
        const captured = JSON.parse(owner(() => deps.dag.execute_training_json(plan.request_json(), plan.envelopes_json(),
          plan.relations_json(), plan.package_id, plan.outcome_id, plan.run_id, plan.bundle_id, controller.callback)));
        const sealed = owner(() => plan.seal(captured.training_outcome_json, captured.portable_predictor_package_json,
          options.containerId ?? `container:${globalThis.crypto.randomUUID()}`, options.embedTrainingRecord ?? true,
          budgetOf(options)));
        try {
          return { archiveBytes: sealed.bytes(), view: JSON.parse(sealed.view_json()) };
        } finally { sealed.free(); }
      } finally { controller.close(); }
    } finally { plan.free(); }
  } finally { early?.free(); }
}

const runIdOf = (options) => options.runId ?? `run:wasm-n4a:${globalThis.crypto.randomUUID()}`;

/**
 * Train once in WASM and seal a canonical V1 `.n4a`. `record` is the exact IO
 * record bytes; `recipe` is the native pipeline recipe (object or JSON text),
 * parsed and refused or preserved completely by Core.
 */
export async function produceN4aNative(record, options) {
  const bytes = bytesOf(record, 'record'), settings = objectOf(options);
  const sourceId = text(settings.sourceId, 'sourceId');
  requireValue(typeof settings.recipe === 'string' || (settings.recipe !== null && typeof settings.recipe === 'object'),
    'recipe must be a native pipeline recipe object or its JSON text.');
  const recipe = typeof settings.recipe === 'string' ? settings.recipe : JSON.stringify(settings.recipe);
  const runId = runIdOf(settings), budget = budgetOf(settings);
  return train(settings, (deps, manifests) => {
    admit(deps.native, budget, bytes.byteLength);
    return new deps.native.N4aTrainPlan(bytes, sourceId, recipe, manifests, runId, budget);
  });
}

/**
 * Retrain from the recipe stored in the archive: the caller supplies a training
 * record and no recipe. Core reads and validates the stored recipe and source.
 */
export async function retrainN4aNative(archiveBytes, record, options = {}) {
  const archive = bytesOf(archiveBytes, 'archiveBytes'), bytes = bytesOf(record, 'record'), settings = objectOf(options);
  const runId = runIdOf(settings), budget = budgetOf(settings);
  // Core validates the archive and reads its stored recipe and source once, before any
  // runtime loads: anything outside the closed native model profile is refused here.
  const native = await loadArchiveV2Native();
  requireValue(typeof native?.N4aRetrainFacts === 'function', 'The loaded Core WASM bridge does not expose the .n4a retrain facts.');
  admit(native, budget, archive.byteLength);
  const facts = owner(() => new native.N4aRetrainFacts(archive, budget));
  return train(settings, (deps, manifests, held) => {
    admit(deps.native, budget, bytes.byteLength);
    return held.plan(bytes, manifests, runId, budget);
  }, facts);
}

/** Core-validated closed native-produced model view. Inspection is not executability. */
export async function inspectN4aBytes(archiveBytes, options = {}) {
  const bytes = bytesOf(archiveBytes, 'archiveBytes'), budget = budgetOf(objectOf(options));
  const native = await loadArchiveV2Native();
  requireValue(typeof native.inspect_n4a_bytes === 'function', 'The loaded Core WASM bridge does not expose inspect_n4a_bytes.');
  admit(native, budget, bytes.byteLength);
  return JSON.parse(owner(() => native.inspect_n4a_bytes(bytes, budget)));
}

/**
 * Replay an `.n4a` entrypoint in WASM. `record` is `undefined` for the stored
 * input or exact external IO bytes. `sampleIds` lists the selected partition in
 * the record's physical order; `replay` keeps the owner's own order, so align
 * predictions to rows by sample ID and target name.
 */
export async function predictN4aNative(archiveBytes, options) {
  const settings = objectOf(options), archive = bytesOf(archiveBytes, 'archiveBytes');
  const record = settings.record === undefined || settings.record === null ? undefined : bytesOf(settings.record, 'record');
  const entrypoint = text(settings.entrypoint, 'entrypoint'), sourceId = text(settings.sourceId, 'sourceId');
  const requestId = settings.requestId ?? 'request:wasm-n4a', runId = settings.runId ?? 'run:wasm-n4a:predict';
  const budget = budgetOf(settings);
  // Only the Core bridge loads before the plan: Core refuses an archive outside the supported
  // native profile before any Methods or DAG-ML runtime is touched. The plan is freed on every exit.
  const native = await loadArchiveV2Native();
  requireValue(typeof native?.N4aPredictPlan === 'function', 'The loaded Core WASM bridge does not expose the .n4a predict plan.');
  admit(native, budget, archive.byteLength, record?.byteLength ?? 0);
  const plan = owner(() => new native.N4aPredictPlan(archive, entrypoint, record, sourceId,
    settings.partition ?? 'predict', settings.requireTrainingSchema ?? true, requestId, budget));
  try {
    const deps = await runtime(settings);
    const ids = JSON.parse(plan.sample_ids_json()), targetNames = JSON.parse(plan.target_names_json());
    const controller = new deps.Controller({ methods: deps.methods, dagMl: deps.dag, digest: deps.digest, targetNames,
      ...resolvers({ sourceId, ids, x: plan.x(), cols: plan.cols }) });
    try {
      const replay = JSON.parse(owner(() => deps.dag.replay_training_package_json(plan.package_json(), plan.request_json(),
        plan.envelopes_json(), JSON.stringify(controller.manifests), `outcome:${requestId}`, runId, controller.callback)));
      return { replay, receipt: JSON.parse(plan.receipt_json()), sampleIds: ids };
    } finally { controller.close(); }
  } finally { plan.free(); }
}

// ---------------------------------------------------------------------------
// Generic `.n4a` storage: open, inventory, read, stream and write any V1 container.
//
// Storage only. Core's Rust bridge owns every ZIP, CRC, SHA-256, manifest and
// budget decision; this file parses no ZIP, computes no hash and holds no
// maximum. No Methods or DAG-ML runtime is loaded and no owner payload is
// deserialized or executed. Readability is not executability.
//
// Sources. A container is opened from exact bytes (held in WASM memory, with
// the full owner semantic view) or from an external random-access source: a
// Blob/File or `{ size, read(offset, length) }` with BigInt offsets and lengths.
// An external container keeps only validated metadata in WASM; every later read
// goes back to the source, is hashed by Core while it streams and is compared
// with the receipt before the final chunk is delivered. Core's metadata view
// reports `semantics` and `training_view` as `not_evaluated` for it, because no
// member bytes were read to evaluate them.
//
// Real host limits remain and are reported as `n4a host limit` errors rather
// than as format limits: JavaScript safe integers (2^53 - 1) for Blob offsets
// and array sizes, the engine's typed-array length, and wasm32 linear memory
// (an allocation that fails inside WASM traps instead of returning a refusal).
// ---------------------------------------------------------------------------
const STORAGE_OPEN = Symbol('n4a.storage.open');
// Native handles live here so a closed container drops its handle for good.
const storageHandles = new WeakMap();

const hostError = (message) => new Error(`n4a host source: ${message}`);
const hostLimit = (message) => new RangeError(`n4a host limit: ${message}`);

async function storageBridge() {
  const native = await loadArchiveV2Native();
  requireValue(['N4aContainerHandle', 'N4aWriter', 'N4aSourceScan', 'N4aSourceHandle', 'N4aStreamVerifier', 'N4aStreamWriter']
    .every((name) => typeof native?.[name] === 'function') && typeof native?.n4a_admit === 'function'
    && typeof native?.n4a_chunk_bytes === 'function',
  'The loaded Core WASM bridge does not expose the generic .n4a storage API.');
  return native;
}

const isByteLike = (value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value);
const toBigInt = (value, name) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${name} must be a BigInt or a safe integer.`);
};

// A random-access source: `size` and `read(offset, length)`, offsets and lengths
// as BigInt. `read` resolves to the bytes of exactly that range. Whether the range
// came back whole is Core's decision when the bytes are fed or hashed.
function randomAccess(value, name) {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      size: BigInt(value.size),
      async read(offset, length) {
        const end = offset + length;
        if (end > BigInt(Number.MAX_SAFE_INTEGER)) throw hostLimit('Blob offsets above 2^53 - 1 are not addressable');
        return new Uint8Array(await value.slice(Number(offset), Number(end)).arrayBuffer());
      },
    };
  }
  if (value !== null && typeof value === 'object' && typeof value.read === 'function' && 'size' in value) {
    const size = toBigInt(value.size, `${name}.size`);
    if (size < 0n || size > U64_MAX) throw new RangeError(`${name}.size must lie in 0..18446744073709551615.`);
    // Copied at the read boundary: a reader may reuse one buffer for every call, and a chunk that
    // is hashed, held back for verification and delivered later must not be overwritten meanwhile.
    return { size, read: async (offset, length) => bytesOf(await value.read(offset, length), `${name}.read result`).slice() };
  }
  if (isByteLike(value)) {
    const bytes = bytesOf(value, name);
    return {
      size: BigInt(bytes.byteLength),
      // A copy of the requested range, so a consumer that keeps a chunk never aliases the caller's array.
      read: async (offset, length) => bytes.slice(Number(offset), Number(offset + length)),
    };
  }
  throw new TypeError(`${name} must be exact bytes (Uint8Array or ArrayBuffer), a Blob/File or a { size, read(offset, length) } source, not text or a plain object.`);
}

// One live container: its native handle plus, for an external source, the source.
function liveRecord(container) {
  const record = container instanceof N4aContainer ? storageHandles.get(container) : undefined;
  requireValue(record !== undefined, container instanceof N4aContainer
    ? 'The .n4a container is closed.' : 'base must be an N4aContainer returned by openN4aContainer.');
  return record;
}
const memoryOnly = (record, name) =>
  requireValue(record.kind === 'bytes', `${name} needs exact bytes in WASM memory; this container is held by an external source: use the async read or stream methods.`);

// Verified chunks of `[offset, offset + length)` of an external source. The last
// chunk is held back until Core compared the digest of every byte actually read
// with the validated receipt; a mismatch throws before it is delivered.
async function* verifiedChunks(record, container, range) {
  const { handle, native, source } = record;
  const chunk = handle.chunk_bytes();
  owner(() => handle.admit(chunk));
  const verifier = new native.N4aStreamVerifier();
  try {
    let held;
    for (let done = 0n; done < range.length;) {
      liveRecord(container);
      const wanted = range.length - done < chunk ? range.length - done : chunk;
      const data = await source.read(range.offset + done, wanted);
      if (BigInt(data.byteLength) !== wanted) throw hostError(`the source returned ${data.byteLength} of ${wanted} requested bytes`);
      owner(() => verifier.update(data));
      if (held !== undefined) yield held;
      held = data;
      done += wanted;
    }
    owner(() => range.verify(verifier));
    if (held !== undefined) yield held;
  } finally { verifier.free(); }
}

async function* storedChunks(record, container, length, read) {
  const chunk = record.handle.chunk_bytes();
  for (let offset = 0n; offset < length; offset += chunk) {
    liveRecord(container);
    yield owner(() => read(offset, length - offset < chunk ? length - offset : chunk));
  }
}

function asStream(path, length, chunks) {
  return { path, byteLength: length, [Symbol.asyncIterator]: chunks };
}

async function collect(stream) {
  if (stream.byteLength > BigInt(Number.MAX_SAFE_INTEGER)) throw hostLimit('the size exceeds JavaScript safe integers');
  let out;
  try { out = new Uint8Array(Number(stream.byteLength)); } catch (error) {
    if (error instanceof RangeError) throw hostLimit(`${stream.byteLength} bytes exceed the typed-array length of this engine`);
    throw error;
  }
  let at = 0;
  for await (const chunk of stream) { out.set(chunk, at); at += chunk.byteLength; }
  return out;
}

/**
 * A validated, immutable `.n4a` container. Obtain one from `openN4aContainer` and
 * call `close()` when finished; it frees the WASM allocation immediately.
 */
export class N4aContainer {
  constructor(token, record) {
    requireValue(token === STORAGE_OPEN, 'Use openN4aContainer to open a .n4a container.');
    storageHandles.set(this, record);
  }

  get closed() { return !storageHandles.has(this); }

  /** `'bytes'` (held in WASM memory) or `'external'` (a Blob/File or `{ size, read }` source). */
  get kind() { return liveRecord(this).kind; }

  /** Exact archive length in bytes, as a BigInt. */
  get size() { return BigInt(liveRecord(this).handle.archive_length()); }

  /** Core's container view, parsed with `JSON.parse` (integers above 2^53 are rounded). */
  view() { const { handle } = liveRecord(this); return JSON.parse(owner(() => handle.view_json())); }

  /** The exact stored `manifest.json` bytes. */
  manifestBytes() { const { handle } = liveRecord(this); return owner(() => handle.manifest_bytes()); }

  /** Member paths of one artifact (empty for a reference artifact), or `undefined` for an unknown id. */
  artifactMemberPaths(artifactId) {
    const { handle } = liveRecord(this);
    requireValue(typeof artifactId === 'string', 'artifactId must be a string.');
    const paths = owner(() => handle.artifact_member_paths_json(artifactId));
    return paths === undefined ? undefined : JSON.parse(paths);
  }

  /** The exact bytes of one member, or `undefined`. Bytes-held containers only; see `readMember`. */
  member(path) {
    const record = liveRecord(this); memoryOnly(record, 'member');
    requireValue(typeof path === 'string', 'path must be a string.');
    return owner(() => record.handle.member(path));
  }

  /** Embedded members of one artifact as `{ path, bytes }`, or `undefined`. Bytes-held containers only. */
  artifactMembers(artifactId) {
    const record = liveRecord(this); memoryOnly(record, 'artifactMembers');
    const paths = this.artifactMemberPaths(artifactId);
    return paths === undefined ? undefined : paths.map((path) => ({ path, bytes: owner(() => record.handle.member(path)) }));
  }

  /** An independent copy of the original archive bytes. Bytes-held containers only; see `readArchive`. */
  archiveBytes() {
    const record = liveRecord(this); memoryOnly(record, 'archiveBytes');
    return owner(() => record.handle.archive_bytes());
  }

  /**
   * The member as an async iterable of chunks, or `undefined` when the path is not in the
   * inventory. `byteLength` is a BigInt. On an external source the bytes are re-read, hashed
   * by Core and compared with the receipt before the final chunk is delivered: bytes yielded
   * earlier are unverified until iteration completes without throwing.
   */
  memberStream(path) {
    const record = liveRecord(this);
    requireValue(typeof path === 'string', 'path must be a string.');
    const { handle } = record;
    if (record.kind === 'bytes') {
      const length = owner(() => handle.member_length(path));
      return length === undefined ? undefined : asStream(path, length, () => storedChunks(record, this, length,
        (offset, size) => handle.member_chunk(path, offset, size)));
    }
    const range = owner(() => handle.member_range(path));
    if (range === undefined) return undefined;
    const [offset, length] = range;
    return asStream(path, length, () => verifiedChunks(record, this, {
      offset, length, verify: (verifier) => handle.verify_member(path, verifier),
    }));
  }

  /** Like `memberStream` for the whole original archive, verified against `container_sha256`. */
  archiveStream() {
    const record = liveRecord(this);
    const { handle } = record, length = handle.archive_length();
    if (record.kind === 'bytes') return asStream(undefined, length, () => storedChunks(record, this, length,
      (offset, size) => handle.archive_chunk(offset, size)));
    return asStream(undefined, length, () => verifiedChunks(record, this, {
      offset: 0n, length, verify: (verifier) => handle.verify_archive(verifier),
    }));
  }

  /** The exact bytes of one member, or `undefined`; verified on an external source. Allocates the whole member. */
  async readMember(path) {
    const record = liveRecord(this);
    if (record.kind === 'bytes') return this.member(path);
    const stream = this.memberStream(path);
    if (stream === undefined) return undefined;
    owner(() => record.handle.admit(stream.byteLength));
    return collect(stream);
  }

  /** The exact archive bytes, verified on an external source. Allocates the whole archive. */
  async readArchive() {
    const record = liveRecord(this);
    if (record.kind === 'bytes') return this.archiveBytes();
    owner(() => record.handle.admit(record.handle.archive_length()));
    return collect(this.archiveStream());
  }

  /** Free the WASM allocation and drop the source. Idempotent; every other method throws afterwards. */
  close() {
    const record = storageHandles.get(this);
    if (record === undefined) return;
    storageHandles.delete(this);
    record.handle.free();
  }
}

/**
 * Validate any V1 `.n4a` container once (physical layout, manifest, sizes and
 * SHA-256 of every member) and return an immutable handle.
 *
 * `source` is exact bytes, a `Blob`/`File`, or `{ size, read(offset, length) }`
 * whose BigInt arguments select the range. Bytes are copied into WASM memory once.
 * An external source is read in chunks by Core's scanner and never loaded whole.
 * `options.memoryBudgetBytes` is the optional working-memory budget: Core admits the
 * allocation before the copy, and `undefined` declares no Core ceiling. Core refuses
 * invalid, tampered, unsupported or over-budget input with an Error naming the category.
 */
export async function openN4aContainer(source, options = {}) {
  const settings = objectOf(options), budget = budgetOf(settings);
  const input = isByteLike(source) ? bytesOf(source, 'archiveBytes') : randomAccess(source, 'archiveBytes');
  const native = await storageBridge();
  if (input instanceof Uint8Array) {
    admit(native, budget, input.byteLength);
    return new N4aContainer(STORAGE_OPEN, { kind: 'bytes', native, handle: owner(() => new native.N4aContainerHandle(input, budget)) });
  }
  const scan = owner(() => new native.N4aSourceScan(input.size, budget));
  try {
    for (;;) {
      const offset = owner(() => scan.next_offset());
      if (offset === undefined) break;
      const length = owner(() => scan.next_length());
      const data = await input.read(offset, length);
      owner(() => scan.feed(data));
    }
    return new N4aContainer(STORAGE_OPEN, { kind: 'external', native, source: input, handle: owner(() => scan.finish()) });
  } finally { scan.free(); }
}

function manifestInput(manifest) {
  if (typeof manifest === 'string') return new TextEncoder().encode(manifest);
  if (manifest instanceof ArrayBuffer || ArrayBuffer.isView(manifest)) return bytesOf(manifest, 'manifest');
  requireValue(manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest),
    'manifest must be JSON text, exact JSON bytes or a manifest object.');
  return new TextEncoder().encode(JSON.stringify(manifest));
}

/**
 * Write a new V1 `.n4a` container in memory; nothing is ever modified in place.
 *
 * `manifest` is the V1 manifest (JSON text, JSON bytes or object). Core derives
 * every member's size and SHA-256, so declared values may be placeholders, and
 * re-serializes the manifest canonically. `members` is an array of
 * `{ path, bytes }` so duplicate paths reach Core's refusal. With
 * `options.base` (an open bytes-held `N4aContainer`) each member the manifest
 * declares takes its bytes from `members`, otherwise from the base; omit a member
 * from the manifest to remove it. The base stays valid and unchanged.
 * `options.memoryBudgetBytes` is the optional working-memory budget.
 *
 * Returns `{ archiveBytes, receipt }`. Core owns path rules, closure and memory
 * checks and refuses with an Error. For archives that should not be assembled in
 * memory, use `writeN4aStream`.
 */
export async function writeN4aContainer(manifest, members, options = {}) {
  const settings = objectOf(options), budget = budgetOf(settings);
  const manifestBytes = manifestInput(manifest);
  requireValue(Array.isArray(members), 'members must be an array of { path, bytes }.');
  const entries = members.map((member, index) => {
    requireValue(member !== null && typeof member === 'object', `members[${index}] must be { path, bytes }.`);
    return [text(member.path, `members[${index}].path`), bytesOf(member.bytes, `members[${index}].bytes`)];
  });
  const baseRecord = settings.base === undefined ? undefined : liveRecord(settings.base);
  if (baseRecord !== undefined) memoryOnly(baseRecord, 'writeN4aContainer base');
  const native = await storageBridge();
  // Looked up again after the await: the base may have been closed meanwhile.
  const base = settings.base === undefined ? undefined : liveRecord(settings.base).handle;
  const writer = new native.N4aWriter();
  let consumed = false;
  let written;
  try {
    // `N4aWriter` retains every member until `finish`, and the manifest is copied then too:
    // admit the cumulative bytes held in WASM memory before each copy, not each array alone.
    let held = BigInt(manifestBytes.byteLength);
    admit(native, budget, held);
    for (const [path, bytes] of entries) {
      held += BigInt(bytes.byteLength);
      admit(native, budget, held);
      writer.add_member(path, bytes);
    }
    // `finish*` consume the builder even when Core refuses; it must not be freed again.
    consumed = true;
    written = owner(() => (base === undefined ? writer.finish(manifestBytes, budget) : writer.finish_update(base, manifestBytes, budget)));
  } finally {
    if (!consumed) writer.free();
  }
  let taken = false;
  try {
    const receipt = JSON.parse(written.receipt_json());
    // `into_bytes` consumes the result and hands over the archive without cloning.
    taken = true;
    return { archiveBytes: written.into_bytes(), receipt };
  } finally {
    if (!taken) written.free();
  }
}

/**
 * Write a new V1 `.n4a` container to a sink without assembling the archive.
 *
 * `members` is an array of `{ path, source }` where `source` is exact bytes, a
 * `Blob`/`File` or `{ size, read(offset, length) }` (BigInt arguments). Sources
 * are read twice: pass 1 hashes them through Core, Core then plans the exact
 * archive, pass 2 streams the payload to the sink. A source whose bytes changed
 * between the passes is refused by Core as an integrity failure. With
 * `options.base` (any open `N4aContainer`) each member the manifest declares and
 * `members` omits is copied from the base, verified as it is read; the base is
 * never modified. `options.memoryBudgetBytes` is the optional working-memory budget.
 *
 * `sink` is `{ write(chunk), close?(), abort?(error) }`; `write` may return a promise.
 * Chunks are appended in order and are independent copies. On any failure once the
 * write started `abort` is called with the error, and the sink MUST be discarded: it
 * may already hold bytes that were not verified. `close` is called only after Core finished and
 * confirmed the container SHA-256 from the bytes written.
 *
 * Resolves to `{ receipt }` (same shape as `writeN4aContainer`).
 */
export async function writeN4aStream(manifest, members, sink, options = {}) {
  const settings = objectOf(options), budget = budgetOf(settings);
  const manifestBytes = manifestInput(manifest);
  requireValue(Array.isArray(members), 'members must be an array of { path, source }.');
  requireValue(sink !== null && typeof sink === 'object' && typeof sink.write === 'function',
    'sink must be an object with a write(chunk) method.');
  const entries = members.map((member, index) => {
    requireValue(member !== null && typeof member === 'object', `members[${index}] must be { path, source }.`);
    return [text(member.path, `members[${index}].path`), randomAccess(member.source, `members[${index}].source`)];
  });
  if (settings.base !== undefined) liveRecord(settings.base);
  const native = await storageBridge();
  const baseContainer = settings.base;
  const baseRecord = baseContainer === undefined ? undefined : liveRecord(baseContainer);
  const chunk = BigInt(native.n4a_chunk_bytes(budget));
  const sources = new Map(entries);
  let writer;
  try {
    // Core charges one streaming chunk to the budget; a budget below it refuses here. The
    // manifest copy into WASM memory is admitted together with it, before the constructor.
    admit(native, budget, chunk, manifestBytes.byteLength);
    writer = owner(() => new native.N4aStreamWriter(manifestBytes, budget));
    // Pass 1: digest every new member through Core's hasher.
    for (const [path, source] of entries) {
      const verifier = new native.N4aStreamVerifier();
      try {
        for (let offset = 0n; offset < source.size; offset += chunk) {
          const wanted = source.size - offset < chunk ? source.size - offset : chunk;
          const data = await source.read(offset, wanted);
          if (BigInt(data.byteLength) !== wanted) throw hostError(`'${path}' returned ${data.byteLength} of ${wanted} requested bytes`);
          owner(() => verifier.update(data));
        }
        owner(() => writer.add_member(path, verifier));
      } finally { verifier.free(); }
    }
    if (baseRecord === undefined) owner(() => writer.build());
    else if (baseRecord.kind === 'bytes') owner(() => writer.build_from_bytes_base(baseRecord.handle));
    else owner(() => writer.build_from_source_base(baseRecord.handle));
    // Pass 2: append Core's frames and stream each member's payload.
    for (;;) {
      const step = owner(() => writer.next_step());
      if (step === 0) break;
      if (step === 1) { await sink.write(owner(() => writer.frame())); continue; }
      const path = owner(() => writer.member_path()), length = owner(() => writer.member_length());
      const source = sources.get(path);
      if (source !== undefined) {
        for (let offset = 0n; offset < length; offset += chunk) {
          const wanted = length - offset < chunk ? length - offset : chunk;
          const data = await source.read(offset, wanted);
          if (BigInt(data.byteLength) !== wanted) throw hostError(`'${path}' changed: returned ${data.byteLength} of ${wanted} requested bytes`);
          owner(() => writer.update_member(data));
          await sink.write(data);
        }
      } else {
        for await (const data of baseStream(baseContainer, path)) {
          owner(() => writer.update_member(data));
          await sink.write(data);
        }
      }
    }
    const receipt = JSON.parse(owner(() => writer.finish()));
    if (typeof sink.close === 'function') await sink.close();
    return { receipt };
  } catch (error) {
    if (typeof sink.abort === 'function') { try { await sink.abort(error); } catch { /* the original error wins */ } }
    throw error;
  } finally {
    writer?.free();
  }
}

// A retained member comes from the base through its own verified stream.
function baseStream(base, path) {
  const stream = base?.memberStream(path);
  requireValue(stream !== undefined, `The base holds no member '${path}'.`);
  return stream;
}
