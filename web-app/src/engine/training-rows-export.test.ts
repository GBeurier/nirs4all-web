// Training-row export policy (audit F10). A fitted state that embeds training
// rows (kernel PLS here; libn4m's containsTrainingRows()) is kept in the session
// as an in-memory checkpoint, but a shareable .n4a export writes it only after
// the user's explicit consent: without it libn4m refuses the re-serialization.
import { beforeAll, describe, expect, it } from 'vitest'
import { n4mToken } from '@/catalog/native'
import { loadSampleDataset } from '@/data/samples'
import { buildN4aBundle, parseN4a, serializeTyped } from '@/lib/n4a'
import type { Mat } from './algo/linalg'
import { loadLibn4mBackend } from './backends'
import { loadMlJsBackend } from './mljs-backend'
import { exportPipeline, type FittedState, type ModelBackend, predictPipeline, runPipeline, trainingRowSteps } from './orchestrate'
import type { MaterializedDataset, PipelineDSL, RunResult } from './types'
import { WorkerEngine } from './worker-engine'

let backend: ModelBackend
let mljs: ModelBackend
let ds: MaterializedDataset

const pipeline = (model: string, params: Record<string, unknown>): PipelineDSL => ({
  name: 'training rows',
  steps: [{ id: 'snv', type: n4mToken('preprocessing.scatter.snv'), params: {} }],
  model: { id: 'model', type: n4mToken(model), params },
})

const testRows = (): { X: Float64Array; n: number } => {
  const rows = ds.partitions.flatMap((part, i) => (part === 'test' ? [i] : []))
  const X = new Float64Array(rows.length * ds.nFeatures)
  rows.forEach((r, i) => X.set(ds.X.subarray(r * ds.nFeatures, (r + 1) * ds.nFeatures), i * ds.nFeatures))
  return { X, n: rows.length }
}

beforeAll(async () => {
  backend = await loadLibn4mBackend()
  ds = await loadSampleDataset('corn')
  mljs = await loadMlJsBackend()
})

describe('training-row export policy', () => {
  let kernel: RunResult

  beforeAll(async () => {
    kernel = await runPipeline(ds, pipeline('models.pls.kernel', { n_components: 4 }), {}, backend)
  })

  it('records per state whether libn4m embedded training rows', () => {
    const state = kernel.model.state as FittedState
    expect(state.chain.map((s) => s.containsTrainingRows)).toEqual([false])
    expect((state.model as { containsTrainingRows: boolean }).containsTrainingRows).toBe(true)
    expect(trainingRowSteps(kernel.model)).toEqual(['Kernel'])
  })

  it('keeps the in-session checkpoint usable without any export', () => {
    const { X, n } = testRows()
    const live = predictPipeline(kernel.model, X, n, ds.nFeatures, backend)
    expect(Array.from(live.values)).toEqual(kernel.refit.predictions.map((p) => p.predicted))
  })

  it('refuses the shareable export without the explicit opt-in', () => {
    expect(() => exportPipeline(kernel.model, false, backend)).toThrow(/training/i)
  })

  it('exports with the opt-in, flags the bundle and re-imports to identical predictions', () => {
    const shared = exportPipeline(kernel.model, true, backend)
    const bundle = buildN4aBundle({ ...kernel, model: shared })
    expect(bundle.containsTrainingRows).toBe(true)
    const text = serializeTyped(bundle)
    expect(JSON.parse(text).model.state.model.containsTrainingRows).toBe(true)
    const loaded = parseN4a(text)
    const { X, n } = testRows()
    expect(Array.from(predictPipeline(loaded.model, X, n, ds.nFeatures, backend).values)).toEqual(
      Array.from(predictPipeline(kernel.model, X, n, ds.nFeatures, backend).values),
    )
  })

  it('exports a model without training rows with no opt-in', async () => {
    const pls = await runPipeline(ds, pipeline('models.pls.pls_regression', { n_components: 6 }), {}, backend)
    expect(trainingRowSteps(pls.model)).toEqual([])
    const bundle = buildN4aBundle({ ...pls, model: exportPipeline(pls.model, false, backend) })
    expect(bundle.containsTrainingRows).toBe(false)
  })

  it('applies the same consent to an ml.js k-NN, whose artifact stores its training points', async () => {
    const X: Mat = { data: Float64Array.from({ length: 16 }, (_, i) => i), rows: 8, cols: 2 }
    const Y: Mat = { data: Float64Array.from({ length: 16 }, (_, i) => ((i >> 1) < 4 ? i % 2 : 1 - (i % 2))), rows: 8, cols: 2 }
    const knn = mljs.fit({ type: 'MlJsKNeighborsClassifier', params: { n_neighbors: 3 } }, X, Y, 1)
    expect(() => mljs.share(knn, false)).toThrow(/training/)
    expect(mljs.share(knn, true)).toBe(knn)
    const forest = mljs.fit({ type: 'MlJsDecisionTreeClassifier', params: { min_samples: 2, max_depth: 4 } }, X, Y, 1)
    expect(mljs.share(forest, false)).toBe(forest)
  })

  it('routes the user choice through the engine worker', async () => {
    const posted: unknown[] = []
    const fake = Object.assign(new EventTarget(), { postMessage: (m: unknown) => posted.push(m), terminate: () => {} })
    const pending = new WorkerEngine(() => fake as unknown as Worker).exportModel(kernel.model, { allowTrainingRows: true })
    expect(posted).toEqual([{ type: 'export', id: 'job-1', model: kernel.model, allowTrainingRows: true }])
    fake.dispatchEvent(new MessageEvent('message', { data: { type: 'result', id: 'job-1', result: kernel.model } }))
    await expect(pending).resolves.toBe(kernel.model)
  })
})
