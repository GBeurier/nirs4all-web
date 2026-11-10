import { describe, expect, it } from 'vitest'
import type { MaterializedDataset, PredRow, RunResult, ScoreNode } from '@/engine/types'
import { defaultEvaluationScore, inspectorPredictionsForScore, inspectorResults, inspectorScoreRef, scoreEvaluationLabel, scoreForInspectorRef } from './inspectorAdapter'

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


describe('single-holdout selection-validation projection', () => {
  it('keeps owner scores and predictions visible without resubstitution or independent-test labels', () => {
    const run = fixture()
    run.cv = undefined
    run.folds = []
    run.refit.name = 'Selection validation'
    run.refit.scoreContext = { unit: 'sample', identityBasis: 'declared', physicalKey: 'sample_id', nObservations: 1, nPhysicalSamples: 1, aggregation: 'dag:single-holdout', evaluation: 'selection_validation', independent_test: false, metric_profile: 'regression_report.population_rmse_ratios.v1', undefined_metrics: { r2: 'constant_target' } }
    delete run.refit.metrics.r2
    run.variants![0].metrics = { rmse: 1 }
    const projected = inspectorResults([run], null, 'Dataset')
    expect(projected.defaultScoreRef).toBe('rmse:selection-validation')
    expect(projected.scoreRefs).toEqual(expect.arrayContaining([expect.objectContaining({ partition: 'validation', protocol: 'selection_validation', label: 'RMSE · Selection validation' })]))
    expect(projected.scoreRefs.some(ref => ref.protocol === 'final' || ref.protocol === 'refit-resubstitution')).toBe(false)
    expect(projected.predictions[projected.chains[0].id].partition).toEqual(['validation'])
    expect(projected.chains[0].scores['r2:selection-validation']).toBeUndefined()
    expect(run.refit.scoreContext.undefined_metrics).toEqual({ r2: 'constant_target' })
  })
})


describe('restored Results and Inspector score synchronization', () => {
  it('defaults to validation or held-out evidence and requires opt-in for training resubstitution', () => {
    const run = fixture()
    expect(defaultEvaluationScore(run)).toBe(run.cv)
    run.cv = undefined
    expect(defaultEvaluationScore(run)).toBe(run.refit)
    expect(scoreEvaluationLabel(run, run.refit)).toBe('Held-out test')
    run.refit.name = 'Refit · train'
    expect(defaultEvaluationScore(run)).toBeNull()
    expect(scoreEvaluationLabel(run, run.refit)).toBe('Training resubstitution')
    run.refit.scoreContext = { unit: 'sample', identityBasis: 'declared', physicalKey: 'sample_id', nObservations: 1, nPhysicalSamples: 1, aggregation: 'dag:single-holdout', evaluation: 'selection_validation', independent_test: false }
    expect(defaultEvaluationScore(run)).toBe(run.refit)
    expect(scoreEvaluationLabel(run, run.refit)).toBe('Selection validation')
  })

  it('maps evaluation contexts in both directions while retaining a selected fold', () => {
    const run = fixture()
    const data = inspectorResults([run], null, 'Dataset')
    expect(inspectorScoreRef(run, run.folds[1], data.scoreRefs)).toBe('rmse:cv')
    expect(inspectorScoreRef(run, run.refit, data.scoreRefs, 'r2')).toBe('r2:refit')
    const cvRef = data.scoreRefs.find((ref) => ref.key === 'rmse:cv')!
    const testRef = data.scoreRefs.find((ref) => ref.key === 'rmse:refit')!
    expect(scoreForInspectorRef(run, cvRef, run.folds[1])).toBe(run.folds[1])
    expect(scoreForInspectorRef(run, testRef, run.folds[1])).toBe(run.refit)
    const otherRun = { ...run, id: 'other', folds: [{ ...run.folds[0], id: 'other-fold' }] }
    expect(scoreForInspectorRef(otherRun, cvRef, run.folds[1])).toBe(otherRun.cv)
    run.refit.scoreContext = { unit: 'observation', identityBasis: 'positional', physicalKey: 'row', nObservations: 1, nPhysicalSamples: null, aggregation: 'dag:single-holdout', evaluation: 'selection_validation', independent_test: false }
    const validation = inspectorResults([run], null, 'Dataset')
    expect(inspectorScoreRef(run, run.refit, validation.scoreRefs)).toBe('rmse:selection-validation')
    expect(scoreForInspectorRef(run, validation.scoreRefs.find((ref) => ref.protocol === 'selection_validation')!)).toBe(run.refit)
    expect(scoreForInspectorRef(run, testRef)).toBeNull()
  })

  it('plots only the selected owner cohort and never borrows winning predictions for another variant', () => {
    const run = fixture()
    const data = inspectorResults([run], null, 'Dataset')
    const winner = data.defaultCompare[0]
    const other = data.chains.find((chain) => chain.attributes?.selection !== 'dag-ml selected')!.id
    const cv = inspectorPredictionsForScore(data, 'rmse:cv', run, run.cv)
    expect(cv.predictions[winner].sampleKeys).toEqual(['a', 'b'])
    expect(cv.predictions[winner].partition).toEqual(['validation', 'validation'])
    expect(cv.predictions[winner].fold).toEqual(['fold-a', 'fold-b'])
    const fold = inspectorPredictionsForScore(data, 'rmse:cv', run, run.folds[1])
    expect(fold.predictions[winner].sampleKeys).toEqual(['b'])
    expect(fold.predictions[winner].fold).toEqual(['fold-b'])
    const test = inspectorPredictionsForScore(data, 'rmse:refit', run, run.refit)
    expect(test.predictions[winner].sampleKeys).toEqual(['c'])
    expect(test.predictions[winner].partition).toEqual(['test'])
    for (const projection of [cv, fold, test]) {
      expect(projection.predictions[other]).toBeUndefined()
      expect(projection.unavailable[other]).toMatch(/non-selected/)
    }
  })

  it('shows training prediction rows only after explicit opt-in and retains repeated observations', () => {
    const run = fixture()
    run.refit.name = 'Refit · train'
    run.refit.predictions = [prediction('repeat'), { ...prediction('repeat'), predicted: 7 }]
    run.cv = undefined
    run.folds = []
    const data = inspectorResults([run], null, 'Dataset')
    const winner = data.defaultCompare[0]
    expect(data.defaultScoreRef).toBeNull()
    expect(inspectorScoreRef(run, run.refit, data.scoreRefs)).toBe('rmse:refit')
    expect(scoreForInspectorRef(run, data.scoreRefs.find((ref) => ref.protocol === 'refit-resubstitution')!)).toBe(run.refit)
    const hidden = inspectorPredictionsForScore(data, 'rmse:refit', run, run.refit)
    expect(hidden.predictions[winner]).toBeUndefined()
    const shown = inspectorPredictionsForScore(data, 'rmse:refit', run, run.refit, true)
    expect(shown.predictions[winner].yPred).toEqual([2, 7])
    expect(shown.predictions[winner].partition).toEqual(['train', 'train'])
    expect(new Set(shown.predictions[winner].sampleKeys).size).toBe(2)
    expect(shown.sampleLinking).toBe(false)
    expect(shown.warnings[0]).toMatch(/no canonical row identity/)
  })
})
