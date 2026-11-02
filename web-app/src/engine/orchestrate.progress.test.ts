import { describe, expect, it } from 'vitest'

import { runGeneratorOr } from './orchestrate'
import type { PipelineDSL, RunProgress, RunResult } from './types'

const dsl: PipelineDSL = { name: 'search', steps: [] }

describe('runGeneratorOr progress', () => {
  it('reports one overall progress across every variant, never rewinding', async () => {
    const seen: RunProgress[] = []
    const candidates = [0, 1, 2].map((i) => ({ label: `alt ${i}`, dsl }))
    await runGeneratorOr(
      dsl,
      candidates,
      'rmse',
      true,
      async (_candidate, onProgress) => {
        // each candidate run reports its own 0 → 100
        for (const pct of [0, 40, 80]) onProgress({ phase: 'fit_cv', pct, message: `fold ${pct}` })
        onProgress({ phase: 'done', pct: 100 })
        return { cv: { metrics: { rmse: 1 } }, refit: { metrics: {} } } as unknown as RunResult
      },
      async (ranked) => ranked[0].id,
      (p) => seen.push(p),
    )
    const pcts = seen.map((p) => p.pct)
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
    expect(seen.at(-1)).toEqual({ phase: 'done', pct: 100 })
    expect(seen.filter((p) => p.phase === 'done')).toHaveLength(1)
    expect(seen.find((p) => p.message === 'variant 2/3 · fold 40')?.variant).toEqual({ index: 2, total: 3 })
    expect(Math.max(...seen.filter((p) => p.variant?.index === 1).map((p) => p.pct))).toBeLessThanOrEqual(100 / 3)
  })
})
