import { describe, expect, it, vi } from 'vitest'
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
  it('refuses heavy AOM before starting main-thread backend work', async () => {
    const onProgress = vi.fn()

    await expect(new MainEngine({ mainThread: true }).run(ds(220, 1000), heavyAom, { onProgress })).rejects.toThrow(/offline single-file/i)
    expect(onProgress).not.toHaveBeenCalled()
  })
})
