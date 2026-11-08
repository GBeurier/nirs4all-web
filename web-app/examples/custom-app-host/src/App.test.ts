import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { buildCustomHostState, createDemoDataset, createDemoPipeline, CustomAppHostDemo, runDemoPipeline } from './App'

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

it('refuses the unchanged holdout demo when this standalone host has no execution adapter', async () => {
  const dataset = createDemoDataset()
  expect(dataset.rows).toBe(12)
  expect(dataset.cols).toBe(4)
  expect(dataset.X).toHaveLength(48)
  expect(dataset.y).toHaveLength(12)
  expect(createDemoPipeline().pipeline).toEqual([
    { class: 'nirs4all.operators.splitters.KennardStoneSplitter', params: { test_size: 0.25 } },
    { class: 'nirs4all.operators.transforms.StandardNormalVariate', params: {} },
    { model: { class: 'sklearn.cross_decomposition.PLSRegression', params: { n_components: 2 } } },
  ])
  await expect(runDemoPipeline()).rejects.toThrow(
    'Demo execution is unavailable in this standalone template: '
      + 'no owner-backed adapter is configured for KennardStone(test_size=0.25) -> SNV -> PLS(n_components=2). '
      + 'The request is not executed or replaced with another training protocol.',
  )
})

it('renders the unavailable execution status alongside the metadata demonstration', () => {
  const html = renderToStaticMarkup(createElement(CustomAppHostDemo))

  expect(html).toContain(
    '<p>Pipeline execution is unavailable in this standalone template pending a DAG holdout adapter. '
      + 'The content below demonstrates metadata presentation.</p>',
  )
})
