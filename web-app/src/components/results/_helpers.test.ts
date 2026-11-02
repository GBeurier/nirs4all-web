import { describe, expect, it } from 'vitest'

import type { PipelineDSL, RunResult } from '@/engine/types'

import { variantChains } from './_helpers'

const pipeline = (window: number, components: number): PipelineDSL => ({
  name: 'p',
  steps: [
    { id: 'a', type: 'n4m:preprocessing.scatter.snv', params: {} },
    { id: 'b', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: window, polyorder: 2 } },
  ],
  model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: { n_components: components } },
})

describe('variantChains', () => {
  it('lists each variant step with its parameters and flags the swept slots', () => {
    const variants: NonNullable<RunResult['variants']> = [
      { variantId: 'v0', label: 'a', metrics: {}, selected: false, pipeline: pipeline(11, 5) },
      { variantId: 'v1', label: 'b', metrics: {}, selected: true, pipeline: pipeline(15, 5) },
      { variantId: 'v2', label: 'imported', metrics: {}, selected: false },
    ]
    const { chains, differing } = variantChains(variants, 'regression')
    expect(chains.has('v2')).toBe(false)
    const steps = chains.get('v1')!.steps
    expect(steps.map((s) => s.role)).toEqual(['preprocess', 'preprocess', 'model'])
    expect(steps[1].label).toMatch(/window_length=15, polyorder=2/)
    expect(steps[2].label).toMatch(/n_components=5/)
    expect([...differing]).toEqual(['step:1'])
  })
})
