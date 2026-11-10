// Requires the actual owner RowL2Normalize artifact and manifest. Missing
// capability must fail these witnesses, never select a substitute or skip.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { nodeByType, PREPROCESSING_NODES } from '@/catalog/nodes'
import { PLAYGROUND_OPERATORS } from '@/components/dataset/playgroundAdapter'
import { buildN4aBundle, parseN4a, serializeTyped } from '@/lib/n4a'
import { initSync as initDagMl } from './wasm/dagml/dag_ml_wasm.js'
import { initSync as initData } from './wasm/dagml-data/dag_ml_data_wasm.js'
import { initSync as initDatasets } from './wasm/datasets/nirs4all_datasets_wasm.js'
import { loadMethodsWasm } from './nirs4all-core'
import { MainEngine } from './main-engine'
import * as nativeRoles from './methods/n4m'
import { libn4mPreprocessor } from './methods/preproc'
import type { Mat } from './algo/linalg'
import type { FittedState } from './orchestrate'
import type { MaterializedDataset, PipelineDSL } from './types'

const ROW_L2 = 'n4m:preprocessing.scaling.row_l2_normalize'
const COLUMN_NORMALIZE = 'n4m:preprocessing.scaling.normalize'
const matrix = (rows: number[][]): Mat => ({ data: Float64Array.from(rows.flat()), rows: rows.length, cols: rows[0].length })

function expectRows(actual: Mat, expected: number[][]) {
  expect(actual.rows).toBe(expected.length)
  expect(actual.cols).toBe(expected[0].length)
  expect(actual.data.length).toBe(expected.flat().length)
  for (const [index, value] of expected.flat().entries()) expect(actual.data[index]).toBeCloseTo(value, 12)
}

beforeAll(async () => {
  initDagMl({ module: readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url)) })
  initData({ module: readFileSync(new URL('./wasm/dagml-data/dag_ml_data_wasm_bg.wasm', import.meta.url)) })
  initDatasets({ module: readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url)) })
  await loadMethodsWasm()
})

