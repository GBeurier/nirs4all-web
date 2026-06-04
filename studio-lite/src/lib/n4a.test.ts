import { describe, expect, it } from 'vitest'
import { plsFit, plsPredict, type PlsModel } from '@/engine/algo/pls'
import type { FittedPipeline, RunResult, ScoreNode } from '@/engine/types'
import { buildN4aBundle, deserializeTyped, parseN4a, serializeTyped } from './n4a'

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

  it('rejects a non-n4a payload', () => {
    expect(() => parseN4a('{"hello":1}')).toThrow()
    expect(() => parseN4a('not json')).toThrow()
  })
})
