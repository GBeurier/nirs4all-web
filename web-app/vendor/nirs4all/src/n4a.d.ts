import type { NativePipelineRecipe } from './native-pipeline.js';

/** Exact bytes only: text and objects are refused so identities stay byte-exact. */
export type N4aBytes = Uint8Array | ArrayBuffer | ArrayBufferView;

/**
 * Runtime selection shared by every action. All three default to the installed
 * `dag-ml-wasm`, `@nirs4all/methods` and `dag-ml-wasm/n4m-estimator-controller`.
 * The Methods module and the DAG-ML native manifestations must come from one
 * Methods revision; a mismatch is refused before any estimator callback.
 */
export interface N4aRuntimeOptions {
  dagMl?: unknown;
  methods?: unknown;
  estimatorAdapter?: unknown;
}

/** Optional working-memory budget shared by every `.n4a` operation. */
export interface N4aMemoryOptions {
  /**
   * Working-memory budget in bytes: a safe integer, a BigInt or exact decimal text
   * (never rounded), 0..18446744073709551615. Core admits an allocation before any
   * wasm-bindgen copy and refuses with a memory error when it exceeds the budget.
   * `undefined` declares no Core ceiling: only the allocator and real host limits
   * (safe integers, typed-array length, wasm32 linear memory) remain.
   */
  memoryBudgetBytes?: number | bigint | string;
}

export interface N4aTrainOptions extends N4aRuntimeOptions, N4aMemoryOptions {
  /** Defaults to a random UUID run identifier. */
  runId?: string;
  /** Defaults to a random UUID container identifier. */
  containerId?: string;
  /** Embed the exact IO record as the training anchor and stored prediction input (default true). */
  embedTrainingRecord?: boolean;
}

export interface ProduceN4aOptions extends N4aTrainOptions {
  sourceId: string;
  /** Native pipeline recipe, or its exact JSON text. Core parses and either preserves or refuses it. */
  recipe: NativePipelineRecipe | string;
}

/**
 * Core's closed native-produced model view: `manifest`, `receipt`,
 * `training` (`outcome`, `source_id`) and `limits`. Parsed with `JSON.parse`,
 * so integers above 2^53 (for example seeds) are rounded in this object.
 */
export interface N4aView {
  manifest: Record<string, unknown>;
  receipt: { container_sha256: string; manifest_sha256: string; byte_length: number };
  training: { outcome: Record<string, any>; source_id: string };
  limits: Record<string, number>;
}

export interface N4aProduction {
  /** Sealed canonical V1 `.n4a` bytes. */
  archiveBytes: Uint8Array;
  /** View of the same fit; the archive is not reopened to build it. */
  view: N4aView;
}

export interface PredictN4aOptions extends N4aRuntimeOptions, N4aMemoryOptions {
  /** Exact external IO record bytes; omit for the stored input. */
  record?: N4aBytes;
  entrypoint: string;
  sourceId: string;
  /** Selected partition (default `predict`; stored input uses the training partition). */
  partition?: string;
  requestId?: string;
  runId?: string;
  /** `false` only allows an unavailable schema anchor; a present bad anchor is always refused. */
  requireTrainingSchema?: boolean;
}

export interface N4aPrediction {
  /** The signed DAG-ML replay in the owner's own row order. */
  replay: Record<string, any>;
  receipt: Record<string, any>;
  /** Selected partition's sample IDs in the record's physical order. */
  sampleIds: string[];
}

/** Train once in WASM through Core/IO/DAG-ML/Methods and seal a canonical V1 `.n4a`. */
export function produceN4aNative(record: N4aBytes, options: ProduceN4aOptions): Promise<N4aProduction>;
/** Retrain from the recipe stored in the archive; the caller supplies a training record and no recipe. */
export function retrainN4aNative(archiveBytes: N4aBytes, record: N4aBytes, options?: N4aTrainOptions): Promise<N4aProduction>;
/** Core-validated view of a closed native-produced model. Inspection is not executability. */
export function inspectN4aBytes(archiveBytes: N4aBytes, options?: N4aMemoryOptions): Promise<N4aView>;
/** Replay an `.n4a` entrypoint in WASM; unsupported profiles are refused explicitly. */
export function predictN4aNative(archiveBytes: N4aBytes, options: PredictN4aOptions): Promise<N4aPrediction>;

