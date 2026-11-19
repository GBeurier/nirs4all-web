import { describe, expect, it } from 'vitest'
import { fromCanonicalPipeline, toCanonicalPipeline } from 'nirs4all-ui/pipelineEditor'
import { MAX_VARIANTS, SweepError, expandSweeps, sweepPlan } from './sweeps'

const pipeline = (pls: unknown, extra: unknown[] = []) => fromCanonicalPipeline({
  name: 'Sweep test',
  pipeline: [{ source_branch: { nirs: [{ class: 'preprocessing.scaling.standard_scale' }, ...extra] } },
    { model: { class: 'models.pls.pls_regression', params: { n_components: pls } } }],
} as never)
const plsComponents = (chain: ReturnType<typeof pipeline>) => {
  const steps = toCanonicalPipeline(chain).pipeline as Array<Record<string, any>>
  return steps[1].model.params.n_components
}

describe('parameter sweeps', () => {
  it('expands an inclusive integer range into fixed pipelines', async () => {
    const chain = pipeline({ _range_: [2, 6, 2] })
    expect(sweepPlan(chain, id => id.toUpperCase()).count).toBe(3)
    const variants = await expandSweeps(chain, id => id.toUpperCase())
    expect(variants.map(variant => plsComponents(variant.chain))).toEqual([2, 4, 6])
    expect(variants[1].choices).toEqual({ 'PLS regression · n_components': 4 })
    expect(variants[1].label).toBe('PLS regression · n_components = 4')
  })

  it('combines sweeps as a cartesian product and labels them by source lane', async () => {
    const chain = pipeline({ _or_: [3, 5] }, [{ class: 'preprocessing.derivatives.savitzky_golay', params: { window_length: { _or_: [11, 15, 21] } } }])
    const variants = await expandSweeps(chain, id => id.toUpperCase())
    expect(variants).toHaveLength(6)
    expect(Object.keys(variants[0].choices).sort()).toEqual(['NIRS · Savitzky–Golay · window_length', 'PLS regression · n_components'].sort())
    expect(new Set(variants.map(variant => variant.label)).size).toBe(6)
  })

  it('leaves a pipeline without sweeps unchanged', async () => {
    const chain = pipeline(5)
    expect(sweepPlan(chain).count).toBe(1)
    expect(await expandSweeps(chain)).toEqual([{ chain, choices: {}, label: '' }])
  })

  it('refuses too many variants and generators it does not run', async () => {
    await expect(expandSweeps(pipeline({ _range_: [1, MAX_VARIANTS + 1] }))).rejects.toBeInstanceOf(SweepError)
    expect(() => sweepPlan(pipeline({ _grid_: { a: [1, 2] } }))).toThrow(SweepError)
    expect(() => sweepPlan(pipeline({ _range_: [5, 1] }))).toThrow(/to ≥ from/)
  })
})
