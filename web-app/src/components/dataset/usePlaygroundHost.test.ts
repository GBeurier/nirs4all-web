import { describe, expect, it } from 'vitest'
import { createPreviewGate } from './usePlaygroundHost'
import { datasetPreviewFingerprint } from './useDatasetPreview'
import { playgroundDatasetKey } from './playgroundAdapter'
import type { MaterializedDataset } from '@/engine/types'
import type { PreviewOp } from './preview'

describe('preview response identity', () => {
  it('drops a late result after a dataset/config revision switch, even if request IDs repeat', () => {
    const gate = createPreviewGate()
    gate.start('dataset-a', 'request-1')
    expect(gate.accepts('dataset-a', 'request-1')).toBe(true)
    gate.invalidate()
    expect(gate.accepts('dataset-a', 'request-1')).toBe(false)
    gate.start('dataset-b', 'request-1')
    expect(gate.accepts('dataset-a', 'request-1')).toBe(false)
    expect(gate.accepts('dataset-b', 'request-1')).toBe(true)
  })

  it('drops an older pipeline request and all responses after cancellation', () => {
    const gate = createPreviewGate()
    gate.start('dataset', 'old')
    gate.start('dataset', 'new')
    expect(gate.accepts('dataset', 'old')).toBe(false)
    expect(gate.accepts('dataset', 'new')).toBe(true)
    gate.invalidate()
    expect(gate.accepts('dataset', 'new')).toBe(false)
  })
})


describe('DatasetView preview configuration identity', () => {
  const op: PreviewOp = { id: 'smoothing', label: 'Smoothing', type: 'n4m:preprocessing.smoothing.gaussian', params: { sigma: 2 } }
  const cv = { folds: 5, seed: 691, strategy: 'group' as const }

  it('rejects a prior operator configuration even when its display id is unchanged', () => {
    const oldConfig = datasetPreviewFingerprint('dataset', 'preprocess', true, op, null)
    const newConfig = datasetPreviewFingerprint('dataset', 'preprocess', true, { ...op, params: { sigma: 4 } }, null)
    expect(oldConfig).not.toBe(newConfig)
    const gate = createPreviewGate()
    gate.start('dataset', 'same-request-id', oldConfig)
    gate.start('dataset', 'same-request-id', newConfig)
    expect(gate.accepts('dataset', 'same-request-id', oldConfig)).toBe(false)
    expect(gate.accepts('dataset', 'same-request-id', newConfig)).toBe(true)
  })

  it('drops older CV cohorts after count, seed or grouping strategy changes', () => {
    const initial = datasetPreviewFingerprint('dataset', 'pca', true, null, cv)
    const gate = createPreviewGate()
    gate.start('dataset', 'initial', initial)
    for (const changed of [{ ...cv, folds: 3 }, { ...cv, seed: 7 }, { ...cv, strategy: 'sample' as const }]) {
      const revision = datasetPreviewFingerprint('dataset', 'pca', true, null, changed)
      expect(revision).not.toBe(initial)
      gate.start('dataset', 'current', revision)
      expect(gate.accepts('dataset', 'initial', initial)).toBe(false)
      expect(gate.accepts('dataset', 'current', initial)).toBe(false)
      expect(gate.accepts('dataset', 'current', revision)).toBe(true)
    }
    const withoutCv = datasetPreviewFingerprint('dataset', 'pca', true, null, null)
    expect(withoutCv).not.toBe(initial)
  })

  it('rejects old dataset revisions and results arriving after leaving the PCA tab', () => {
    const original = {} as MaterializedDataset
    const revised = {} as MaterializedDataset
    const originalKey = playgroundDatasetKey(original)
    const revisedKey = playgroundDatasetKey(revised)
    expect(revisedKey).not.toBe(originalKey)
    const initial = datasetPreviewFingerprint(originalKey, 'pca', true, null, cv)
    const current = datasetPreviewFingerprint(revisedKey, 'pca', true, null, cv)
    const gate = createPreviewGate()
    gate.start(originalKey, 'request', initial)
    gate.invalidate()
    expect(gate.accepts(originalKey, 'request', initial)).toBe(false)
    gate.start(revisedKey, 'request', current)
    expect(gate.accepts(originalKey, 'request', initial)).toBe(false)
    expect(gate.accepts(revisedKey, 'request', current)).toBe(true)
    expect(datasetPreviewFingerprint(revisedKey, 'pca', false, null, cv)).not.toBe(current)
    gate.invalidate()
    expect(gate.accepts(revisedKey, 'request', current)).toBe(false)
  })
})
