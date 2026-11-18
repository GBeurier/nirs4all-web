import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExplanationV1, FittedPipeline, MaterializedDataset } from '@/engine/types'
import { enabledSteps } from '@/app/steps'
import { ExplainResults } from './ExplainResults'
import * as view from './explainView'

// Presentational stubs: the panel is tested for the props it hands the shared charts.
vi.mock('nirs4all-ui/viz', () => {
  const stub = (name: string) => (props: Record<string, unknown>) =>
    createElement('div', { 'data-chart': name, 'data-props': JSON.stringify(props, (_k, v) => (typeof v === 'function' ? undefined : v)) })
  return {
    SpectralImportanceChart: stub('spectral'),
    WaterfallChart: stub('waterfall'),
    ShapBeeswarm: stub('beeswarm'),
    FeatureImportanceBar: stub('bar'),
    AttributionHeatmap: stub('heatmap'),
    ImportanceComparisonChart: stub('comparison'),
    AgreementMatrix: stub('agreement'),
    referenceBandsForAxis: () => [],
  }
})


/** 2 rows x 4 features, 3 groups ([0,2), [2,3), [3,4)), one output. */
function envelope(over: Partial<ExplanationV1> = {}): ExplanationV1 {
  return {
    schema: 'nirs4all.explanation.v1',
    kind: 'permutation_shap',
    engine: { name: 'nirs4all-methods', version: '1.x', abi: '2.23.0' },
    exactness: 'sampled',
    additive: true,
    group_aggregation: 'group_game',
    attribution_space: 'raw_input',
    output: { index: 0, label: 'protein', space: 'target' },
    axis: { values: [1100, 1102, 1104, 1106], unit: 'nm', kind: 'wavelength' },
    feature_names: null,
    groups: [
      { label: '1100–1102', feature_start: 0, feature_end: 2, axis_start: 1100, axis_end: 1102, source: 'fixed_width' },
      { label: '1104', feature_start: 2, feature_end: 3, axis_start: 1104, axis_end: 1104, source: 'fixed_width' },
      { label: '1106', feature_start: 3, feature_end: 4, axis_start: 1106, axis_end: 1106, source: 'fixed_width' },
    ],
    rows: { count: 2, sample_indices: [7, 42], source: 'predicted_rows' },
    attributions: [[[0.5], [-0.25], [0.1]], [[-1], [2], [0]]],
    std_error: [[[0.01], [0.02], [0.03]], [[0.01], [0.01], [0.01]]],
    expected_value: [[10], [10]],
    prediction: [[10.35], [11]],
    additivity_max_abs_error: 0,
    settings: {},
    summary: { output_index: 0, mean_abs: [0.75, 1.125, 0.05], mean_signed: [-0.25, 0.875, 0.05] },
    ...over,
  }
}
const explainedX = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8])

const chartProps = (html: string, chart: string): Record<string, unknown> => {
  const m = html.match(new RegExp(`data-chart="${chart}" data-props="([^"]*)"`))
  if (!m) throw new Error(`chart ${chart} not rendered`)
  return JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&'))
}

