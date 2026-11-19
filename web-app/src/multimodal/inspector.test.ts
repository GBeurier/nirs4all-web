import { describe, expect, it } from 'vitest'
import type { AomSelection } from '../engine/aomSelection'
import { inspectorChains, type LabRunRecord } from './inspector'
import type { LabDataset } from './types'

const dataset = {
  name: 'Lab', sources: [{ id: 'nir', label: 'NIRS' }], target: { name: 'y', kind: 'numeric' },
} as unknown as LabDataset

const aom = (selected: string): AomSelection => ({
  methodId: 'aom_pop.calibration', criterion: 'screening', selected, candidates: 30,
  ranking: [{ label: selected, score: 0.9 }, { label: 'raw › identity', score: 0.4 }],
})
const selection = (selected: string) => ({ methodId: 'aom_pop.calibration', sourceIds: ['nir'], values: { selected_branch: 1, selected_chain_index: 3, selected_n_components: 5 }, aom: aom(selected) })

function run(modelSelections: LabRunRecord['candidate']['modelSelections']): LabRunRecord {
  const scope = { rmse: 1, r2: 0, mae: 1, perFold: [] }
  return {
    id: 'r1', index: 1, name: 'AOM', canonical: null,
    document: { label: 'AOM', branches: [{ sourceIds: ['nir'], sourceChains: [], head: { methodId: 'aom_pop.calibration', params: { fast: true } } }], merge: { kind: 'none' } },
    candidate: { recipeFingerprint: 'f', foldsFingerprint: 'folds', elapsedMs: 1, oof: scope, holdout: null, modelSelections },
  } as unknown as LabRunRecord
}

describe('multimodal Inspector AOM selection', () => {
  it('names the refit chain, ranks the candidates and counts agreeing fold fits', () => {
    const [chain] = inspectorChains(dataset, [run([selection('SNV › SG d1 w11 p2'), selection('raw › identity'), selection('SNV › SG d1 w11 p2')])])
    expect(chain.params).toMatchObject({
      'NIRS · AOM chain': 'SNV › SG d1 w11 p2',
      'NIRS · AOM top chains (Fast screening, higher is better)': 'SNV › SG d1 w11 p2 (0.9); raw › identity (0.4)',
      'NIRS · AOM chain stability': '1/2 fold fits',
      'NIRS · AOM n_components': 5,
    })
    expect(chain.attributes?.['NIRS · AOM chain']).toBe('SNV › SG d1 w11 p2')
  })

  it('keeps the numeric selection when the fit result has no chain descriptors', () => {
    const { aom: _aom, ...bare } = selection('unused')
    const [chain] = inspectorChains(dataset, [run([bare])])
    expect(chain.params).toMatchObject({ 'NIRS · AOM branch': 'SNV', 'NIRS · AOM chain': '#4' })
  })
})