describe('RowL2Normalize through the generic Web role path', () => {
  it('projects the real row role into the pipeline and Playground catalogs without changing column Normalize', () => {
    expect(nodeByType(ROW_L2)?.native, 'Stage the owner RowL2Normalize manifest before running this witness').toMatchObject({
      methodId: 'preprocessing.scaling.row_l2_normalize', role: 'transformer',
    })
    expect(PREPROCESSING_NODES.some((node) => node.type === ROW_L2)).toBe(true)
    expect(PLAYGROUND_OPERATORS.some((operator) => operator.id === ROW_L2)).toBe(true)
    expect(nodeByType(COLUMN_NORMALIZE)?.native?.methodId).toBe('preprocessing.scaling.normalize')
    expect(nodeByType(COLUMN_NORMALIZE)?.params.map((param) => param.name)).toEqual(expect.arrayContaining(['feature_min', 'feature_max']))
  })

  it('fits, exports N4ME and restores row semantics, zero rows and extreme finite magnitudes', () => {
    const train = matrix([[3, 4], [6, 8], [0, 0], [-3, 4]])
    const input = matrix([[30, 40], [0, 0], [3e-300, 4e-300], [1e300, -1e300]])
    const expected = [[0.6, 0.8], [0, 0], [0.6, 0.8], [Math.SQRT1_2, -Math.SQRT1_2]]
    const original = input.data.slice()
    const fitted = libn4mPreprocessor.fit(ROW_L2, {}, train, {})
    try {
      expectRows(fitted.apply(input), expected)
      expect(fitted.containsTrainingRows).toBe(false)
      expect(fitted.state).toBeInstanceOf(Uint8Array)
      const exported = libn4mPreprocessor.share(fitted.state, false)
      expect(exported).toBeInstanceOf(Uint8Array)
      const restored = libn4mPreprocessor.restore(ROW_L2, {}, structuredClone(exported))
      try {
        expectRows(restored.apply(input), expected)
        expect(Array.from(restored.apply(input).data)).toEqual(Array.from(fitted.apply(input).data))
      } finally { restored.free() }
      expect(input.data).toEqual(original)
    } finally { fitted.free() }
  })

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite fit and replay input (%s)', (value) => {
    const invalid = matrix([[3, value], [6, 8]])
    expect(() => libn4mPreprocessor.fit(ROW_L2, {}, invalid, {})).toThrow()
    const fitted = libn4mPreprocessor.fit(ROW_L2, {}, matrix([[3, 4], [6, 8]]), {})
    try {
      const restored = libn4mPreprocessor.restore(ROW_L2, {}, libn4mPreprocessor.share(fitted.state, false))
      try { expect(() => restored.apply(invalid)).toThrow() }
      finally { restored.free() }
    } finally { fitted.free() }
  })

  it('keeps column Normalize as fitted feature min-max scaling', () => {
    const fitted = libn4mPreprocessor.fit(COLUMN_NORMALIZE, { feature_min: 0, feature_max: 1 }, matrix([[1, 10], [2, 20], [3, 30]]), {})
    try { expectRows(fitted.apply(matrix([[1, 10], [2, 20], [3, 30]])), [[0, 0], [0.5, 0.5], [1, 1]]) }
    finally { fitted.free() }
  })

  it('feeds normalized rows to the production model and replays serialized pipeline state without refitting', async () => {
    const train = [[3, 4], [6, 8], [4, 3], [0, 0], [-3, 4], [-6, 8]]
    const heldout = [[30, 40], [60, 80], [0, 0]]
    const all = [...train, ...heldout]
    const ds: MaterializedDataset = {
      X: Float64Array.from(all.flat()), nSamples: all.length, nFeatures: 2,
      y: Float64Array.from([2, 2, 3, 0, -1, -1, 2, 2, 0]), taskType: 'regression', targetName: 'Row direction',
      axis: [0, 1], axisUnit: 'index', sampleIds: all.map((_, row) => `row-${row}`),
      partitions: all.map((_, row) => row < train.length ? 'train' : 'test'),
    }
    const dsl: PipelineDSL = { name: 'Native row L2 round-trip', steps: [{ id: 'row-l2', type: ROW_L2, params: {} }],
      model: { id: 'ridge', type: 'n4m:models.regularized.ridge', params: { alpha: 1 } } }
    const fit = vi.spyOn(nativeRoles, 'fitModel')
    try {
      const engine = new MainEngine({ profile: 'strict-wasm' })
      const run = await engine.run(ds, dsl)
      expect(fit).toHaveBeenCalledTimes(1)
      const modelInput = fit.mock.calls[0][2]
      expectRows(modelInput, [[0.6, 0.8], [0.6, 0.8], [0.8, 0.6], [0, 0], [-0.6, 0.8], [-0.6, 0.8]])
      const state = run.model.state as FittedState
      expect(state.chain[0].type).toBe(ROW_L2)
      expect(state.chain[0].state).toBeInstanceOf(Uint8Array)
      const shared = await engine.exportModel(run.model, { allowTrainingRows: false })
      const loaded = parseN4a(serializeTyped(buildN4aBundle({ ...run, model: shared })))
      expect(loaded.model.dsl.steps[0].type).toBe(ROW_L2)
      expect((loaded.model.state as FittedState).chain[0].state).toBeInstanceOf(Uint8Array)
      const input = matrix(heldout)
      const live = await engine.predict(run.model, input.data, input.rows, input.cols)
      const replay = await new MainEngine({ profile: 'strict-wasm' }).predict(loaded.model, input.data, input.rows, input.cols)
      expect(Array.from(replay.values)).toEqual(Array.from(live.values))
      expect(replay.values[0]).toBeCloseTo(replay.values[1], 12)
      expect(fit).toHaveBeenCalledTimes(1)
    } finally { fit.mockRestore() }
  })
})
