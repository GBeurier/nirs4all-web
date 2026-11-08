import { expect, it } from 'vitest'
import { buildCustomHostState } from './App'

it('presents the Core execution profiles and the UI artifact guarantees in an independent host', () => {
  const state = buildCustomHostState()
  expect(state.executionProfileCount).toBeGreaterThan(0)
  expect(state.executionProfileIds).toContain('native-workflow')
  expect(state.javascriptWasmPredict).toContain('native-workflow: BrowserNativePipeline.predict, predictBrowserPipeline')
  expect(state.profileContentTypeSchemas).toContain('nirs4all.native-pipeline.v1')
  expect(state.conformalStatus).toBe('active')
  expect(state.robustnessGuaranteeStatus).toBe('invalidated')
  expect(state.tuningSpaceSchema).toBe('https://nirs4all.org/schemas/tuning-ordered-search-space/v1')
})
