import type { ReactElement } from 'react'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'
import {
  artifactContracts,
  capabilityManifest,
  controllerCapabilities,
  requiredKeywordRegistryEntries,
  runtimeContracts,
  runtimeSurfaces,
} from '@/engine/nirs4all-core'
import { isPortableCoreModel, predictPortableCore, tryRunPortableCore } from '@/engine/portable-core'
import type { MaterializedDataset, PipelineDSL } from '@/engine/types'

const oracleUrl = new URL('../engine/fixtures/core-parity/portable_python_oracle.json', import.meta.url)

function maxAbsDiff(actual: number[], expected: number[]): number {
  expect(actual.length).toBe(expected.length)
  return actual.reduce((max, value, index) => Math.max(max, Math.abs(value - expected[index])), 0)
}

describe('custom app host contract', () => {
  it('combines nirs4all-core runtime output with reusable nirs4all-ui view components', async () => {
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
    const manifest = capabilityManifest()
    expect(manifest.schema).toBe('nirs4all-core.capabilities.v1')
    expect(manifest.controllers.map((item) => item.id)).toEqual([
      'split.kennard_stone',
      'preprocess.snv',
      'preprocess.savgol',
      'model.pls_regression',
      'pipeline.portable_methods',
    ])
    expect(manifest.runtimeSurfaces).toEqual(runtimeSurfaces)
    expect(manifest.runtimeContracts).toEqual(runtimeContracts)
    expect(manifest.artifactContracts).toEqual(artifactContracts)
    expect(artifactContracts.map((item) => item.id)).toEqual([
      'conformal.calibrated_result',
      'robustness.summary',
      'tuning.summary',
      'tuning.ordered_search_space',
      'keyword.registry',
    ])
    expect(artifactContracts.find((item) => item.id === 'robustness.summary')?.optionalPayloadFields).toEqual([
      'conformal_guarantee_status',
      'spectral_replay',
    ])
    expect(artifactContracts.find((item) => item.id === 'tuning.summary')?.optionalPayloadFields).toEqual([
      'sampler',
      'pruner',
      'seed',
      'persistence',
      'trials[*].diagnostics',
    ])
    expect(artifactContracts.find((item) => item.id === 'tuning.ordered_search_space')).toMatchObject({
      schema: 'https://nirs4all.org/schemas/tuning-ordered-search-space/v1',
      portableClaim: 'search-space-json-contract-only',
      requiredRegistryEntries: ['run.tuning.space', 'run.tuning.force_params'],
    })
    expect(requiredKeywordRegistryEntries).toEqual([
      'run.tuning',
      'run.tuning.engine',
      'run.tuning.space',
      'run.tuning.force_params',
      'run.tuning.score_data',
      'run.tuning.score_data.conformal_calibration',
      'predict.coverage',
      'predict.all_predictions',
      'robustness.scenarios.kind',
      'robustness.scenarios.severity',
      'robustness.scenarios.distribution',
      'robustness.X',
      'robustness.predictor',
      'robustness.predictor_bundle',
    ])
    expect(artifactContracts.find((item) => item.id === 'keyword.registry')?.requiredRegistryEntries).toEqual(
      requiredKeywordRegistryEntries,
    )
    expect(artifactContracts.find((item) => item.id === 'keyword.registry')?.publishedConstants).toEqual({
      ROBUSTNESS_SCENARIO_DISTRIBUTIONS: ['normal', 'uniform'],
    })
    expect(artifactContracts.every((item) => item.consumerLevel.javascript_wasm === 'metadata')).toBe(true)
    expect(runtimeContracts.map((item) => item.surface)).toEqual(runtimeSurfaces)
    expect(runtimeContracts.filter((item) => item.serializedModelPredict).map((item) => item.surface)).toEqual([
      'javascript_wasm',
    ])
    expect(runtimeContracts.find((item) => item.surface === 'javascript_wasm')?.predictEntrypoint).toBe(
      'predictPortablePipeline',
    )
    expect(manifest.controllers).toEqual(controllerCapabilities)
    expect(runtimeSurfaces).toContain('javascript_wasm')
    expect(controllerCapabilities.find((item) => item.id === 'pipeline.portable_methods')?.composes).toEqual([
      'split.kennard_stone',
      'preprocess.snv',
      'preprocess.savgol',
      'model.pls_regression',
    ])
    expect(controllerCapabilities.find((item) => item.id === 'pipeline.portable_methods')?.runtime.javascript_wasm).toBe('parity-validated')
    const serializedModelPredictSurfaces = runtimeContracts
      .filter((item) => item.serializedModelPredict)
      .map((item) => item.surface)
    const wasmPredictEntrypoint = runtimeContracts.find((item) => item.surface === 'javascript_wasm')?.predictEntrypoint
    const expectedSerializedModelPredictSurfaces = ['javascript_wasm']
    const expectedWasmPredictEntrypoint = 'predictPortablePipeline'
    const runtimeContractChecks = {
      serialized_predict_surface_count_absolute_delta: Math.abs(
        serializedModelPredictSurfaces.length - expectedSerializedModelPredictSurfaces.length,
      ),
      serialized_predict_surface_count_tolerance: 0,
      wasm_predict_entrypoint_absolute_delta: wasmPredictEntrypoint === expectedWasmPredictEntrypoint ? 0 : 1,
      wasm_predict_entrypoint_tolerance: 0,
    }
    expect(runtimeContractChecks).toEqual({
      serialized_predict_surface_count_absolute_delta: 0,
      serialized_predict_surface_count_tolerance: 0,
      wasm_predict_entrypoint_absolute_delta: 0,
      wasm_predict_entrypoint_tolerance: 0,
    })

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

    const run = await tryRunPortableCore(dataset, dsl)
    expect(run?.engine).toBe('nirs4all-core-wasm')
    expect(run?.scoreMetric).toBe('rmse')
    expect(isPortableCoreModel(run!.model)).toBe(true)
    expect(run?.model.dsl.model?.params.n_components).toBe(expected!.selected.n_components)

    const predicted = await predictPortableCore(run!.model, dataset.X, dataset.nSamples, dataset.nFeatures)
    const heldOut = expected!.split.testIndices.map((index) => predicted.values[index])
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

    const engineStatus = buildRuntimeEngineStatus({ engine: run!.engine, requestedEngine: 'nirs4all-core-wasm' })
    expect(engineStatus?.badgeLabel.toLowerCase()).toContain('nirs4all core wasm')
    expect(runtimeEngineLabel({ compiled: true, executed: true })).toBe('executed by dag-ml')
    expect(manifest.controllers.find((item) => item.id === 'pipeline.portable_methods')?.executionPath).toBe('run_portable_pipeline')

    const datasetCard = DatasetPreviewCard({ view: preview, className: 'custom-host-dataset' }) as ReactElement<{ className: string }>
    const engineBadge = RuntimeEngineBadge({ status: engineStatus, className: 'custom-host-engine' }) as ReactElement<{ className: string }>
    const metricBadge = MetricValueBadge({
      metric: run!.scoreMetric,
      value: run!.refit.metrics.rmse,
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
          engine: run!.engine,
          selected_components: run!.model.dsl.model?.params.n_components,
          score_metric: run!.scoreMetric,
          variant_count: run!.variantCount,
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
        join(artifactsDir, 'custom-host-runtime-contracts.json'),
        JSON.stringify({
          status: 'passed',
          schema: manifest.schema,
          runtime_surfaces: runtimeSurfaces,
          serialized_model_predict_surfaces: serializedModelPredictSurfaces,
          wasm_predict_entrypoint: wasmPredictEntrypoint,
          runtime_contract_checks: runtimeContractChecks,
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
