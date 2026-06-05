import { describe, it, expect, vi } from 'vitest'
import { assertAomBudget } from './guard'
import type { MaterializedDataset, PipelineDSL } from './types'

// Only the fields assertAomBudget reads — empty partitions falls back to nSamples.
const ds = (nSamples: number, nFeatures: number): MaterializedDataset =>
  ({ nSamples, nFeatures, partitions: [] }) as unknown as MaterializedDataset

const dsl = (type: string, params: Record<string, unknown> = {}): PipelineDSL =>
  ({ name: 't', steps: [], model: { id: 'm', type, params } }) as unknown as PipelineDSL

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

  it('refuses an extreme AOM screen with actionable guidance', () => {
    expect(() => assertAomBudget(ds(10000, 4000), dsl('AOMPLS'))).toThrow(/too large/i)
  })

  it('also guards POP-PLS', () => {
    expect(() => assertAomBudget(ds(10000, 4000), dsl('POPPLS'))).toThrow(/too large/i)
  })

  it('honours an explicit operator_bank + screen_folds in the estimate', () => {
    const onP = vi.fn()
    // a tiny 1-operator, 2-fold screen on the same size stays under the warn bound
    assertAomBudget(ds(1000, 1000), dsl('AOMPLS', { operator_bank: [0], screen_folds: 2 }), onP)
    expect(onP).not.toHaveBeenCalled()
  })
})
