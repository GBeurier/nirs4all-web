import { describe, expect, it } from 'vitest'

import { identifyNativeFitRefusal, markFitRefusal } from './fit-refusal'
import { N4mError, Status } from './wasm/methods/types.js'
import { RtErrorException } from './rt'
import { runGeneratorOr } from './orchestrate'
import type { PipelineDSL, RunProgress, RunResult } from './types'

const dsl: PipelineDSL = { name: 'search', steps: [] }

describe('runGeneratorOr progress', () => {
  it.each([3, 6, 12])('reports monotonic progress across all %i variants and selection', async (count) => {
    const seen: RunProgress[] = []
    const candidates = Array.from({ length: count }, (_, i) => ({ label: `alt ${i}`, dsl }))
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
    expect(seen.find((p) => p.message === `variant 2/${count} · fold 40`)?.variant).toEqual({ index: 2, total: count })
    expect(Math.max(...seen.filter((p) => p.variant?.index === 1).map((p) => p.pct))).toBeLessThanOrEqual(100 / count)
  })
})


const completedRun = { cv: { metrics: { rmse: 1 } }, refit: { metrics: {} } } as unknown as RunResult
const chooseFirst = async (ranked: { id: string }[]) => ranked[0].id

it('does not hide a strict infrastructure failure after a successful candidate', async () => {
  const failure = new RtErrorException({ verb: 'run', cause: 'runtime_error', message: 'Native scheduler unavailable' })
  let calls = 0
  await expect(runGeneratorOr(dsl, [0, 1, 2].map((i) => ({ label: String(i), dsl })), 'rmse', true,
    async () => { if (++calls === 2) throw failure; return completedRun }, chooseFirst,
  )).rejects.toBe(failure)
  expect(calls).toBe(2)
})

it('continues only after an identified estimator fit refusal', async () => {
  let calls = 0
  const result = await runGeneratorOr(dsl, [0, 1].map((i) => ({ label: String(i), dsl })), 'rmse', true,
    async () => { if (++calls === 1) throw markFitRefusal(new Error('Invalid model parameter')); return completedRun }, chooseFirst)
  expect(result.variantCount).toBe(2)
  expect(result.variants).toHaveLength(1)
  expect(result.variants![0].label).toBe('1')
})

it.each([Status.ERR_OUT_OF_MEMORY, Status.ERR_ABI_MISMATCH, Status.ERR_BACKEND_UNAVAILABLE, Status.ERR_CANCELLED])(
  'propagates fatal native status %i even at a fit boundary', async (status) => {
    const error = new N4mError(status, 'Fatal native runtime failure')
    identifyNativeFitRefusal(error, 'models.regularized.ridge')
    let calls = 0
    await expect(runGeneratorOr(dsl, [0, 1].map((i) => ({ label: String(i), dsl })), 'rmse', true,
      async () => { calls++; throw error }, chooseFirst)).rejects.toBe(error)
    expect(calls).toBe(1)
  },
)
