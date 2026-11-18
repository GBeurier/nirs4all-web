import { describe, expect, it } from 'vitest'

import type { CompareProfilesResponse, ExplanationGroup, ExplanationV1 } from '@/engine/types'
import { consensus, expandGroups, explanationCsv, spaceExplanation, summarySentence, toCsv } from './insights'

const groups: ExplanationGroup[] = [
  { label: '1100–1102', feature_start: 0, feature_end: 2, axis_start: 1100, axis_end: 1102, source: 'fixed_width' },
  { label: '1104', feature_start: 2, feature_end: 3, axis_start: 1104, axis_end: 1104, source: 'fixed_width' },
  { label: '1106', feature_start: 3, feature_end: 4, axis_start: 1106, axis_end: 1106, source: 'fixed_width' },
]

function env(meanAbs: number[], meanSigned: number[]): ExplanationV1 {
  return {
    schema: 'nirs4all.explanation.v1',
    kind: 'permutation_shap',
    engine: { name: 'nirs4all-methods', version: '1.x' },
    exactness: 'sampled',
    additive: true,
    group_aggregation: 'group_game',
    attribution_space: 'raw_input',
    output: { index: 0, label: 'protein', space: 'target' },
    axis: { values: [1100, 1102, 1104, 1106], unit: 'nm', kind: 'wavelength' },
    feature_names: null,
    groups,
    rows: { count: 2, sample_indices: [3, 9] },
    attributions: [],
    std_error: null,
    expected_value: [],
    prediction: [],
    additivity_max_abs_error: 0,
    settings: {},
    summary: { output_index: 0, mean_abs: meanAbs, mean_signed: meanSigned, mean_signed_std_error: [0.1, 0.2, 0.3] },
  }
}

describe('summarySentence', () => {
  it('names the top groups with their share, direction and candidate bands', () => {
    const text = summarySentence(env([1, 3, 0], [-1, 2, 0]), [{ start: 1103, end: 1105, label: 'C–H 2nd overtone' }])
    expect(text).toMatch(/^Permutation SHAP: the model relies most on 1104 nm \(75% of the total, mostly raises the prediction, candidate band C–H 2nd overtone\)/)
    expect(text).toContain('1100–1102 nm (25% of the total, mostly lowers the prediction)')
    expect(text).toContain('not proof of a chemical cause')
  })

  it('reports a flat explanation instead of dividing by zero', () => {
    expect(summarySentence(env([0, 0, 0], [0, 0, 0]), [])).toContain('No group carries any attribution')
  })
})

describe('comparison bookkeeping', () => {
  it('expands group values to features and leaves uncovered features empty', () => {
    expect(expandGroups(groups, [1, 2, 3], 5)).toEqual([1, 1, 2, 3, Number.NaN])
  })

  it('ranks groups by how many profiles put them in their top K', () => {
    const cmp: CompareProfilesResponse = {
      groups,
      aggregated: [[3, 1, 2], [1, 3, 2], [0.5, 0.1, 0.9]],
      spearman: [],
      topKJaccard: [],
      topK: 1,
    }
    const ranked = consensus(cmp)
    expect(ranked.map((r) => [r.group.label, r.count])).toEqual([['1100–1102', 1], ['1104', 1], ['1106', 1]])
    expect(ranked[0].ranks).toEqual([1, 3, 2])
  })
})

describe('exports', () => {
  it('writes group values with the Monte-Carlo error and quotes cells that need it', () => {
    const csv = explanationCsv(env([1, 3, 0], [-1, 2, 0])).trim().split('\n')
    expect(csv[0]).toBe('group,feature_start,feature_end,axis_start,axis_end,mean_abs_attribution,mean_signed_attribution,mean_signed_std_error')
    expect(csv).toHaveLength(4)
    expect(csv[2]).toBe('1104,2,3,1104,1104,3,2,0.2')
    expect(toCsv([['a,b', 'say "x"', Number.NaN]])).toBe('"a,b","say ""x""",\n')
  })
})

describe('spaceExplanation', () => {
  const base = { preprocessing: { steps: ['n4m:preprocessing.scatter.snv'], affine: false, column_aligned: true }, axis: { values: [], unit: 'nm', kind: 'wavelength' as const } }
  it('explains model-input profiles drawn on the raw axis', () => {
    expect(spaceExplanation('model_input', { ...base, exactness: 'exact' })).toContain('weighs the preprocessed signal')
  })
  it('separates exact and local raw-spectrum views', () => {
    expect(spaceExplanation('raw_input', { ...base, exactness: 'exact' })).toContain('exactly β_raw · x + b')
    expect(spaceExplanation('raw_input', { ...base, exactness: 'local_mean' })).toContain('linearized around each explained spectrum')
    const affine = { ...base, preprocessing: { ...base.preprocessing, affine: true } }
    expect(spaceExplanation('raw_input', { ...affine, exactness: 'local_mean' })).toContain('equals its exact raw-spectrum coefficients')
  })
})