export interface N4aMemberBytes {
  /** Archive path. It is a name inside the container, never an operating-system path. */
  path: string;
  bytes: Uint8Array;
}

/**
 * A random-access archive or member source with BigInt offsets and lengths.
 * `read` resolves to the bytes of exactly `[offset, offset + length)`. A `Blob`
 * or `File` is accepted directly. `size` is a safe integer or a BigInt. The bytes `read`
 * returns are copied immediately, so a reader may reuse one buffer for every call.
 */
export interface N4aRandomAccessSource {
  size: number | bigint;
  read(offset: bigint, length: bigint): N4aBytes | Promise<N4aBytes>;
}
/** Exact bytes, a `Blob`/`File` or a random-access reader. */
export type N4aSource = N4aBytes | Blob | N4aRandomAccessSource;

/** Chunks of one member or of the whole archive; single pass per `[Symbol.asyncIterator]()` call. */
export interface N4aChunkStream extends AsyncIterable<Uint8Array> {
  /** Archive path of the member, `undefined` for `archiveStream`. */
  readonly path: string | undefined;
  /** Exact number of bytes the stream delivers. */
  readonly byteLength: bigint;
}

/**
 * Core's container view of any V1 `.n4a`: the verified storage receipt and
 * manifest plus a report-only semantic summary. Parsed with `JSON.parse`, so
 * integers above 2^53 are rounded. Reading is not executability: no runtime is
 * loaded, owner payloads stay opaque unless their owner is linked into Core,
 * and `executability` is always `not_evaluated`. For a container held by an
 * external source no member bytes were read, so `semantics` and `training_view`
 * report `not_evaluated` instead of a result.
 */
export interface N4aContainerView {
  readability: {
    storage: 'verified';
    container_sha256: string;
    manifest_sha256: string;
    byte_length: number;
    manifest: Record<string, any>;
    required_features: string[];
    semantics: Record<string, any>;
    training_view: Record<string, any>;
    [key: string]: unknown;
  };
  executability: 'not_evaluated';
  [key: string]: unknown;
}

/**
 * A validated, immutable `.n4a` container (storage only). Obtain it from
 * `openN4aContainer`; call `close()` to free the WASM allocation. Every other
 * method throws once the container is closed.
 *
 * `kind` is `'bytes'` (the archive is held in WASM memory; the synchronous byte
 * methods work) or `'external'` (a `Blob`/`File`/reader holds the bytes; only
 * validated metadata is in WASM, and the synchronous byte methods throw).
 */
export class N4aContainer {
  private constructor();
  readonly closed: boolean;
  readonly kind: 'bytes' | 'external';
  /** Exact archive length in bytes. */
  readonly size: bigint;
  view(): N4aContainerView;
  /** The exact stored `manifest.json` bytes. */
  manifestBytes(): Uint8Array;
  /** Member paths of one artifact (empty for a reference artifact); `undefined` for an unknown id. */
  artifactMemberPaths(artifactId: string): string[] | undefined;
  /** Exact member bytes, or `undefined` when the path is not in the inventory. `kind === 'bytes'` only. */
  member(path: string): Uint8Array | undefined;
  /** Embedded members in the artifact's declared order; `undefined` for an unknown artifact id. `kind === 'bytes'` only. */
  artifactMembers(artifactId: string): N4aMemberBytes[] | undefined;
  /** An independent copy of the original archive bytes. `kind === 'bytes'` only. */
  archiveBytes(): Uint8Array;
  /**
   * The member as chunks, or `undefined` for an unknown path. On an external source the bytes
   * are re-read and hashed by Core while they stream; the final chunk is delivered only after
   * they matched the receipt, so earlier chunks stay unverified until iteration completes.
   */
  memberStream(path: string): N4aChunkStream | undefined;
  /** The whole original archive as chunks, verified against `container_sha256` the same way. */
  archiveStream(): N4aChunkStream;
  /** Exact member bytes (verified on an external source), or `undefined`. Allocates the whole member. */
  readMember(path: string): Promise<Uint8Array | undefined>;
  /** Exact archive bytes (verified on an external source). Allocates the whole archive. */
  readArchive(): Promise<Uint8Array>;
  /** Idempotent. */
  close(): void;
}

