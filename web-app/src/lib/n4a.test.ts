import { describe, expect, it, vi } from 'vitest'
import { plsFit, plsPredict, type PlsModel } from '@/engine/algo/pls'
import { MAX_ARCHIVE_V2_BYTES } from '@/engine/archive-v2'
import type { FittedPipeline, RunResult, ScoreNode } from '@/engine/types'
import { buildN4aBundle, deserializeTyped, parseN4a, parseN4aFile, serializeTyped } from './n4a'

const emptyScore = (id: string): ScoreNode => ({ id, name: id, kind: 'cv', metrics: { rmse: 1, r2: 0.5, n: 3 }, predictions: [], status: 'completed' })

function tinyRun(): RunResult {
  // 3 samples × 4 features, regression
  const X = { data: Float64Array.from([1, 2, 3, 4, 2, 1, 0, 1, 3, 3, 2, 1]), rows: 3, cols: 4 }
  const Y = { data: Float64Array.from([1, 2, 3]), rows: 3, cols: 1 }
  const model = plsFit(X, Y, 2)
  const fitted: FittedPipeline = {
    dsl: { name: 'unit', steps: [], model: { id: 'm', type: 'PLS', params: { n_components: 2 } }, cv: { folds: 3, seed: 42 } },
    taskType: 'regression',
    nFeatures: 4,
    state: { chain: [], model, classNames: undefined, backendId: 'js-pls' },
  }
  return {
    id: 'run-x',
    pipelineName: 'unit',
    taskType: 'regression',
    targetName: 'y',
    refit: emptyScore('refit'),
    cv: emptyScore('cv'),
    folds: [],
    seed: 42,
    engine: 'js-pls',
    scoreMetric: 'rmse',
    model: fitted,
    createdAt: '2026-06-04T00:00:00.000Z',
  }
}

describe('.n4a typed-array codec', () => {
  it('round-trips Float64Array losslessly inside the model blob', () => {
    const run = tinyRun()
    const text = serializeTyped(buildN4aBundle(run))
    const back = deserializeTyped<ReturnType<typeof buildN4aBundle>>(text)
    const orig = run.model.state as { model: PlsModel }
    const got = back.model.state as { model: PlsModel }
    expect(got.model.B).toBeInstanceOf(Float64Array)
    expect(Array.from(got.model.B)).toEqual(Array.from(orig.model.B))
    expect(Array.from(got.model.meanX)).toEqual(Array.from(orig.model.meanX))
  })

  it('parseN4a yields a model that predicts identically to the original', () => {
    const run = tinyRun()
    const loaded = parseN4a(serializeTyped(buildN4aBundle(run)))
    const Xnew = { data: Float64Array.from([1.5, 1.5, 1.5, 1.5, 3, 2, 1, 0]), rows: 2, cols: 4 }
    const origPred = plsPredict((run.model.state as { model: PlsModel }).model, Xnew)
    const loadedPred = plsPredict((loaded.model.state as { model: PlsModel }).model, Xnew)
    expect(Array.from(loadedPred.data)).toEqual(Array.from(origPred.data))
  })

  it('accepts the current portable aggregate bundle format', () => {
    const run = tinyRun()
    const bundle = { ...buildN4aBundle(run), format: 'nirs4all-core/n4a' }
    const loaded = parseN4a(serializeTyped(bundle))
    expect(loaded.name).toBe(run.pipelineName)
    expect(loaded.model.nFeatures).toBe(run.model.nFeatures)
  })

  it('rejects the retired nirs4all-lite bundle format', () => {
    const run = tinyRun()
    const bundle = { ...buildN4aBundle(run), format: 'nirs4all-lite/n4a' }
    expect(() => parseN4a(serializeTyped(bundle))).toThrow()
  })

  it('rejects a non-n4a payload', () => {
    expect(() => parseN4a('{"hello":1}')).toThrow()
    expect(() => parseN4a('not json')).toThrow()
  })

  it.each([0, -1, MAX_ARCHIVE_V2_BYTES + 1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'refuses an invalid file size %s before materializing the File',
    async (size) => {
      const arrayBuffer = vi.fn(async () => new ArrayBuffer(0))
      const file = { name: 'bounded.n4a', size, arrayBuffer } as unknown as File

      await expect(parseN4aFile(file)).rejects.toThrow(/empty or exceeds the canonical Core byte budget/)
      expect(arrayBuffer).not.toHaveBeenCalled()
    },
  )
})
