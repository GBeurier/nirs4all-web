import { afterEach, describe, expect, it, vi } from 'vitest'

// The inline worker constructor only exists in a Vite build; model it with a recording class.
const inlineConstructed = vi.hoisted(() => ({ count: 0 }))
vi.mock('./worker?worker&inline', () => ({
  default: class InlineWorker {
    constructor() { inlineConstructed.count += 1 }
  },
}))

import { isRtErrorException } from './rt'
import type { FittedPipeline, MaterializedDataset, PipelineDSL } from './types'

const ds = {} as MaterializedDataset
const dsl = {} as PipelineDSL

describe('single-file engine client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    inlineConstructed.count = 0
  })

  it('wraps the inline Blob worker; no worker is spawned until the first call', async () => {
    vi.stubGlobal('Worker', class FakeWorker {})
    const { engine } = await import('./client.singlefile')
    expect(engine.name).toBe('nirs4all-wasm-worker')
    expect(inlineConstructed.count).toBe(0)
  })

  it('refuses explicitly without Worker: no in-thread engine, no direct-runner fallback', async () => {
    vi.stubGlobal('Worker', undefined)
    const { engine } = await import('./client.singlefile')
    expect(engine.name).toBe('nirs4all-wasm-unsupported')
    const calls: [string, Promise<unknown>][] = [
      ['run', engine.run(ds, dsl)],
      ['predict', engine.predict({} as FittedPipeline, new Float64Array(0), 0, 0)],
      ['export', engine.exportModel({} as FittedPipeline, { allowTrainingRows: false })],
    ]
    for (const [verb, call] of calls) {
      const err = await call.then(() => { throw new Error('should have been refused') }, (e: unknown) => e)
      expect(isRtErrorException(err)).toBe(true)
      expect((err as { rtError: unknown }).rtError).toMatchObject({ verb, cause: 'unsupported_capability', unsupported_capability: 'web_worker' })
    }
    expect(inlineConstructed.count).toBe(0)
  })
})
