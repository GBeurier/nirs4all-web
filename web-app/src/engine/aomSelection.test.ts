import { describe, expect, it } from 'vitest'
import { formatRanking, operatorLabel, summarizeAomFit } from './aomSelection'

const matrix = (data: number[], rows: number, cols: number) => ({ data: Float64Array.from(data), rows, cols })

// Two chains (identity; SG d1 w11 p2 › detrend d1) on the raw and SNV branches.
const bank = {
  chain_offsets: [0, 1, 3],
  operator_kinds: [0, 9, 7],
  operator_param_offsets: [0, 0, 3, 4],
  operator_params: matrix([11, 2, 1, 1], 4, 1),
  branches: [0, 1],
}

describe('operatorLabel', () => {
  it('names Methods operators from their kind and parameters', () => {
    expect(operatorLabel(0, [])).toBe('identity')
    expect(operatorLabel(9, [11, 2, 1])).toBe('SG d1 w11 p2')
    expect(operatorLabel(8, [21, 3])).toBe('SG smooth w21 p3')
    expect(operatorLabel(7, [2])).toBe('detrend d2')
    expect(operatorLabel(10, [5, 5, 1])).toBe('NW d1 s5 g5')
    expect(operatorLabel(18, [2, 4, 2])).toBe('Gaussian σ2')
    expect(operatorLabel(15, [1])).toBe('diff d1')
  })
})

describe('summarizeAomFit', () => {
  it('ranks calibration (branch, chain) rows by their best internal CV RMSE', () => {
    const result = {
      ...bank,
      // rows: raw·identity, raw·chain1, SNV·identity, SNV·chain1; cols: 1..2 components
      cv_scores: matrix([0.9, 0.8, 0.5, 0.45, 0.7, Infinity, 0.6, 0.3], 4, 2),
      selected_branch: 1, selected_chain_index: 1, selected_parameter_index: 1, selected_n_components: 2,
    }
    const aom = summarizeAomFit('aom_pop.calibration', result)!
    expect(aom.criterion).toBe('cv_rmse')
    expect(aom.selected).toBe('SNV › SG d1 w11 p2 › detrend d1')
    expect(aom.candidates).toBe(4)
    expect(aom.nComponents).toBe(2)
    expect(aom.ranking.map((c) => c.label)).toEqual([
      'SNV › SG d1 w11 p2 › detrend d1', 'raw › SG d1 w11 p2 › detrend d1', 'SNV › identity', 'raw › identity'])
    expect(aom.ranking[0].score).toBe(0.3)
    expect(formatRanking(aom, 2)).toBe('SNV › SG d1 w11 p2 › detrend d1 (0.3); raw › SG d1 w11 p2 › detrend d1 (0.45)')
  })

  it('ranks Fast calibration by the screening criterion, higher first, skipping failed chains', () => {
    const result = {
      ...bank,
      cv_scores: matrix([0.4, 0.35], 1, 2),
      screen_scores: matrix([0.2, 0.9, NaN, 0.5], 4, 1),
      selected_branch: 0, selected_chain_index: 1, selected_parameter_index: 0, selected_alpha: 0.012345,
    }
    const aom = summarizeAomFit('aom_pop.calibration', result)!
    expect(aom.criterion).toBe('screening')
    expect(aom.selected).toBe('raw › SG d1 w11 p2 › detrend d1')
    expect(aom.ranking.map((c) => c.score)).toEqual([0.9, 0.5, 0.2])
    expect(aom.alpha).toBe(0.012345)
  })

  it('ranks AOM-PLS operators and names POP-PLS per-component choices', () => {
    const operators = { operator_kinds: [0, 9], operator_param_offsets: [0, 0, 3], operator_params: matrix([7, 2, 1], 3, 1) }
    const aom = summarizeAomFit('aom_pop.aom_pls', {
      ...operators, operator_scores: matrix([0.8, 0.4], 2, 1), selected_operator_index: 1, selected_n_components: 3,
    })!
    expect(aom.selected).toBe('SG d1 w7 p2')
    expect(aom.ranking.map((c) => c.label)).toEqual(['SG d1 w7 p2', 'identity'])
    const pop = summarizeAomFit('aom_pop.pop_pls', { ...operators, selected_operator_indices: [1, 0], selected_n_components: 2 })!
    expect(pop.selected).toBe('c1: SG d1 w7 p2 · c2: identity')
    expect(pop.ranking).toEqual([])
  })

  it('returns nothing for other methods or results without chain descriptors', () => {
    expect(summarizeAomFit('models.pls.pls_regression', bank)).toBeUndefined()
    expect(summarizeAomFit('aom_pop.calibration', { selected_branch: 0, selected_chain_index: 1 })).toBeUndefined()
    expect(summarizeAomFit('aom_pop.calibration', null)).toBeUndefined()
  })
})
