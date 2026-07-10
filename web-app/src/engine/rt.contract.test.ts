// Web ↔ W7 runtime error-envelope PARITY (B-018). Locks the web `rtErrorToWire()` wire form to
// the neutral contract `nirs4all-ecosystem/docs/contracts/runtime/rt_error.v1.schema.json` — the
// same contract the Python `nirs4all.pipeline.dagml.rt.RtError.to_dict()` is byte-parity with.
//
// Two layers:
//   1. SELF-CONTAINED (always runs): the projection emits exactly the contract keys, omits empty
//      optionals, strips the in-memory-only `detail`, and never carries `schema_version`.
//   2. CROSS-REPO DRIFT GUARD (when the ecosystem schema is reachable): the vendored vocabularies
//      (RT_VERBS / RT_ERROR_CAUSES / RT_ERROR_WIRE_KEYS) equal the schema's enums / property set,
//      and a projected wire validates structurally against it (additionalProperties:false + required
//      + enums). Mirrors the repo's `validate:catalog` convention: self-skip (warn) when the sibling
//      repo isn't checked out, so an ecosystem-less checkout doesn't break the green gate.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RT_ERROR_CAUSES, RT_ERROR_WIRE_KEYS, RT_VERBS, makeRtError, rtErrorFromUnknown, rtErrorToWire, type RtError } from './rt'

const sorted = (xs: readonly string[]): string[] => [...xs].sort()

/** Walk up from the test's cwd looking for the sibling ecosystem contract; null if not checked out. */
function findErrorSchema(): string | null {
  const rel = path.join('nirs4all-ecosystem', 'docs', 'contracts', 'runtime', 'rt_error.v1.schema.json')
  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

describe('rtErrorToWire — contract-exact projection (parity with Python RtError.to_dict)', () => {
  it('a minimal error projects to exactly { verb, cause, message }', () => {
    const wire = rtErrorToWire(makeRtError({ verb: 'run', cause: 'runtime_error', message: 'boom' }))
    expect(wire).toEqual({ verb: 'run', cause: 'runtime_error', message: 'boom' })
    expect(Object.keys(wire)).toEqual(['verb', 'cause', 'message'])
  })

  it('includes set optionals and omits unset ones (no null/undefined keys on the wire)', () => {
    const wire = rtErrorToWire(makeRtError({ verb: 'run', cause: 'unsupported_capability', message: 'no', unsupported_capability: 'cancellable_background_compute', mitigation: 'use the served build' }))
    expect(wire).toEqual({ verb: 'run', cause: 'unsupported_capability', message: 'no', unsupported_capability: 'cancellable_background_compute', mitigation: 'use the served build' })
    expect('portable_level' in wire).toBe(false)
  })

  it('omits portable_level when it is null (V1) — mirrors Python `is not None`', () => {
    const wire = rtErrorToWire(makeRtError({ verb: 'run', cause: 'runtime_error', message: 'x', portable_level: null }))
    expect('portable_level' in wire).toBe(false)
  })

  it('strips the in-memory-only `detail` and never emits `schema_version`', () => {
    // rtErrorFromUnknown stamps `detail`; the scheduler/planning fallback sites rely on that.
    const inMemory = rtErrorFromUnknown('run', new Error('execute_campaign_phase_json failed'), { detail: 'degraded to libn4m fold chain' })
    expect(inMemory.detail).toBeDefined()
    const wire = rtErrorToWire(inMemory)
    expect('detail' in wire).toBe(false)
    expect('schema_version' in wire).toBe(false)
  })

  it('every projected key is an allowed contract key, and the three required keys are always present', () => {
    const full: RtError = { verb: 'export', cause: 'unsupported_shape', message: 'm', mitigation: 'mi', unsupported_capability: 'cap', portable_level: 'l1', detail: 'd' }
    const wire = rtErrorToWire(full) as unknown as Record<string, unknown>
    for (const k of Object.keys(wire)) expect(RT_ERROR_WIRE_KEYS).toContain(k)
    for (const req of ['verb', 'cause', 'message']) expect(wire[req]).toBeDefined()
    // the full error exercises every optional, so the wire must carry all six contract keys
    expect(sorted(Object.keys(wire))).toEqual(sorted(RT_ERROR_WIRE_KEYS))
  })
})

describe('vendored runtime vocabularies (mirror rt.py frozensets)', () => {
  it('RT_VERBS is the 8 runtime verbs', () => {
    expect(sorted(RT_VERBS)).toEqual(sorted(['inspect', 'validate', 'plan', 'run', 'predict', 'replay', 'explain', 'export']))
  })
  it('RT_ERROR_CAUSES is the 5 coarse wire causes', () => {
    expect(sorted(RT_ERROR_CAUSES)).toEqual(sorted(['unsupported_shape', 'unsupported_capability', 'unavailable_backend', 'invalid_request', 'runtime_error']))
  })
  it('RT_ERROR_WIRE_KEYS excludes the non-contract schema_version / detail', () => {
    expect(RT_ERROR_WIRE_KEYS).not.toContain('schema_version')
    expect(RT_ERROR_WIRE_KEYS).not.toContain('detail')
  })
})

describe('cross-repo drift guard vs rt_error.v1.schema.json (self-skips if ecosystem not checked out)', () => {
  const schemaPath = findErrorSchema()

  it('vendored vocabularies and wire keys equal the published contract', () => {
    if (!schemaPath) {
      console.warn('[rt.contract] nirs4all-ecosystem not reachable — skipping cross-repo drift check (vendored constants still asserted above).')
      return
    }
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
    expect(schema.additionalProperties).toBe(false)
    expect(sorted(schema.required)).toEqual(['cause', 'message', 'verb'])
    expect(sorted(Object.keys(schema.properties))).toEqual(sorted(RT_ERROR_WIRE_KEYS))
    expect(sorted(schema.properties.verb.enum)).toEqual(sorted(RT_VERBS))
    expect(sorted(schema.properties.cause.enum)).toEqual(sorted(RT_ERROR_CAUSES))
  })

  it('a projected wire envelope validates structurally against the published schema', () => {
    if (!schemaPath) return
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
    const allowed = new Set(Object.keys(schema.properties))
    const wire = rtErrorToWire(rtErrorFromUnknown('run', new Error('no controller registered'), { cause: 'unsupported_shape', mitigation: 'run engine=legacy' })) as unknown as Record<string, unknown>
    // additionalProperties: false
    for (const k of Object.keys(wire)) expect(allowed.has(k)).toBe(true)
    // required
    for (const req of schema.required as string[]) expect(wire[req]).toBeDefined()
    // enums
    expect(schema.properties.verb.enum).toContain(wire.verb)
    expect(schema.properties.cause.enum).toContain(wire.cause)
    expect(typeof wire.message).toBe('string')
  })
})
