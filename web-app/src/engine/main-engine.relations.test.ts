import { describe, expect, it, vi } from 'vitest'
import { buildDataset } from '@/data/dataset'
import { MainEngine } from './main-engine'
import type { MaterializedDataset, PipelineDSL } from './types'

const calls = vi.hoisted(() => ({ portable: vi.fn(), fit: vi.fn(), provider: vi.fn() }))
vi.mock('./portable-core', async (original) => ({
  ...await original<typeof import('./portable-core')>(),
  tryRunPortableCore: calls.portable,
}))
vi.mock('./backends', async (original) => ({
  ...await original<typeof import('./backends')>(),
  // No numerical result is supplied: every case must refuse before fit.
  loadLibn4mBackend: async () => ({ id: 'unreachable', fit: calls.fit }),
}))
vi.mock('./dagml-data', () => ({
  materializeViaProvider: async (ds: MaterializedDataset) => {
    calls.provider()
    return { X: ds.X, y: ds.y, fingerprints: {}, outputRepresentation: 'tabular_numeric', version: 'unit-boundary' }
  },
}))

const pipeline: PipelineDSL = { name: 'relation refusal', steps: [], model: { id: 'm', type: 'n4m:models.regularized.ridge', params: { alpha: 1 } } }

describe('MainEngine relation-aware routing before numerical FIT', () => {
  it.each(['augmentation-only', 'incomplete-test-group', 'origin-holdout'] as const)('bypasses the portable shortcut and refuses %s', async (kind) => {
    calls.portable.mockReset()
    calls.fit.mockReset()
    calls.provider.mockReset()
    const ds = buildDataset([
      { name: 'X_train.csv', text: 'a;b\n1;2\n3;4\n5;6\n7;8' },
      { name: 'y_train.csv', text: 'y\n1\n2\n3\n4' },
    ])
    let error: RegExp
    if (kind === 'augmentation-only') {
      ds.augmented = [false, true, false, false]
      error = /every augmented observation needs an origin/
    } else if (kind === 'incomplete-test-group') {
      ds.partitions[3] = 'test'
      ds.groupIds = ['train-group', 'train-group', 'train-group', null]
      error = /group_id must be nonempty/
    } else {
      ds.partitions[3] = 'test'
      ds.originIds = [null, null, ds.sampleIds[3], null]
      ds.augmented = [false, false, true, false]
      error = /augmentation origin crosses Train\/Test/
    }
    await expect(new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(ds, pipeline)).rejects.toThrow(error)
    expect(calls.portable).not.toHaveBeenCalled()
    expect(calls.provider).toHaveBeenCalledTimes(1)
    expect(calls.fit).not.toHaveBeenCalled()
  })
})
