// RtError — the web slice of the runtime error envelope (B-018; RT_spec §RT-003;
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
// envelope, not the vocabulary. Field names mirror the neutral
// `nirs4all-ecosystem/docs/contracts/runtime/rt_error.v1.schema.json` (snake_case for
// the multi-word contract fields) so the Python / Studio / Web envelopes are wire-identical.

/** The eight runtime verbs (RT_spec RT-001). The web engine only emits `run`/`predict`. */
export type RtVerb = 'inspect' | 'validate' | 'plan' | 'run' | 'predict' | 'replay' | 'explain' | 'export'

/**
 * Why a verb could not run natively (CAP-004 cause set; RT_spec RT-003 migration table):
 *  - `unsupported_shape`       — the pipeline/graph shape isn't schedulable by dag-ml
 *                                (maps the Python `DagMlUnsupported`).
 *  - `unsupported_capability`  — a required capability is missing / refused (e.g. a cost guard).
 *  - `unavailable_backend`     — neither mechanism is installed/loadable (Python `DagMlUnavailable`).
 *  - `invalid_request`         — the request itself is rejected (e.g. variant cap exceeded).
 *  - `runtime_error`           — an unclassified failure during execution.
 */
export type RtErrorCause =
  | 'unsupported_shape'
  | 'unsupported_capability'
  | 'unavailable_backend'
  | 'invalid_request'
  | 'runtime_error'

/** RtError v1 — the wire envelope. Serializable; safe to attach to a RunResult. */
export interface RtError {
  /** schema marker so a serialized diagnostic is self-describing across the worker/UI boundary */
  schema_version: 1
  verb: RtVerb
  cause: RtErrorCause
  /** human-readable summary (kept identical to any pre-existing thrown message for UI stability) */
  message: string
  /** actionable next step (CAP-004 vocab) — e.g. "simplify the graph to model-only" */
  mitigation?: string
  /** the missing capability, when `cause === 'unsupported_capability'` (CAP-004) */
  unsupported_capability?: string
  /** CAP-002 portability level, when known — carried opaquely, never interpreted here */
  portable_level?: string
  /** non-contract context: the underlying error text, or which fallback was taken */
  detail?: string
}

/** The mutable fields a caller may set/override when building an RtError. */
export type RtErrorInit = Omit<RtError, 'schema_version'>

/** Build a fully-formed RtError (stamps `schema_version`). */
export function makeRtError(init: RtErrorInit): RtError {
  return { schema_version: 1, ...init }
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : String(err)

/**
 * Classify a caught error into an RtError `cause` from its message. The web engine
 * has no structured error type from WASM (it surfaces strings), so this mirrors the
 * RT_spec RT-003 migration table heuristically. `over` lets the call site pin the
 * `verb`, force a `cause`, or attach a `mitigation` it knows is correct.
 */
export function rtErrorFromUnknown(verb: RtVerb, err: unknown, over: Partial<RtErrorInit> = {}): RtError {
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
