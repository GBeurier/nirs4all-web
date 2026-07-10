import { describe, it, expect, vi } from 'vitest'
import { assertAomBudget } from './guard'
import type { MaterializedDataset, PipelineDSL } from './types'

// Only the fields assertAomBudget reads — empty partitions falls back to nSamples.
const ds = (nSamples: number, nFeatures: number): MaterializedDataset =>
  ({ nSamples, nFeatures, partitions: [] }) as unknown as MaterializedDataset

const dsl = (type: string, params: Record<string, unknown> = {}, cv?: { folds: number; seed: number }): PipelineDSL =>
  ({ name: 't', steps: [], model: { id: 'm', type, params }, cv }) as unknown as PipelineDSL

describe('assertAomBudget', () => {
  it('is a no-op for non-AOM models, however large', () => {
    const onP = vi.fn()
    expect(() => assertAomBudget(ds(10000, 4000), dsl('PLS'), onP)).not.toThrow()
    expect(onP).not.toHaveBeenCalled()
  })

  it('stays silent for a small AOM screen', () => {
    const onP = vi.fn()
    assertAomBudget(ds(100, 200), dsl('AOMPLS'), onP)
    expect(onP).not.toHaveBeenCalled()
  })

  it('warns (does not throw) for a heavy AOM screen', () => {
    const onP = vi.fn()
    expect(() => assertAomBudget(ds(1000, 1000), dsl('AOMPLS'), onP)).not.toThrow()
    expect(onP).toHaveBeenCalledTimes(1)
    expect(onP.mock.calls[0][0].message).toMatch(/AOMPLS/)
  })

  it('refuses the same heavy screen on the single-file main thread', () => {
    const onP = vi.fn()
    expect(() => assertAomBudget(ds(1000, 1000), dsl('AOMPLS'), onP, { mainThread: true })).toThrow(/offline single-file/i)
    expect(onP).not.toHaveBeenCalled()
  })

  it('warns but does not refuse an extreme AOM screen in a worker-backed run', () => {
    const onP = vi.fn()
    expect(() => assertAomBudget(ds(10000, 4000), dsl('AOMPLS'), onP, { mainThread: false })).not.toThrow()
    expect(onP).toHaveBeenCalledTimes(1)
  })

  it('also warns for POP-PLS', () => {
    const onP = vi.fn()
    expect(() => assertAomBudget(ds(10000, 4000), dsl('POPPLS'), onP, { mainThread: false })).not.toThrow()
    expect(onP).toHaveBeenCalledTimes(1)
  })

  it('lets the large offline worker AOM case run with an explicit warning', () => {
    const onP = vi.fn()
    const pipeline = dsl(
      'AOMPLS',
      { operator_bank: [0, 1, 2, 3, 4], screen_folds: 5, n_components: 10 },
      { folds: 5, seed: 42 },
    )
    expect(() => assertAomBudget(ds(3021, 1050), pipeline, onP, { mainThread: false })).not.toThrow()
    expect(onP.mock.calls[0][0].message).toMatch(/3021×1050/)
    expect(onP.mock.calls[0][0].message).toMatch(/5 inner folds × 10 components/)
    expect(onP.mock.calls[0][0].message).toMatch(/6 outer fits/)
  })

  it('honours an explicit operator_bank + screen_folds in the estimate', () => {
    const onP = vi.fn()
    // a tiny 1-operator, 2-fold screen on the same size stays under the warn bound
    assertAomBudget(ds(1000, 1000), dsl('AOMPLS', { operator_bank: [0], screen_folds: 2 }), onP)
    expect(onP).not.toHaveBeenCalled()
  })

  it('includes outer CV folds in the AOM estimate', () => {
    const onP = vi.fn()
    assertAomBudget(ds(1000, 1000), dsl('AOMPLS', { operator_bank: [0], screen_folds: 2 }, { folds: 10, seed: 1 }), onP)
    expect(onP).toHaveBeenCalledTimes(1)
  })
})
