// RtError — the Web slice of the unified runtime error envelope (B-018; RT_spec §RT-003;
// SW8_RT_STUDIO_IMPL_spec §5). The dag-ml/WASM engine historically degraded to the
// libn4m fold chain *silently* on a scheduler failure: the run still returned a
// RunResult tagged `executed by dag-ml`, so an unsupported/failed dag-ml path was
// indistinguishable from a clean execution. This module makes that explicit.
//
// `RtError` is a narrow, serializable wrapper (it crosses the Web Worker boundary as
// plain data on `RunResult.diagnostics`) that carries *why* the engine fell back, so
// runtime consumers get a typed error path instead of a silent success. The
// vocabulary — `cause` / `mitigation` / `unsupported_capability` / `portable_level`
// — is OWNED by CAP-004 / CAP-002 and only CARRIED here (DEC-RT-001): RT freezes the
// envelope, not the vocabulary.
//
// WIRE PARITY (W7 / B-018): the *wire* form is `rtErrorToWire()`, which is byte-identical
// to the Python `nirs4all.pipeline.dagml.rt.RtError.to_dict()` and validates against the
// neutral contract `nirs4all-ecosystem/docs/contracts/runtime/rt_error.v1.schema.json`
// (`additionalProperties: false`, required `[verb, cause, message]`). That contract has
// NO `schema_version` (that field belongs to RtResult, not RtError) and NO `detail`, so
// neither may appear on the wire. `detail` is kept ONLY as an in-memory debug aid and is
// stripped by `rtErrorToWire` — mirroring how Python keeps `__cause__` off `to_dict()`.

/** The eight runtime verbs (RT-001 / DEC-RT-001) — mirrors `rt.py` `RT_VERBS` and
 *  `rt_error.v1.schema.json#/properties/verb/enum`. The web engine only emits `run` / `predict`. */
export const RT_VERBS = ['inspect', 'validate', 'plan', 'run', 'predict', 'replay', 'explain', 'export'] as const
export type RtVerb = (typeof RT_VERBS)[number]

/**
 * The coarse wire causes (RT-003 migration table) — mirrors `rt.py` `RT_ERROR_CAUSES` and
 * `rt_error.v1.schema.json#/properties/cause/enum`. Vocabulary OWNED by CAP-004, CARRIED here.
 *  - `unsupported_shape`       — the pipeline/graph shape isn't schedulable by dag-ml
 *                                (maps the Python `DagMlUnsupported` / `NotImplementedError`).
 *  - `unsupported_capability`  — a required capability is missing / refused (e.g. a cost guard).
 *  - `unavailable_backend`     — neither mechanism is installed/loadable (Python `DagMlUnavailable`).
 *  - `invalid_request`         — the request itself is rejected (e.g. variant cap exceeded).
 *  - `runtime_error`           — an unclassified failure during execution.
 */
export const RT_ERROR_CAUSES = ['unsupported_shape', 'unsupported_capability', 'unavailable_backend', 'invalid_request', 'runtime_error'] as const
export type RtErrorCause = (typeof RT_ERROR_CAUSES)[number]

/** The exact key set the wire envelope may carry (`rt_error.v1.schema.json` properties, under
 *  `additionalProperties: false`). `schema_version` / `detail` are deliberately absent — a wire
 *  dict carrying either would fail validation. Required keys are `verb` / `cause` / `message`. */
export const RT_ERROR_WIRE_KEYS = ['verb', 'cause', 'message', 'mitigation', 'unsupported_capability', 'portable_level'] as const

/**
 * RtError v1 — the **wire** envelope. Byte-parity with `rt_error.v1.schema.json` and the
 * Python `RtError.to_dict()` output: exactly these keys, no more. Produced by `rtErrorToWire`.
 */
export interface RtErrorWire {
  verb: RtVerb
  cause: RtErrorCause
  /** human-readable summary (kept identical to any pre-existing thrown message for UI stability) */
  message: string
  /** actionable next step (CAP-004 vocab) — e.g. "simplify the graph to model-only" */
  mitigation?: string
  /** the missing capability, when `cause === 'unsupported_capability'` (CAP-004) */
  unsupported_capability?: string
  /** CAP-002 portability level, when known — carried opaquely, never interpreted here (null in V1) */
  portable_level?: string | null
}

/**
 * RtError — the **in-memory** envelope: the wire shape plus an optional non-contract `detail`.
 * Safe to attach to a `RunResult` and to cross the worker boundary as cloned data. Serialize for
 * the contract wire via `rtErrorToWire` (which drops `detail` and omits empty optionals).
 */
export interface RtError extends RtErrorWire {
  /** non-contract, in-memory-only: the raw underlying error text, or which fallback was taken.
   *  NEVER emitted on the wire — `rtErrorToWire` strips it so the wire form stays contract-exact. */
  detail?: string
}

/** Build an in-memory RtError. The single typed construction seam; pairs with `rtErrorToWire`. */
export function makeRtError(init: RtError): RtError {
  return { ...init }
}

/**
 * Project an RtError to its **wire** dict — byte-parity with the Python `RtError.to_dict()`:
 * always `{ verb, cause, message }`, plus each optional only when it is set (and `portable_level`
 * only when non-null), with the in-memory-only `detail` stripped. The result is exactly the
 * `rt_error.v1.schema.json` shape (`additionalProperties: false`), so it round-trips across the
 * Python / Studio / Web boundary unchanged.
 */
export function rtErrorToWire(e: RtError): RtErrorWire {
  const wire: RtErrorWire = { verb: e.verb, cause: e.cause, message: e.message }
  if (e.mitigation !== undefined) wire.mitigation = e.mitigation
  if (e.unsupported_capability !== undefined) wire.unsupported_capability = e.unsupported_capability
  if (e.portable_level !== undefined && e.portable_level !== null) wire.portable_level = e.portable_level
  return wire
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : String(err)

/**
 * Classify a caught error into an RtError `cause` from its message. The web engine
 * has no structured error type from WASM (it surfaces strings), so this mirrors the
 * RT_spec RT-003 migration table heuristically. `over` lets the call site pin the
 * `verb`, force a `cause`, or attach a `mitigation` it knows is correct.
 */
export function rtErrorFromUnknown(verb: RtVerb, err: unknown, over: Partial<RtError> = {}): RtError {
  const raw = messageOf(err)
  let cause: RtErrorCause = 'runtime_error'
  if (/unsupported|not (yet )?(executable|schedulable|supported)|no controller registered|cannot (plan|schedule)|planning[_ ]?failed/i.test(raw)) {
    cause = 'unsupported_shape'
  } else if (/unavailable|not loaded|failed to (load|init)|wasm (module )?(failed|missing)/i.test(raw)) {
    cause = 'unavailable_backend'
  } else if (/max_variants|too many variants|exceed|invalid request/i.test(raw)) {
    cause = 'invalid_request'
  }
  return makeRtError({ verb, cause, message: raw, detail: raw, ...over })
}

/**
 * A throwable carrier for the strict (`allowFallback: false`) path: it is a real
 * `Error` (so existing `try/catch` and `.message` assertions keep working) that also
 * carries the typed `rtError` for consumers that want to switch on `cause`.
 */
export class RtErrorException extends Error {
  readonly rtError: RtError
  constructor(rtError: RtError) {
    super(rtError.message)
    this.name = 'RtErrorException'
    this.rtError = rtError
  }
}

/** Type guard for consumers catching engine errors. */
export function isRtErrorException(e: unknown): e is RtErrorException {
  return e instanceof RtErrorException || (e instanceof Error && e.name === 'RtErrorException' && 'rtError' in e)
}