export interface N4aOpenOptions extends N4aMemoryOptions {}

export interface N4aWriteOptions extends N4aMemoryOptions {
  /**
   * Open container to update. Members the manifest declares and `members` omits are taken
   * from it; it is never modified. `writeN4aContainer` needs a `kind === 'bytes'` base;
   * `writeN4aStream` accepts either kind.
   */
  base?: N4aContainer;
}

export interface N4aWriteReceipt {
  container_sha256: string;
  manifest_sha256: string;
  byte_length: number;
  /** Declared members with the sizes and SHA-256 values Core derived. */
  members: { path: string; byte_length: number; sha256: string }[];
}

export interface N4aWriteResult {
  /** Canonical V1 `.n4a` bytes. */
  archiveBytes: Uint8Array;
  receipt: N4aWriteReceipt;
}

/** Destination of `writeN4aStream`. On any failure it must be discarded. */
export interface N4aSink {
  /** Called with each chunk in order; the chunk is an independent copy. */
  write(chunk: Uint8Array): void | Promise<void>;
  /** Called once, after Core confirmed the container SHA-256 of the bytes written. */
  close?(): void | Promise<void>;
  /** Called with the error on any failure after writing started; the sink may hold unverified bytes. */
  abort?(error: unknown): void | Promise<void>;
}

/**
 * Validate any V1 `.n4a` container once and return an immutable handle. `source` is exact
 * bytes (copied into WASM memory once, with the full owner semantic view), a `Blob`/`File`,
 * or a random-access `{ size, read(offset, length) }` with BigInt arguments (read in chunks
 * by Core's scanner and never loaded whole). Core admits the allocation against
 * `memoryBudgetBytes` before any copy and refuses invalid, tampered, unsupported or
 * over-budget input with an Error that names the refusal category. Storage only: no Methods
 * or DAG-ML runtime is loaded and no owner payload is deserialized.
 */
export function openN4aContainer(source: N4aSource, options?: N4aOpenOptions): Promise<N4aContainer>;
/**
 * Write a new V1 `.n4a` container in memory, or an updated copy of `options.base`.
 * `manifest` is JSON text, exact JSON bytes or an object; Core derives member
 * sizes and SHA-256, re-serializes the manifest canonically and enforces every
 * closure and memory rule. `members` is an array so duplicate paths are refused
 * by Core rather than collapsed. Nothing is modified in place.
 */
export function writeN4aContainer(
  manifest: string | N4aBytes | Record<string, unknown>,
  members: { path: string; bytes: N4aBytes }[],
  options?: N4aWriteOptions,
): Promise<N4aWriteResult>;
/**
 * Write a new V1 `.n4a` container to a sink without assembling the archive. Sources are read
 * twice (Core hashes them, plans the exact archive, then the payload streams to the sink); a
 * source that changed in between is refused. Retained base members are copied verified.
 * On failure the sink is aborted and must be discarded. Resolves to the owner receipt.
 */
export function writeN4aStream(
  manifest: string | N4aBytes | Record<string, unknown>,
  members: { path: string; source: N4aSource }[],
  sink: N4aSink,
  options?: N4aWriteOptions,
): Promise<{ receipt: N4aWriteReceipt }>;
