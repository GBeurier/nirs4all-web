import { describe, expect, it } from 'vitest'
import { assertAomBudget } from './guard'
import { isRtErrorException, makeRtError, RtErrorException, rtErrorFromUnknown } from './rt'
import type { MaterializedDataset, PipelineDSL } from './types'

describe('makeRtError', () => {
  it('carries the contract fields and stamps NO schema_version (that is an RtResult field, not RtError)', () => {
    const e = makeRtError({ verb: 'run', cause: 'unsupported_capability', message: 'nope', unsupported_capability: 'foo', mitigation: 'do bar' })
    expect(e).toEqual({ verb: 'run', cause: 'unsupported_capability', message: 'nope', unsupported_capability: 'foo', mitigation: 'do bar' })
    expect('schema_version' in e).toBe(false)
  })
})

describe('rtErrorFromUnknown classifier (RT_spec RT-003 migration table)', () => {
  it('maps unschedulable / no-controller messages to unsupported_shape', () => {
    expect(rtErrorFromUnknown('run', new Error('no controller registered for node')).cause).toBe('unsupported_shape')
    expect(rtErrorFromUnknown('run', 'this shape is not yet schedulable').cause).toBe('unsupported_shape')
    expect(rtErrorFromUnknown('run', new Error('planning_failed')).cause).toBe('unsupported_shape')
  })
  it('maps unavailable / load failures to unavailable_backend', () => {
    expect(rtErrorFromUnknown('run', new Error('dag-ml-wasm not loaded under file://')).cause).toBe('unavailable_backend')
    expect(rtErrorFromUnknown('run', 'failed to init wasm').cause).toBe('unavailable_backend')
  })
  it('maps variant-cap / invalid-request messages to invalid_request', () => {
    expect(rtErrorFromUnknown('run', new Error('max_variants exceeded')).cause).toBe('invalid_request')
  })
  it('defaults to runtime_error and echoes the raw message into message + detail', () => {
    const e = rtErrorFromUnknown('run', new Error('kaboom'))
    expect(e.cause).toBe('runtime_error')
    expect(e.message).toBe('kaboom')
    expect(e.detail).toBe('kaboom')
  })
  it('lets the call site override the cause / mitigation', () => {
    const e = rtErrorFromUnknown('run', new Error('kaboom'), { cause: 'unsupported_shape', mitigation: 'simplify' })
    expect(e.cause).toBe('unsupported_shape')
    expect(e.mitigation).toBe('simplify')
    // raw message is preserved unless explicitly overridden
    expect(e.message).toBe('kaboom')
  })
})

describe('RtErrorException', () => {
  it('is a real Error carrying the typed rtError', () => {
    const rt = makeRtError({ verb: 'run', cause: 'runtime_error', message: 'boom' })
    const ex = new RtErrorException(rt)
    expect(ex).toBeInstanceOf(Error)
    expect(ex.message).toBe('boom')
    expect(ex.rtError).toBe(rt)
    expect(isRtErrorException(ex)).toBe(true)
  })
  it('recognises a structurally-reconstructed exception (worker boundary)', () => {
    // worker-engine rebuilds the exception from a postMessage'd rtError
    const ex = new RtErrorException(makeRtError({ verb: 'run', cause: 'unsupported_capability', message: 'x' }))
    expect(isRtErrorException(ex)).toBe(true)
    expect(isRtErrorException(new Error('plain'))).toBe(false)
    expect(isRtErrorException(undefined)).toBe(false)
  })
})

// --- guard.ts now surfaces a typed RtError (B-018) while keeping its message ----
const ds = (nSamples: number, nFeatures: number): MaterializedDataset =>
  ({ nSamples, nFeatures, partitions: [] }) as unknown as MaterializedDataset
const dsl = (type: string, params: Record<string, unknown> = {}): PipelineDSL =>
  ({ name: 't', steps: [], model: { id: 'm', type, params } }) as unknown as PipelineDSL

describe('assertAomBudget emits a typed RtError on the main-thread refuse', () => {
  it('throws an RtErrorException with cause unsupported_capability, message preserved', () => {
    let caught: unknown
    try {
      assertAomBudget(ds(1000, 1000), dsl('AOMPLS'), undefined, { mainThread: true })
    } catch (e) {
      caught = e
    }
    expect(isRtErrorException(caught)).toBe(true)
    const ex = caught as RtErrorException
    expect(ex.rtError.cause).toBe('unsupported_capability')
    expect(ex.rtError.unsupported_capability).toBe('cancellable_background_compute')
    // message stays identical so existing UI/tests (guard.test.ts) are unaffected
    expect(ex.message).toMatch(/offline single-file/i)
    expect(ex.rtError.mitigation).toMatch(/served build/i)
  })
})
