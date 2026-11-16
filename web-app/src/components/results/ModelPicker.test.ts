import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RunResult, ScoreNode } from '@/engine/types'
import { ModelPicker, runModelLabel } from './ModelPicker'

function score(id: string, kind: ScoreNode['kind'], rmse: number): ScoreNode {
  return { id, kind, label: id, metrics: { rmse }, predictions: [] } as unknown as ScoreNode
}

function run(id: string, name: string, cvRmse: number, variantCount?: number): RunResult {
  return {
    id, pipelineName: name, taskType: 'regression', targetName: 'protein',
    refit: score(`${id}-refit`, 'refit', 0.1), cv: score(`${id}-cv`, 'cv', cvRmse), folds: [],
    seed: 0, engine: 'dag-ml', scoreMetric: 'rmse', model: {} as RunResult['model'],
    createdAt: '2026-11-16T10:00:00Z', variantCount,
  } as unknown as RunResult
}

describe('ModelPicker', () => {
  it('labels each run with its refit pipeline, validation score and variant count', () => {
    const label = runModelLabel(run('a', 'SNV + PLS', 0.4321, 6))
    expect(label).toContain('SNV + PLS')
    expect(label).toContain('0.432')
    expect(label).toContain('best of 6 variants')
  })

  it('lists every run and the imported model, selecting the current run', () => {
    const html = renderToStaticMarkup(createElement(ModelPicker, {
      runs: [run('a', 'SNV + PLS', 0.43), run('b', 'MSC + Ridge', 0.51)],
      selectedRunId: 'b', importedName: 'shared-model', onChange: () => {},
    }))
    expect(html).toContain('value="run:a"')
    expect(html).toContain('value="run:b" selected=""')
    expect(html).toContain('Imported .n4a model · shared-model')
    expect(html).toContain('Fold models and')
  })

  it('selects the imported model when no run is selected', () => {
    const html = renderToStaticMarkup(createElement(ModelPicker, {
      runs: [run('a', 'SNV + PLS', 0.43)], selectedRunId: null, importedName: 'shared-model', onChange: () => {},
    }))
    expect(html).toContain('value="imported" selected=""')
  })

  it('renders nothing without any model', () => {
    expect(renderToStaticMarkup(createElement(ModelPicker, { runs: [], selectedRunId: null, onChange: () => {} }))).toBe('')
  })
})
