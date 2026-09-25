import { describe, expect, it } from 'vitest'
import { loadMlJsBackend } from './mljs-backend'
import type { Mat } from './algo/linalg'

const X: Mat = {
  data: Float64Array.from(Array.from({ length: 24 }, (_, i) => [i, i % 4]).flat()),
  rows: 24,
  cols: 2,
}
const regression: Mat = {
  data: Float64Array.from(Array.from({ length: 24 }, (_, i) => 2 * i + (i % 4))),
  rows: 24,
  cols: 1,
}
const classification: Mat = {
  data: Float64Array.from(Array.from({ length: 24 }, (_, i) => i < 12 ? [1, 0] : [0, 1]).flat()),
  rows: 24,
  cols: 2,
}

describe('Web ml.js backend', () => {
  it.each([
    ['MlJsRandomForestRegressor', regression, 1],
    ['MlJsRandomForestClassifier', classification, 2],
  ] as const)('fits and replays %s with a synchronous predictor', async (type, Y, cols) => {
    const backend = await loadMlJsBackend()
    const model = backend.fit({ type, params: { n_estimators: 11, seed: 7 } }, X, Y, 1)
    const result = backend.predict(JSON.parse(JSON.stringify(model)), X)
    expect(result.rows).toBe(X.rows)
    expect(result.cols).toBe(cols)
    expect(Array.from(result.data).every(Number.isFinite)).toBe(true)
    if (cols === 2) {
      for (let row = 0; row < X.rows; row++) {
        expect(result.data[row * 2] + result.data[row * 2 + 1]).toBe(1)
      }
    }
    expect(backend.predict(model, X)).toEqual(result)
    if (cols === 2) {
      // The actual browser sends fitted state across a Worker boundary.
      // structuredClone strips ml-matrix methods from CART leaf probabilities.
      const future: Mat = { data: Float64Array.from([-1, 0, 25, 1]), rows: 2, cols: 2 }
      const transferred = structuredClone(model)
      const expected = backend.predict(model, future)
      expect(backend.predict(transferred, future)).toEqual(expected)
      expect(backend.predict(JSON.parse(JSON.stringify(transferred)), future)).toEqual(expected)
    }
  })

})
