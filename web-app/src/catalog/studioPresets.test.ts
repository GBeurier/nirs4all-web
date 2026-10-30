import { describe, expect, it } from 'vitest'
import { getStudioPipelinePresets, getPresetPipeline } from 'nirs4all-ui/pipelines'
import { PRESETS } from './presets'
import { findStudioPresetRecipe, importStudioPreset, repositoryPresetUrl } from './studioPresets'
import { countVariants } from '@/engine/dagml'
import { normalizeImportedPipeline } from '@/components/pipeline/_helpers'

describe('Studio preset parity', () => {
  it('uses the complete shared catalogue with identical canonical recipes', () => {
    expect(PRESETS).toEqual(getStudioPipelinePresets())
    expect(PRESETS).toHaveLength(10)
    expect(PRESETS.every((preset) => preset.available_variants?.length === 2)).toBe(true)
  })

  it('links and recognizes each original Repository variant without accepting changed recipes', () => {
    for (const preset of PRESETS) {
      for (const variant of preset.available_variants ?? []) {
        expect(repositoryPresetUrl(preset, variant)).toBe(`https://repository.nirs4all.org/pipeline/studio_${preset.id}_${variant}.html`)
        expect(findStudioPresetRecipe({ pipeline: getPresetPipeline(preset, variant) })).toEqual({ preset, variant })
      }
    }
    expect(findStudioPresetRecipe({ pipeline: [...getPresetPipeline(PRESETS[0], 'regression'), 'changed'] })).toBeNull()
  })

  it('preserves every Simple PLS alternative, CV setting and parameter sweep', () => {
    const result = importStudioPreset(PRESETS[0], 'regression')
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.pipeline.cv).toEqual({ folds: 5, seed: 42, strategy: 'sample' })
    expect(result.pipeline.containers?.[0].branches.map((branch) => branch.steps[0].type)).toEqual([
      'n4m:preprocessing.scatter.snv', 'n4m:preprocessing.scatter.msc', 'n4m:preprocessing.derivatives.savitzky_golay',
    ])
    expect(result.pipeline.containers?.[0].branches[2].steps[0].params).toEqual({
      window_length: 15, polyorder: 2, deriv: 1, delta: 1, mode: 'interp',
    })
    expect(result.pipeline.model?.sweeps).toEqual({ n_components: { type: 'range', from: 2, to: 30, step: 4 } })
    expect(countVariants(result.pipeline)).toBe(24)
  })

  it('preserves the Python Savitzky–Golay defaults when a recipe omits parameters', () => {
    const preset = structuredClone(PRESETS[0])
    preset.variants!.regression!.pipeline[0] = 'nirs4all.operators.transforms.nirs.SavitzkyGolay'
    const result = importStudioPreset(preset, 'regression')
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.pipeline.steps[0].params).toEqual({
      window_length: 11, polyorder: 3, deriv: 0, delta: 1, mode: 'interp',
    })
  })

  it('keeps sample CV and the complete search when an imported preset is exported and reopened', () => {
    const result = importStudioPreset(PRESETS[0], 'regression')
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    const reopened = normalizeImportedPipeline(JSON.parse(JSON.stringify(result.pipeline)))
    expect(reopened?.cv).toEqual(result.pipeline.cv)
    expect(reopened?.model?.sweeps).toEqual(result.pipeline.model?.sweeps)
    expect(reopened?.containers?.[0].branches[2].steps[0].params.mode).toBe('interp')
    expect(countVariants(reopened!)).toBe(24)
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
