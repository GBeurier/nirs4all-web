import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  loadDatasetsWasm,
  loadMethodsWasm,
  parseExecutionPlan,
  runPortablePipeline,
  upstreams,
} from './nirs4all-lite'

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
    expect(pkg.name).toBe('@nirs4all/nirs4all-datasets-wasm')
  })

  it('re-exports the portable execution and initialized WASM loaders from nirs4all-lite', () => {
    expect(typeof parseExecutionPlan).toBe('function')
    expect(typeof runPortablePipeline).toBe('function')
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
})
