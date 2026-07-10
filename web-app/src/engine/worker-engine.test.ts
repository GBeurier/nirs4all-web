import { describe, expect, it } from 'vitest'
import { isRtErrorException, makeRtError, RtErrorException } from './rt'
import type { RtResultWire } from './rt-result'
import { WorkerEngine } from './worker-engine'
import type { MaterializedDataset, PipelineDSL } from './types'

class FakeWorker extends EventTarget {
  terminated = false
  messages: unknown[] = []

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }
}

const ds = {
  X: new Float64Array([1, 2, 3, 4]),
  y: new Float64Array([1, 2]),
  nSamples: 2,
  nFeatures: 2,
  axis: [0, 1],
  axisUnit: 'index',
  targetName: 'y',
  taskType: 'regression',
  sampleIds: ['a', 'b'],
  partitions: ['train', 'train'],
} as MaterializedDataset

const dsl = {
  name: 'x',
  steps: [],
  model: { id: 'm', type: 'PLS', params: { n_components: 1 } },
} as PipelineDSL

const rtResult: RtResultWire = {
  schema_version: 1,
  run_id: 'run-ok',
  plan_id: null,
  selection: null,
  reports: [],
  predictions: [],
  manifest: {
    engine: 'dag-ml-wasm + libn4m',
    fingerprints: {},
    capabilities: { execution_backend: 'wasm-local' },
    portable_level: null,
    files: {},
  },
}

describe('WorkerEngine', () => {
  it('terminates a completed worker so the next run starts with fresh WASM state', async () => {
    const fake = new FakeWorker()
    const engine = new WorkerEngine(() => fake as unknown as Worker)

    const run = engine.run(ds, dsl)
    fake.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'result', id: 'job-1', result: { id: 'ok' } },
      }),
    )

    await expect(run).resolves.toEqual({ id: 'ok' })
    expect(fake.terminated).toBe(true)
  })

  it('attaches a worker runtime result payload to the resolved RunResult', async () => {
    const fake = new FakeWorker()
    const engine = new WorkerEngine(() => fake as unknown as Worker)

    const run = engine.run(ds, dsl)
    fake.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'result', id: 'job-1', result: { id: 'ok' }, rtResult },
      }),
    )

    await expect(run).resolves.toEqual({ id: 'ok', rtResult })
    expect(fake.terminated).toBe(true)
  })

  it('terminates the worker on abort so synchronous WASM work can be cancelled', async () => {
    const fake = new FakeWorker()
    const engine = new WorkerEngine(() => fake as unknown as Worker)
    const ctrl = new AbortController()

    const run = engine.run(ds, dsl, { signal: ctrl.signal })
    ctrl.abort()

    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(fake.terminated).toBe(true)
    expect(fake.messages).toHaveLength(1)
  })

  // B-018: a strict (allowFallback omitted/false) refusal in the worker is posted back as a
  // plain error message carrying the typed `rtError`. The main-thread facade must
  // rebuild it into an `RtErrorException` so consumers keep the typed `cause` path —
  // NOT a generic Error (which would lose why the runtime refused) and NOT an
  // AbortError (which App.tsx would silently swallow).
  it('rebuilds a typed RtError refusal into an RtErrorException across the worker boundary', async () => {
    const fake = new FakeWorker()
    const engine = new WorkerEngine(() => fake as unknown as Worker)

    const run = engine.run(ds, dsl, { allowFallback: false })
    const rtError = makeRtError({
      verb: 'run',
      cause: 'unsupported_capability',
      message: 'offline single-file build cannot run the AOM screen',
      unsupported_capability: 'cancellable_background_compute',
      mitigation: 'use the served build',
    })
    fake.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'error', id: 'job-1', name: 'RtErrorException', message: rtError.message, rtError },
      }),
    )

    const err = await run.then(
      () => {
        throw new Error('worker run should have rejected')
      },
      (e: unknown) => e,
    )
    expect(isRtErrorException(err)).toBe(true)
    expect(err).toBeInstanceOf(RtErrorException)
    expect((err as RtErrorException).rtError).toMatchObject({ cause: 'unsupported_capability', unsupported_capability: 'cancellable_background_compute', mitigation: 'use the served build' })
    expect(fake.terminated).toBe(true)
  })

  // A worker error with NO rtError (an ordinary runtime failure) must stay a plain
  // Error — the RtError rebuild is reserved for genuinely typed refusals.
  it('keeps a non-RtError worker failure as a plain Error', async () => {
    const fake = new FakeWorker()
    const engine = new WorkerEngine(() => fake as unknown as Worker)

    const run = engine.run(ds, dsl)
    fake.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'error', id: 'job-1', name: 'Error', message: 'kaboom' },
      }),
    )

    const err = await run.then(
      () => {
        throw new Error('worker run should have rejected')
      },
      (e: unknown) => e,
    )
    expect(isRtErrorException(err)).toBe(false)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('kaboom')
  })
})
