import { describe, expect, it } from 'vitest'
import type { MaterializedDataset, PredRow, RunResult, ScoreNode } from '@/engine/types'
import { inspectorResults } from './inspectorAdapter'

const prediction = (sampleId: string): PredRow => ({ sampleId, actual: 1, predicted: 2, residual: -1 })
const node = (kind: ScoreNode['kind'], rows: PredRow[], name: string = kind): ScoreNode => ({
  id: kind, name, kind, predictions: rows, metrics: { rmse: 1, r2: 0, mae: NaN, n: rows.length }, status: 'completed',
})
const fixture = (): RunResult => ({
  id: 'run', pipelineName: 'Owner run', taskType: 'regression', targetName: 'Y',
  cv: node('cv', [prediction('a'), prediction('b')]),
  refit: node('refit', [prediction('c')], 'Refit · test'),
  folds: [{ ...node('fold', [prediction('a')]), id: 'fold-a' }, { ...node('fold', [prediction('b')]), id: 'fold-b' }],
  seed: 42, engine: 'dag-ml-wasm', scoreMetric: 'rmse', createdAt: '2026-11-07T00:00:00Z',
  model: { dsl: { name: 'Owner pipeline', steps: [] }, nFeatures: 2, taskType: 'regression', state: null },
  variants: [
    { variantId: 'best', label: 'Owner selected variant', metrics: { rmse: 1, r2: 0 }, selected: true },
    { variantId: 'other', label: 'Imported variant without recipe', metrics: {}, selected: false },
  ],
})

describe('Web Inspector projection', () => {
  it('offers CV first/default, exact held-out context and known score directions', () => {
    const run = fixture()
    const data = inspectorResults([run], null, 'Dataset')
    expect(data.defaultScoreRef).toBe('rmse:cv')
    expect(data.scoreRefs[0]).toMatchObject({ key: 'rmse:cv', partition: 'validation', protocol: 'cv', lowerIsBetter: true })
    expect(data.scoreRefs.find((ref) => ref.key === 'r2:refit')).toMatchObject({ partition: 'test', protocol: 'final', lowerIsBetter: false })
    expect(data.scoreRefs.some((ref) => ref.metric === 'n')).toBe(false)
    expect(data.chains[0].scores['r2:cv']).toBe(0)
    expect(data.chains[0].scores['mae:refit']).toBeNull()
  })

  it('keeps variants without pipelines, null metrics and unavailable non-selected predictions', () => {
    const data = inspectorResults([fixture()], null, 'Dataset')
    expect(data.chains).toHaveLength(2)
    const other = data.chains[1]
    expect(other.label).toBe('Imported variant without recipe')
    expect(other.steps).toEqual([])
    expect(other.scores['rmse:cv']).toBeNull()
    expect(other.scores['rmse:refit']).toBeNull()
    expect(data.predictions[other.id]).toBeUndefined()
    expect(data.unavailablePredictions[other.id]).toMatch(/non-selected/)
    expect(data.defaultCompare).toEqual([data.chains[0].id])
    expect(data.chains[0].attributes?.selection).toBe('dag-ml selected')
    expect(data.chains[0].foldScores?.['rmse:cv']).toEqual([1, 1])
  })

  it('preserves CV fold context and test predictions, excluding train resubstitution', () => {
    const run = fixture()
    const data = inspectorResults([run], null, 'Dataset')
    const pred = data.predictions[data.chains[0].id]
    expect(pred.sampleKeys).toEqual(['a', 'b', 'c'])
    expect(pred.partition).toEqual(['validation', 'validation', 'test'])
    expect(pred.fold).toEqual(['fold-a', 'fold-b', null])
    run.refit.name = 'Refit · train'
    const cvWithoutTest = inspectorResults([run], null, 'Dataset')
    expect(cvWithoutTest.defaultScoreRef).toBe('rmse:cv')
    expect(cvWithoutTest.scoreRefs.find((ref) => ref.key === 'rmse:refit')).toMatchObject({ partition: 'train', protocol: 'refit-resubstitution' })
    expect(cvWithoutTest.predictions[cvWithoutTest.chains[0].id].partition).toEqual(['validation', 'validation'])
    run.cv = undefined
    run.folds = []
    run.variants = undefined
    const training = inspectorResults([run], null, 'Dataset')
    expect(training.defaultScoreRef).toBeNull()
    expect(training.scoreRefs[0]).toMatchObject({ key: 'rmse:refit', partition: 'train', protocol: 'refit-resubstitution' })
    expect(Object.keys(training.predictions)).toHaveLength(0)
    expect(training.unavailablePredictions[training.chains[0].id]).toMatch(/resubstitution is excluded/)
  })

  it('keeps duplicate observations distinct without assigning folds or cross-chain identities', () => {
    const run = fixture()
    run.cv!.predictions = [prediction('repeat'), prediction('repeat')]
    const dataset = { sampleIds: ['repeat', 'repeat', 'c'] } as MaterializedDataset
    const data = inspectorResults([run], dataset, 'Replicates')
    const pred = data.predictions[data.chains[0].id]
    expect(pred.yTrue).toHaveLength(3)
    expect(new Set(pred.sampleKeys).size).toBe(3)
    expect(pred.fold).toEqual([null, null, null])
    expect(data.sampleLinking).toBe(false)
    expect(data.warnings[0]).toMatch(/no canonical row identity/)
  })

  it('carries owner class order, fold missingness and runtime status without recomputing scores', () => {
    const run = fixture()
    run.taskType = 'multiclass'
    run.model.classes = ['z', 'a']
    run.scoreMetric = 'accuracy'
    run.cv!.metrics = { accuracy: 0.5, f1: 0.4 }
    run.cv!.status = 'running'
    run.folds[1].metrics = {}
    const data = inspectorResults([run], null, 'Classes')
    expect(data.scoreRefs[0].lowerIsBetter).toBe(false)
    expect(data.predictions[data.chains[0].id].classes).toEqual(['z', 'a'])
    expect(data.chains[0].status).toBe('partial')
    expect(data.chains[0].foldScores?.['rmse:cv']).toBeUndefined()
    run.cv!.status = 'failed'
    expect(inspectorResults([run], null, 'Classes').chains[0].status).toBe('failed')
  })
})
