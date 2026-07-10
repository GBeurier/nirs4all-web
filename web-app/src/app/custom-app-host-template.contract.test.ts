import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCustomHostState, CustomAppHostDemo } from '../../examples/custom-app-host/src/App'

const exampleRoot = join(process.cwd(), 'examples', 'custom-app-host')

describe('standalone custom app host template', () => {
  it('uses only public nirs4all and nirs4all-ui imports', () => {
    const source = readFileSync(join(exampleRoot, 'src', 'App.tsx'), 'utf8')

    expect(source).toContain("from 'nirs4all'")
    expect(source).toContain("from 'nirs4all-ui/components'")
    expect(source).toContain("from 'nirs4all-ui/dataset'")
    expect(source).toContain("from 'nirs4all-ui/runtime'")
    expect(source).not.toContain("from '@/")
    expect(source).not.toContain("from '../../src/")
  })

  it('exposes reusable core and UI surfaces without app internals', () => {
    const state = buildCustomHostState()
    const source = readFileSync(join(exampleRoot, 'src', 'App.tsx'), 'utf8')

    expect(state.predictSurface).toBe('javascript_wasm')
    expect(state.controllerCount).toBeGreaterThanOrEqual(4)
    expect(state.datasetTitle).toBe('Custom host demo dataset')
    expect(state.engineLabel).toBe('Nirs4all Core Wasm')
    expect(state.runtimeLabel).toBe('executed by dag-ml')
    expect(CustomAppHostDemo).toBeTypeOf('function')
    expect(source).toContain('aria-label="nirs4all custom app host"')
    expect(source).toContain('DatasetPreviewCard')
    expect(source).toContain('RuntimeEngineBadge')
    expect(source).toContain('MetricValueBadge')
    expect(source).toContain('Runtime predict surface')
  })
})
