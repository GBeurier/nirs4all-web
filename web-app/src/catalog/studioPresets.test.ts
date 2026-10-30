import { describe, expect, it } from 'vitest'
import { getStudioPipelinePresets, getPresetPipeline } from 'nirs4all-ui/pipelines'
import { PRESETS } from './presets'
import { importStudioPreset } from './studioPresets'
import { countVariants } from '@/engine/dagml'

describe('Studio preset parity', () => {
  it('uses the complete shared catalogue with identical canonical recipes', () => {
    expect(PRESETS).toEqual(getStudioPipelinePresets())
    expect(PRESETS).toHaveLength(10)
    expect(PRESETS.every((preset) => preset.available_variants?.length === 2)).toBe(true)
  })

  it('preserves every Simple PLS alternative, CV setting and parameter sweep', () => {
    const result = importStudioPreset(PRESETS[0], 'regression')
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.pipeline.cv).toEqual({ folds: 5, seed: 42, strategy: 'sample' })
    expect(result.pipeline.containers?.[0].branches.map((branch) => branch.steps[0].type)).toEqual([
      'n4m:preprocessing.scatter.snv', 'n4m:preprocessing.scatter.msc', 'n4m:preprocessing.derivatives.savitzky_golay',
    ])
    expect(result.pipeline.model?.sweeps).toEqual({ n_components: { type: 'range', from: 2, to: 30, step: 4 } })
    expect(countVariants(result.pipeline)).toBe(24)
  })

  it('retains unsupported Studio recipes rather than replacing their search or model', () => {
    const before = getStudioPipelinePresets()
    const classification = importStudioPreset(PRESETS[0], 'classification')
    expect(classification.kind).toBe('unavailable')
    const exhaustive = PRESETS.find((preset) => preset.id === 'ultra_slow')!
    expect(importStudioPreset(exhaustive, 'regression').kind).toBe('unavailable')
    expect(getPresetPipeline(exhaustive, 'regression')).toEqual(getPresetPipeline(before.find((preset) => preset.id === 'ultra_slow')!, 'regression'))
    expect(PRESETS).toEqual(before)
  })
});
