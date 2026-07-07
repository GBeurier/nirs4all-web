import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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

  it('renders reusable core and UI surfaces without app internals', () => {
    const state = buildCustomHostState()
    const markup = renderToStaticMarkup(createElement(CustomAppHostDemo, { state }))

    expect(state.predictSurface).toBe('javascript_wasm')
    expect(state.controllerCount).toBeGreaterThanOrEqual(4)
    expect(markup).toContain('nirs4all custom host')
    expect(markup).toContain('Custom host demo dataset')
    expect(markup).toContain('Nirs4all Core Wasm')
    expect(markup).toContain('javascript_wasm')
  })
})
