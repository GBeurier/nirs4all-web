import type { ReactElement } from 'react'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'
import * as nirs4allCore from '@/engine/nirs4all-core'
import { predictPortablePipeline, runPortablePipeline } from '@/engine/testing/frozen-core-0.5/execution.js'
import type { MaterializedDataset, PipelineDSL } from '@/engine/types'

const oracleUrl = new URL('../engine/fixtures/core-parity/portable_python_oracle.json', import.meta.url)

function maxAbsDiff(actual: number[], expected: number[]): number {
  expect(actual.length).toBe(expected.length)
  return actual.reduce((max, value, index) => Math.max(max, Math.abs(value - expected[index])), 0)
}

describe('custom app host contract', () => {
  it('keeps the named historical Core reference and reusable UI contract separate from current Web execution', async () => {
    expect(existsSync(oracleUrl)).toBe(true)
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
    // The wrapper publishes no coarse capability metadata: the retired contracts are not
    // exported, and the run below reads only the native profile definitions.
    for (const retired of ['artifactContracts', 'capabilityManifest', 'controllerCapabilities',
      'requiredKeywordRegistryEntries', 'runtimeContracts', 'runtimeSurfaces']) {
      expect(retired in nirs4allCore).toBe(false)
    }
    const definitions = nirs4allCore.coreExecutionProfileDefinitions()
    // Full owner profile set (nirs4all-core capability-profiles, all version 1), in owner order.
    expect(definitions.profiles.map((item) => `${item.id}@${item.version}`)).toEqual([
      'native-workflow@1',
      'native-conformal@1',
      'native-methods-package@1',
      'native-n4a-canonical@1',
      'n4a-container@1',
    ])
    expect(definitions.runtime_surfaces).toContain('javascript_wasm')

    const dataset: MaterializedDataset = {
      X: Float64Array.from(oracle.dataset.X),
      y: Float64Array.from(oracle.dataset.y),
      nSamples: oracle.dataset.rows,
      nFeatures: oracle.dataset.cols,
      axis: Array.from({ length: oracle.dataset.cols }, (_, index) => index),
      axisUnit: 'index',
      targetName: 'target',
      taskType: 'regression',
      sampleIds: Array.from({ length: oracle.dataset.rows }, (_, index) => `sample-${index}`),
      partitions: Array.from({ length: oracle.dataset.rows }, () => 'train' as const),
    }
    const dsl: PipelineDSL = {
      name: 'custom-host-portable-methods',
      split: { id: 'split', type: 'n4m:splitters.kennard_stone', params: { test_size: 0.3 } },
      steps: [
        { id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {} },
        { id: 'sg', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 11, polyorder: 2, deriv: 0 } },
      ],
      model: {
        id: 'pls',
        type: 'n4m:models.pls.pls_regression',
        params: { n_components: 2 },
        sweeps: { n_components: { type: 'range', from: 2, to: 11, step: 2 } },
      },
    }

    // This uses the verbatim dcc35fbe source reference, not current Core runner exports or MainEngine.
    const source = { name: dsl.name, pipeline: [
      { class: 'nirs4all.operators.splitters.KennardStoneSplitter', params: dsl.split!.params },
      { class: 'nirs4all.operators.transforms.StandardNormalVariate', params: {} },
      { class: 'nirs4all.operators.transforms.SavitzkyGolay', params: dsl.steps[1].params },
      { model: { class: 'sklearn.cross_decomposition.PLSRegression', params: dsl.model!.params }, param: 'n_components', _range_: [2, 11, 2] },
    ] }
    const run = await runPortablePipeline(source, { X: dataset.X, y: dataset.y, rows: dataset.nSamples, cols: dataset.nFeatures })
    const referenceEngine = 'nirs4all-core-wasm'
    expect(run.selected.n_components).toBe(expected!.selected.n_components)
    const predicted = await predictPortablePipeline(run, { X: dataset.X, rows: dataset.nSamples, cols: dataset.nFeatures })
    const heldOut = expected!.split.testIndices.map((index) => predicted.data[index])
    expect(maxAbsDiff(Array.from(heldOut), expected!.selected.predictions)).toBeLessThanOrEqual(
      oracle.metadata.tolerances.predictions_abs,
    )

    const preview = buildDatasetPreview({
      id: 'custom-host-oracle',
      name: 'Custom host oracle fixture',
      taskType: dataset.taskType,
      sampleCount: dataset.nSamples,
      featureCount: dataset.nFeatures,
      splitCounts: { test: expected!.split.testIndices.length, train: dataset.nSamples - expected!.split.testIndices.length },
      tags: ['nirs4all-core', 'nirs4all-ui', 'web'],
    })
    expect(preview?.title).toBe('Custom host oracle fixture')
    expect(preview?.badges.map((badge) => badge.label)).toEqual(expect.arrayContaining(['Regression']))

    const engineStatus = buildRuntimeEngineStatus({ engine: referenceEngine, requestedEngine: 'nirs4all-core-wasm' })
    expect(engineStatus?.badgeLabel.toLowerCase()).toContain('nirs4all core wasm')
    expect(runtimeEngineLabel({ compiled: true, executed: true })).toBe('executed by dag-ml')

    const datasetCard = DatasetPreviewCard({ view: preview, className: 'custom-host-dataset' }) as ReactElement<{ className: string }>
    const engineBadge = RuntimeEngineBadge({ status: engineStatus, className: 'custom-host-engine' }) as ReactElement<{ className: string }>
    const metricBadge = MetricValueBadge({
      metric: 'rmse',
      value: run.selected.rmse,
      className: 'custom-host-metric',
    }) as ReactElement<{ className: string }>

    expect(datasetCard.type).toBe('article')
    expect(datasetCard.props.className).toContain('custom-host-dataset')
    expect(engineBadge.type).toBe('span')
    expect(engineBadge.props.className).toBe('custom-host-engine')
    expect(metricBadge.type).toBe('span')
    expect(metricBadge.props.className).toBe('custom-host-metric')

    const artifactsDir = process.env.ARTIFACTS_DIR
    if (artifactsDir) {
      mkdirSync(artifactsDir, { recursive: true })
      writeFileSync(
        join(artifactsDir, 'custom-host-run.json'),
        JSON.stringify({
          status: 'passed',
          scope: 'historical Core reference; not current Web execution',
          engine: referenceEngine,
          selected_components: run.selected.n_components,
          score_metric: 'rmse',
          variant_count: run.variants.length,
        }, null, 2),
      )
      writeFileSync(
        join(artifactsDir, 'custom-host-predictions.json'),
        JSON.stringify({
          status: 'passed',
          prediction_rows: heldOut.length,
          max_abs_delta: maxAbsDiff(Array.from(heldOut), expected!.selected.predictions),
          tolerance: oracle.metadata.tolerances.predictions_abs,
        }, null, 2),
      )
      writeFileSync(
        join(artifactsDir, 'custom-host-ui.json'),
        JSON.stringify({
          status: 'passed',
          dataset_card: datasetCard.type,
          engine_badge: engineBadge.type,
          metric_badge: metricBadge.type,
          dataset_title: preview?.title,
          selected_pipeline_id: dsl.name,
          prediction_count: heldOut.length,
          engine_label: engineStatus?.badgeLabel,
        }, null, 2),
      )
    }
  })
})
