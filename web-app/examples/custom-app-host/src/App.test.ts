import { expect, it } from 'vitest'
import { buildCustomHostState } from './App'

it('preserves the public Core/UI artifact and guarantee contracts in an independent host', () => {
  const state = buildCustomHostState()
  expect(state.predictSurface).toBe('javascript_wasm')
  expect(state.artifactContractCount).toBe(5)
  expect(state.conformalStatus).toBe('active')
  expect(state.robustnessGuaranteeStatus).toBe('invalidated')
  expect(state.keywordRequiredRegistryEntries).toContain('predict.coverage')
  expect(state.tuningSpaceSchema).toBe('https://nirs4all.org/schemas/tuning-ordered-search-space/v1')
})
