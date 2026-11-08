import { afterEach, describe, expect, it, vi } from 'vitest'

// The single-file factory wraps Vite's inline-worker constructor, which only
// exists in a Vite build; model it with a recording class.
const inlineConstructed = vi.hoisted(() => ({ count: 0 }))
vi.mock('./worker?worker&inline', () => ({
  default: class InlineWorker {
    constructor() { inlineConstructed.count += 1 }
  },
}))

import { createPreviewWorker } from './preview-worker'
import { createPreviewWorker as createSingleFilePreviewWorker } from './preview-worker.singlefile'

describe('owner-preview worker factories', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    inlineConstructed.count = 0
  })

  it('served profile spawns the engine worker as a real-URL module worker', () => {
    const calls: Array<{ url: unknown; options: unknown }> = []
    class FakeWorker {
      constructor(url: unknown, options: unknown) { calls.push({ url, options }) }
    }
    vi.stubGlobal('Worker', FakeWorker)

    const worker = createPreviewWorker()

    expect(worker).toBeInstanceOf(FakeWorker)
    expect(calls).toHaveLength(1)
    // A URL (not a Blob/inline source) lets emitted chunks resolve against it.
    expect(calls[0].url).toBeInstanceOf(URL)
    expect((calls[0].url as URL).pathname.endsWith('/engine/worker.ts')).toBe(true)
    expect(calls[0].options).toEqual({ type: 'module' })
    expect(inlineConstructed.count).toBe(0)
  })

  it('single-file profile uses the inline classic worker, not a module Worker', () => {
    const moduleWorker = vi.fn()
    vi.stubGlobal('Worker', moduleWorker)

    const worker = createSingleFilePreviewWorker()

    expect(inlineConstructed.count).toBe(1)
    expect(worker).toBeDefined()
    expect(moduleWorker).not.toHaveBeenCalled()
  })
})
