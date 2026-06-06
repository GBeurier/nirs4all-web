import { describe, expect, it } from 'vitest'
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

describe('WorkerEngine', () => {
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
})
