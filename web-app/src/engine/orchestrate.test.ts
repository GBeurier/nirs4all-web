// Regression guard for the autonomous-model preprocessing bypass.
//
// AOM-PLS / POP-PLS (catalog `autonomous: true`) screen their own strict-linear
// operator bank by internal CV and MUST receive RAW X. Before the fix, fitChain
// applied every editor preprocessing step to X first, double-transforming the
// spectra and making libn4m reject the fit (the "AOM crashes at ~10% with any
// preceding preprocessing" bug). These tests pin the contract with a mock backend
// that records exactly what reaches it — no libn4m WASM needed.
import { describe, expect, it } from 'vitest'
import { trainAndPredict, type ModelBackend, type ModelSpec } from './orchestrate'
import type { FittedTransformer, Preprocessor } from './methods/preproc'
import type { Mat } from './algo/linalg'
import { mat } from './algo/linalg'
import type { MaterializedDataset, PipelineDSL } from './types'

function ds(n: number, p: number): MaterializedDataset {
  const X = new Float64Array(n * p)
  for (let i = 0; i < n * p; i++) X[i] = (i % 7) - 3
  const y = Float64Array.from({ length: n }, (_, i) => i * 0.5)
  return {
    X,
    nSamples: n,
    nFeatures: p,
    axis: Array.from({ length: p }, (_, j) => 1000 + j),
    axisUnit: 'nm',
    y,
    targetName: 't',
    taskType: 'regression',
    sampleIds: Array.from({ length: n }, (_, i) => `s${i}`),
    partitions: Array.from({ length: n }, () => 'train'),
  }
}

/** A preprocessor that flags every fit/restore so a test can assert it never ran. */
function spyPreproc(): { preproc: Preprocessor; fits: string[] } {
  const fits: string[] = []
  const stamp = (X: Mat): Mat => {
    // mark the data so a model fed transformed X would be observable
    const out = { data: Float64Array.from(X.data, (v) => v + 1000), rows: X.rows, cols: X.cols }
    return out
  }
  const tf: FittedTransformer = { state: [], apply: stamp, free: () => {} }
  const preproc: Preprocessor = {
    id: 'spy',
    fit: (type) => {
      fits.push(type)
      return tf
    },
    restore: () => ({ apply: stamp, free: () => {} }),
  }
  return { preproc, fits }
}

/** A backend that records the X matrix it was asked to fit / predict on. */
function spyBackend(preproc: Preprocessor): { backend: ModelBackend; seen: { fitX: Mat | null; predX: Mat | null } } {
  const seen: { fitX: Mat | null; predX: Mat | null } = { fitX: null, predX: null }
  const backend: ModelBackend = {
    id: 'spy',
    fit: (_spec: ModelSpec, X: Mat) => {
      seen.fitX = { data: Float64Array.from(X.data), rows: X.rows, cols: X.cols }
      return { kind: 'spy' }
    },
    predict: (_m, X: Mat) => {
      seen.predX = { data: Float64Array.from(X.data), rows: X.rows, cols: X.cols }
      return mat(X.rows, 1)
    },
    preproc,
  }
  return { backend, seen }
}

describe('trainAndPredict autonomous bypass', () => {
  it('does NOT preprocess for an autonomous model even with preceding steps', () => {
    const { preproc, fits } = spyPreproc()
    const { backend, seen } = spyBackend(preproc)
    const d = ds(10, 6)
    const dsl: PipelineDSL = {
      name: 'aom+preproc',
      steps: [
        { id: '1', type: 'StandardNormalVariate', params: {} },
        { id: '2', type: 'SavitzkyGolay', params: { window: 5, polyorder: 2, deriv: 1 } },
      ],
      model: { id: 'm', type: 'AOMPLS', params: { n_components: 4 } },
    }
    const trainIdx = [0, 1, 2, 3, 4, 5, 6]
    const predIdx = [7, 8, 9]
    const out = trainAndPredict(d, dsl, backend, trainIdx, predIdx)

    // the preprocessing chain must have been skipped entirely
    expect(fits).toEqual([])
    // and no descriptors are recorded (so predict-later replays nothing)
    expect(out.descriptors).toEqual([])
    expect(out.branch).toBeUndefined()
    // the backend saw RAW train rows (the spy stamp +1000 is absent)
    expect(seen.fitX?.rows).toBe(trainIdx.length)
    expect(seen.fitX?.data[0]).toBe(d.X[trainIdx[0] * d.nFeatures]) // unmodified
    expect(seen.predX?.rows).toBe(predIdx.length)
    expect(seen.predX?.data[0]).toBe(d.X[predIdx[0] * d.nFeatures]) // unmodified
  })

  it('DOES preprocess for a non-autonomous model (PLS) — the chain still runs', () => {
    const { preproc, fits } = spyPreproc()
    const { backend, seen } = spyBackend(preproc)
    const d = ds(10, 6)
    const dsl: PipelineDSL = {
      name: 'snv+pls',
      steps: [{ id: '1', type: 'StandardNormalVariate', params: {} }],
      model: { id: 'm', type: 'PLS', params: { n_components: 3 } },
    }
    const out = trainAndPredict(d, dsl, backend, [0, 1, 2, 3, 4, 5, 6], [7, 8, 9])
    expect(fits).toEqual(['StandardNormalVariate'])
    expect(out.descriptors.map((s) => s.type)).toEqual(['StandardNormalVariate'])
    // the model saw the stamped (transformed) matrix, not raw X
    expect(seen.fitX?.data[0]).toBe(d.X[0] + 1000)
  })
})
