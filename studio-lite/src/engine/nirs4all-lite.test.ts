import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  loadDatasetsWasm,
  loadMethodsWasm,
  parseExecutionPlan,
  runPortablePipeline,
  upstreams,
} from './nirs4all-lite'

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
})