describe('ExplainResults', () => {
  it('renders the shared charts from an envelope with explained-row and source indices kept distinct', () => {
    const html = renderToStaticMarkup(createElement(ExplainResults, { envelope: envelope(), explainedX, bands: [], showBands: true, onDownload: () => {} }))
    expect(html).toContain('Row 0 (sample #7)')
    expect(html).toContain('Row 1 (sample #42)')
    const spectral = chartProps(html, 'spectral')
    expect(spectral.axis).toEqual([1100, 1102, 1104, 1106])
    expect(spectral.importance).toEqual([0.75, 0.75, 1.125, 0.05])
    expect(spectral.spectrum).toEqual([3, 4, 5, 6])
    expect(spectral.regionValueKind).toBe('signed')
    expect(spectral.regions).toEqual([
      { start: 1100, end: 1102, value: -0.25, label: '1100–1102' },
      { start: 1104, end: 1104, value: 0.875, label: '1104' },
      { start: 1106, end: 1106, value: 0.05, label: '1106' },
    ])
    expect(spectral.axisUnit).toBe('nm')
    const waterfall = chartProps(html, 'waterfall')
    expect(waterfall.baseValue).toBe(10)
    expect(waterfall.predicted).toBe(10.35)
    expect(chartProps(html, 'beeswarm').features).toHaveLength(3)
    expect(html).toContain('Additive within rounding')
    expect(html).toContain('Download explanation')
  })

  it('draws candidate bands over the important zones by default, all bands or none on request', () => {
    const bands = [{ start: 1100, end: 1104, label: 'O–H 1st overtone', shortAssignment: 'water/hydroxyl' }]
    const props = { envelope: envelope(), explainedX, bands, onShowBandsChange: () => {} }
    const html = renderToStaticMarkup(createElement(ExplainResults, { ...props, showBands: true }))
    const spectral = chartProps(html, 'spectral')
    expect(spectral.bandFocus).toBe('important')
    expect(spectral.bands).toEqual(bands)
    expect(html).toContain('aria-label="Reference absorption bands"')
    expect(html).toContain('<option value="important" selected="">Bands: important zones</option>')
    expect(html).toContain('Bands: all')
    expect(html).not.toContain('type="checkbox"')
    const off = renderToStaticMarkup(createElement(ExplainResults, { ...props, showBands: false }))
    expect(chartProps(off, 'spectral').bands).toBeUndefined()
    expect(chartProps(off, 'spectral').bandFocus).toBeUndefined()
    expect(off).toContain('<option value="off" selected="">Bands: off</option>')
    // no band control without bands (unknown axis unit)
    const none = renderToStaticMarkup(createElement(ExplainResults, { ...props, bands: [], showBands: true }))
    expect(none).not.toContain('Reference absorption bands')
  })

  it('shows bars and a not-additive note for LIME instead of a waterfall', () => {
    const html = renderToStaticMarkup(createElement(ExplainResults, { envelope: envelope({ kind: 'lime', additive: false, exactness: 'surrogate', std_error: null, additivity_max_abs_error: null }), explainedX, bands: [], showBands: false }))
    expect(html).not.toContain('data-chart="waterfall"')
    expect(html).toContain('is not additive')
  })

  it('states the feature-index fallback when no unit is recorded', () => {
    const env = envelope({ axis: { values: [0, 1, 2, 3], unit: null, kind: 'feature_index' } })
    const html = renderToStaticMarkup(createElement(ExplainResults, { envelope: env, explainedX, bands: [], showBands: true }))
    expect(html).toContain('feature indices')
    expect(chartProps(html, 'spectral').axisLabel).toBe('Feature index')
  })
})

describe('explain view adapters', () => {
  it('keeps the waterfall additive with top-N groups plus a remainder', () => {
    const w = view.waterfallView(envelope(), 1, 1)
    expect(w.contributions).toEqual([{ label: '1104', value: 2 }, { label: 'Other 2 groups', value: -1 }])
    expect(w.baseValue + w.contributions.reduce((s, c) => s + c.value, 0)).toBeCloseTo(w.predicted, 12)
    expect(w.additivityError).toBeCloseTo(0, 12)
  })

  it('uses only recorded axes and partitions of the run dataset', () => {
    const model = { nFeatures: 2, taskType: 'regression', state: {}, dsl: { name: 'm', steps: [] } } as unknown as FittedPipeline
    const ds = {
      X: Float64Array.from([1, 2, 3, 4, 5, 6]), nSamples: 3, nFeatures: 2, axis: [0, 1], axisUnit: 'index',
      partitions: ['train', 'test', 'train'], sampleIds: ['a', 'b', 'c'], y: new Float64Array(3), targetName: 'y', taskType: 'regression',
    } as unknown as MaterializedDataset
    expect(view.explainAxisFor(model, ds)).toBeNull()
    expect(view.explainAxisFor(model, { ...ds, axis: [1000, 1002], axisUnit: 'nm' })).toEqual({ values: [1000, 1002], unit: 'nm' })
    expect(view.explainAxisFor({ ...model, features: { names: ['a', 'b'], axis: [5, 6], unit: 'cm-1' } }, ds)).toEqual({ values: [5, 6], unit: 'cm-1' })
    const options = view.rowSourceOptions(model, null, ds)
    expect(options.map((o) => [o.source, o.rows.sourceIndices])).toEqual([['dataset_test_partition', [1]], ['dataset_train_partition', [0, 2]], ['dataset_rows', [1, 0, 2]]])
    expect(Array.from(options[1].rows.X)).toEqual([1, 2, 5, 6])
    expect(view.backgroundFor(options, options[0]).source).toBe('dataset_train_partition')
    const predicted = { model, X: Float64Array.from([9, 9]), nSamples: 1, nFeatures: 2, fileName: 'new.csv' }
    expect(view.rowSourceOptions(model, predicted, null).map((o) => o.source)).toEqual(['predicted_rows'])
    expect(view.rowSourceOptions({ ...model }, predicted, null)).toEqual([])
  })
})

describe('step enabling', () => {
  it('unlocks Explain exactly when Predict has a model', () => {
    expect(enabledSteps({ hasDataset: true, runCount: 1, hasSelectedRun: false, hasLoadedModel: false })).toMatchObject({ predict: false, explain: false })
    expect(enabledSteps({ hasDataset: true, runCount: 1, hasSelectedRun: true, hasLoadedModel: false })).toMatchObject({ predict: true, explain: true })
    expect(enabledSteps({ hasDataset: false, runCount: 0, hasSelectedRun: false, hasLoadedModel: true })).toMatchObject({ explore: false, predict: true, explain: true })
  })
})
