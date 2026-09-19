import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { DagMlEngine } from './dagml-engine'
import { loadSampleDataset } from '@/data/samples'
import { RtErrorException } from './rt'
import type { MaterializedDataset } from './types'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'

beforeAll(() => {
  // Node cannot fetch file:// WASM assets; initialize the same staged modules
  // from bytes before the aggregate's cached loaders are invoked.
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
})

describe('model-only classification through the real WASM scheduler', () => {
  it.each([2, 3])('declares all %i class-score columns and assembles OOF once per sample', async (nClasses) => {
    const nSamples = 24
    const nFeatures = 4
    const labels = Array.from({ length: nSamples }, (_, i) => `class-${i % nClasses}`)
    const ds: MaterializedDataset = {
      nSamples, nFeatures,
      X: Float64Array.from({ length: nSamples * nFeatures }, (_, offset) => {
        const row = Math.floor(offset / nFeatures)
        const col = offset % nFeatures
        return (col === row % nClasses ? 2 : 0) + Math.sin(row + col) * 0.05
      }),
      y: Float64Array.from({ length: nSamples }, (_, i) => i % nClasses),
      classes: labels,
      taskType: nClasses === 2 ? 'binary' : 'multiclass',
      targetName: 'species',
      sampleIds: labels.map((_, i) => `sample-${i}`),
      partitions: labels.map(() => 'train'),
      axis: [1, 2, 3, 4],
      axisUnit: 'index',
    }
    const result = await new DagMlEngine({ profile: 'strict-wasm' }).run(ds, {
      name: 'Ridge classification', steps: [],
      model: { id: 'model', type: 'Ridge', params: { lambda: 1 } },
      cv: { folds: 3, seed: 42 },
    })
    expect(result.cv?.predictions).toHaveLength(nSamples)
    expect(new Set(result.cv?.predictions.map((row) => row.sampleId)).size).toBe(nSamples)
    expect(result.cv?.metrics.accuracy).toBe(1)
    expect(result.folds).toHaveLength(3)
    expect(result.model.classes).toEqual(Array.from({ length: nClasses }, (_, i) => `class-${i}`))
    expect(result.lineage).toMatchObject({ executed: true, dataProvider: { status: 'materialized' } })
    expect(result.diagnostics ?? []).toEqual([])
  })

  it('preserves a native fit refusal across the scheduler callback instead of claiming fallback success', async () => {
    const ds = await loadSampleDataset('corn')
    await expect(new DagMlEngine({ profile: 'strict-wasm' }).run(ds, {
      name: 'Ridge PLS numerical refusal', steps: [],
      model: { id: 'model', type: 'RidgePLS', params: { n_components: 10, ridge_lambda: 1 } },
      cv: { folds: 5, seed: 42 },
    })).rejects.toMatchObject({
      name: 'RtErrorException',
      rtError: {
        verb: 'run',
        cause: 'runtime_error',
        message: expect.stringContaining('Ridge PLS could not fit'),
        mitigation: expect.stringContaining('fewer components'),
      },
    } satisfies Partial<RtErrorException>)
  })
})
