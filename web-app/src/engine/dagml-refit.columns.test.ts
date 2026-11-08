import { describe, expect, it, vi } from 'vitest'

// The column refusal must not enter the DAG-ML replay: inside the PREDICT
// callback DAG-ML would render the refusal with its JS stack, and in the
// single-file build each WASM frame embeds the inlined data: module URL.
const loadDagMl = vi.hoisted(() => vi.fn(() => { throw new Error('DAG-ML must not be loaded for a refused column set') }))
vi.mock('./dagml', () => ({ loadDagMl }))

import { replayWithDagMl } from './dagml-refit'
import type { ModelBackend } from './orchestrate'
import type { FittedPipeline } from './types'

const names = ['1100', '1102', '1104']
const model = {
  dsl: { name: 'p', steps: [], model: { id: 'm', type: 'n4m:models.pls.pls_regression', params: {} } },
  taskType: 'regression',
  nFeatures: names.length,
  features: { names, axis: names.map(Number), unit: 'nm' },
  state: { nativeRefit: { schemaVersion: 1, packageJson: '{}', artifactId: 'a', carrierSha256: 'c', targetNames: ['y'] } },
} as unknown as FittedPipeline
const backend = {} as ModelBackend
const X = new Float64Array([1, 2, 3, 4, 5, 6])

describe('replayWithDagMl column identity', () => {
  it('refuses permuted named columns before the owner replay, with the plain message', async () => {
    const err = await replayWithDagMl(model, X, 2, 3, backend, [...names].reverse()).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toBe(
      'The input columns do not match the model\'s (axis 1100 … 1104 nm, 3 columns): the columns are in a different order: column 1 is "1104" where the model has "1100". Provide the columns with the training names, in the training order.',
    )
    expect(loadDagMl).not.toHaveBeenCalled()
  })

  it('refuses a width mismatch before the owner replay', async () => {
    await expect(replayWithDagMl(model, X, 3, 2, backend)).rejects.toThrow('The input has 2 columns but the model was fitted on 3.')
    expect(loadDagMl).not.toHaveBeenCalled()
  })

  it('lets matching named columns reach the owner replay', async () => {
    await expect(replayWithDagMl(model, X, 2, 3, backend, names)).rejects.toThrow('DAG-ML must not be loaded')
    expect(loadDagMl).toHaveBeenCalledTimes(1)
  })
})
