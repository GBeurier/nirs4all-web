import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  loadDatasetsWasm,
  loadMethodsWasm,
  parseExecutionPlan,
  predictPortablePipeline,
  runPortablePipeline,
  upstreams,
} from './nirs4all-lite'
import { predictPortableLite, tryRunPortableLite } from './portable-lite'
import type { MaterializedDataset, PipelineDSL } from './types'

const liteRoot = new URL('../../../../nirs4all-lite/', import.meta.url)
const oracleUrl = new URL('tests/parity/expected/portable_python_oracle.json', liteRoot)
const fixtureDir = new URL('tests/parity/fixtures/', liteRoot)

function maxAbsDiff(actual: number[], expected: number[]): number {
  expect(actual.length).toBe(expected.length)
  return actual.reduce((max, value, index) => Math.max(max, Math.abs(value - expected[index])), 0)
}

describe('nirs4all-lite aggregate loaders', () => {
  it('keeps the datasets upstream candidate aligned with the vendored WASM package', () => {
    const datasets = upstreams.find((item) => item.key === 'datasets')
    const pkg = JSON.parse(readFileSync(new URL('./wasm/datasets/package.json', import.meta.url), 'utf8')) as { name: string }

    expect(datasets?.candidates).toContain(pkg.name)
    expect(pkg.name).toBe('@nirs4all/datasets-wasm')
  })

  it('re-exports the portable execution and initialized WASM loaders from nirs4all-lite', () => {
    expect(typeof parseExecutionPlan).toBe('function')
    expect(typeof runPortablePipeline).toBe('function')
    expect(typeof predictPortablePipeline).toBe('function')
    expect(typeof loadMethodsWasm).toBe('function')
    expect(typeof loadDatasetsWasm).toBe('function')
  })

  it('loads the vendored datasets WASM artifact', async () => {
    const datasets = await import('./wasm/datasets/nirs4all_datasets_wasm.js')
    const wasm = readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url))
    datasets.initSync({ module: wasm })

    expect(datasets.abiVersion()).toMatch(/^\d/)
    expect(datasets.sha256(new Uint8Array([97, 98, 99]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('executes the shared portable oracle through the vendored nirs4all-lite aggregate', async () => {
    if (!existsSync(oracleUrl)) return
    const oracle = JSON.parse(readFileSync(oracleUrl, 'utf8')) as {
      metadata: { tolerances: { targets_abs: number; rmse_abs: number; predictions_abs: number } }
      dataset: { X: number[]; y: number[]; rows: number; cols: number }
      cases: {
        name: string
        split: unknown
        targets: number[]
        variants: { n_components: number; rmse: number; predictions: number[] }[]
        selected: { n_components: number }
      }[]
    }
    const dataset = {
      X: Float64Array.from(oracle.dataset.X),
      y: Float64Array.from(oracle.dataset.y),
      rows: oracle.dataset.rows,
      cols: oracle.dataset.cols,
    }

    for (const expected of oracle.cases) {
      const fixture = readFileSync(new URL(`${expected.name}.json`, fixtureDir), 'utf8')
      const actual = await runPortablePipeline(fixture, dataset)
      expect(actual.split, expected.name).toEqual(expected.split)
      expect(maxAbsDiff(actual.targets, expected.targets), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.targets_abs)
      expect(actual.variants.length, expected.name).toBe(expected.variants.length)
      for (let i = 0; i < expected.variants.length; i += 1) {
        expect(actual.variants[i].n_components, expected.name).toBe(expected.variants[i].n_components)
        expect(Math.abs(actual.variants[i].rmse - expected.variants[i].rmse), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.rmse_abs)
        expect(maxAbsDiff(actual.variants[i].predictions, expected.variants[i].predictions), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.predictions_abs)
      }
      expect(actual.selected.n_components, expected.name).toBe(expected.selected.n_components)
    }
  })

  it('runs the web portable subset through the vendored aggregate and predicts from the fitted model', async () => {
    if (!existsSync(oracleUrl)) return
    const oracle = JSON.parse(readFileSync(oracleUrl, 'utf8')) as {
      metadata: { tolerances: { predictions_abs: number } }
      dataset: { X: number[]; y: number[]; rows: number; cols: number }
      cases: {
        name: string
        split: { testIndices: number[] }
        selected: { n_components: number; predictions: number[] }
      }[]
    }
    const expected = oracle.cases.find((item) => item.name === 'portable_methods_pipeline')
    expect(expected).toBeTruthy()

    const ds: MaterializedDataset = {
      X: Float64Array.from(oracle.dataset.X),
      y: Float64Array.from(oracle.dataset.y),
      nSamples: oracle.dataset.rows,
      nFeatures: oracle.dataset.cols,
      axis: Array.from({ length: oracle.dataset.cols }, (_, i) => i),
      axisUnit: 'index',
      targetName: 'target',
      taskType: 'regression',
      sampleIds: Array.from({ length: oracle.dataset.rows }, (_, i) => `s${i}`),
      partitions: Array.from({ length: oracle.dataset.rows }, () => 'train' as const),
    }
    const dsl: PipelineDSL = {
      name: 'portable_methods_pipeline',
      split: { id: 'split', type: 'KennardStone', params: { test_size: 0.3 } },
      steps: [
        { id: 'snv', type: 'StandardNormalVariate', params: {} },
        { id: 'sg', type: 'SavitzkyGolay', params: { window_length: 11, polyorder: 2, deriv: 0 } },
      ],
      model: {
        id: 'pls',
        type: 'PLS',
        params: { n_components: 2 },
        sweeps: { n_components: { type: 'range', from: 2, to: 11, step: 2 } },
      },
    }

    const run = await tryRunPortableLite(ds, dsl)
    expect(run).toBeTruthy()
    expect(run?.engine).toBe('nirs4all-lite-wasm')
    expect(run?.variantCount).toBe(5)
    expect((run?.model.dsl.model?.params.n_components)).toBe(expected!.selected.n_components)
    expect(maxAbsDiff(run!.refit.predictions.map((row) => row.predicted), expected!.selected.predictions)).toBeLessThanOrEqual(
      oracle.metadata.tolerances.predictions_abs,
    )

    const predicted = await predictPortableLite(run!.model, ds.X, ds.nSamples, ds.nFeatures)
    const heldOut = expected!.split.testIndices.map((index) => predicted.values[index])
    expect(maxAbsDiff(Array.from(heldOut), expected!.selected.predictions)).toBeLessThanOrEqual(
      oracle.metadata.tolerances.predictions_abs,
    )
  })
})
