import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainEngine } from './main-engine'
import type { MaterializedDataset, PipelineDSL } from './types'

const ds = (nSamples: number, nFeatures: number): MaterializedDataset =>
  ({ nSamples, nFeatures, partitions: [] }) as unknown as MaterializedDataset

const heavyAom: PipelineDSL = {
  name: 'heavy-aom',
  steps: [],
  model: { id: 'm', type: 'AOMPLS', params: { n_components: 10 } },
  cv: { folds: 5, seed: 42 },
}

describe('MainEngine offline guards', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses heavy AOM on file:// before starting main-thread backend work', async () => {
    vi.stubGlobal('location', { protocol: 'file:' })
    const onProgress = vi.fn()

    await expect(new MainEngine().run(ds(220, 1000), heavyAom, { onProgress })).rejects.toThrow(/offline single-file/i)
    expect(onProgress).not.toHaveBeenCalled()
  })
})
