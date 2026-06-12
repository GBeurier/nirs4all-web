import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { upstreams } from './nirs4all-lite'

describe('nirs4all-lite aggregate loaders', () => {
  it('keeps the datasets upstream candidate aligned with the vendored WASM package', () => {
    const datasets = upstreams.find((item) => item.key === 'datasets')
    const pkg = JSON.parse(readFileSync(new URL('./wasm/datasets/package.json', import.meta.url), 'utf8')) as { name: string }

    expect(datasets?.candidates).toContain(pkg.name)
    expect(pkg.name).toBe('@nirs4all/nirs4all-datasets-wasm')
  })
})
