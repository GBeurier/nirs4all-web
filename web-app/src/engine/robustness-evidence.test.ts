import { describe, expect, it } from 'vitest'

import {
  buildHostSidecarRobustnessEvidencePublicationTrace,
  buildWasmRobustnessEvidencePublicationTrace,
  withWasmRobustnessEvidencePublicationTrace,
} from './robustness-evidence'
import type { MaterializedDataset, NativeRobustnessEvidencePublicationHandoff, RunResult } from './types'

const handoff: NativeRobustnessEvidencePublicationHandoff = {
  kind: 'robustness_evidence_publication_handoff',
  requested: true,
  destination: 'result_metadata.robustness_evidence',
  failClosed: true,
  alignmentStrategies: [
    'sample_indices',
    'full_dataset_length',
    'unique_metadata_identity',
    'relation_manifest_identity',
  ],
  publishedFields: [
    'prediction_arrays.X',
    'result_metadata.robustness_evidence.X',
    'result_metadata.robustness_evidence.predictor_bundle',
  ],
}

const dataset: MaterializedDataset = {
  X: new Float64Array([1, 2, 3, 4]),
  nSamples: 2,
  nFeatures: 2,
  axis: [1000, 1005],
  axisUnit: 'nm',
  y: new Float64Array([1, 2]),
  targetName: 'y',
  taskType: 'regression',
  sampleIds: ['s0', 's1'],
  partitions: ['train', 'test'],
}

const result: RunResult = {
  id: 'run-1',
  pipelineName: 'PLS',
  taskType: 'regression',
  targetName: 'y',
  refit: {
    id: 'refit',
    name: 'Refit',
    kind: 'refit',
    metrics: { n: 1 },
    predictions: [{ sampleId: 's1', actual: 2, predicted: 2.1, residual: -0.1 }],
    status: 'completed',
  },
  cv: {
    id: 'cv',
    name: 'CV',
    kind: 'cv',
    metrics: { n: 1 },
    predictions: [{ sampleId: 's0', actual: 1, predicted: 1.1, residual: -0.1 }],
    status: 'completed',
  },
  folds: [],
  seed: 42,
  engine: 'dag-ml-wasm + libn4m',
  scoreMetric: 'rmse',
  model: {
    dsl: { name: 'PLS', steps: [], model: { id: 'm', type: 'PLS', params: {} } },
    taskType: 'regression',
    nFeatures: 2,
    state: {},
  },
  createdAt: '2026-07-14T00:00:00.000Z',
}

describe('WASM robustness evidence publication trace', () => {
  it('records the handoff as fail-closed because browser runs have no prediction-array store', () => {
    const trace = buildWasmRobustnessEvidencePublicationTrace(dataset, result, handoff)

    expect(trace).toMatchObject({
      kind: 'robustness_evidence_publication_trace',
      publisher: 'nirs4all-web.wasm-local',
      status: 'unsupported_runtime',
      requested: true,
      destination: 'result_metadata.robustness_evidence',
      failClosed: true,
      reason: 'wasm_local_has_no_persistent_prediction_array_store',
      runtimeEvidence: {
        datasetRows: 2,
        datasetFeatures: 2,
        refitPredictionCount: 1,
        cvPredictionCount: 1,
        hasInMemoryModel: true,
      },
    })
    expect(trace.alignmentStrategies).toContain('relation_manifest_identity')
    expect(trace.published).toEqual({})
    expect(trace.missing).toEqual(handoff.publishedFields)
  })

  it('attaches the trace only when a handoff is requested', async () => {
    await expect(withWasmRobustnessEvidencePublicationTrace(result, dataset, undefined)).resolves.toBe(result)
    await expect(withWasmRobustnessEvidencePublicationTrace(result, dataset, handoff)).resolves.toMatchObject({
      robustnessEvidencePublicationTrace: {
        status: 'unsupported_runtime',
      },
    })
  })

  it('publishes through an explicit host-sidecar publisher when one is provided', async () => {
    const trace = await buildHostSidecarRobustnessEvidencePublicationTrace(
      dataset,
      result,
      handoff,
      ({ handoff: receivedHandoff, runtimeEvidence }) => ({
        publisher: 'test-indexeddb-sidecar',
        published: {
          'prediction_arrays.X': { rows: runtimeEvidence.datasetRows, cols: runtimeEvidence.datasetFeatures },
          'result_metadata.robustness_evidence.X': true,
          'result_metadata.robustness_evidence.predictor_bundle': 'model.n4a',
        },
        metadata: {
          destination: receivedHandoff.destination,
        },
      }),
    )

    expect(trace).toMatchObject({
      publisher: 'test-indexeddb-sidecar',
      status: 'published',
      missing: [],
      published: {
        'prediction_arrays.X': { rows: 2, cols: 2 },
        'result_metadata.robustness_evidence.X': true,
        'result_metadata.robustness_evidence.predictor_bundle': 'model.n4a',
      },
      metadata: {
        destination: 'result_metadata.robustness_evidence',
      },
    })
  })

  it('keeps fail-closed incomplete status when the host publisher omits requested fields', async () => {
    const trace = await buildHostSidecarRobustnessEvidencePublicationTrace(
      dataset,
      result,
      handoff,
      () => ({
        published: {
          'prediction_arrays.X': { rows: 2, cols: 2 },
        },
        reason: 'predictor_bundle_not_persisted',
      }),
    )

    expect(trace).toMatchObject({
      publisher: 'nirs4all-web.host-sidecar',
      status: 'incomplete',
      reason: 'predictor_bundle_not_persisted',
    })
    expect(trace.missing).toEqual([
      'result_metadata.robustness_evidence.X',
      'result_metadata.robustness_evidence.predictor_bundle',
    ])
  })

  it('records host-sidecar exceptions as failed publication traces', async () => {
    const trace = await buildHostSidecarRobustnessEvidencePublicationTrace(
      dataset,
      result,
      handoff,
      () => {
        throw new Error('quota exceeded')
      },
    )

    expect(trace).toMatchObject({
      publisher: 'nirs4all-web.host-sidecar',
      status: 'failed',
      reason: 'quota exceeded',
      published: {},
      missing: handoff.publishedFields,
    })
  })

  it('uses the host-sidecar publisher through the RunResult wrapper', async () => {
    const wrapped = await withWasmRobustnessEvidencePublicationTrace(
      result,
      dataset,
      handoff,
      () => ({
        published: {
          'prediction_arrays.X': true,
          'result_metadata.robustness_evidence.X': true,
          'result_metadata.robustness_evidence.predictor_bundle': true,
        },
      }),
    )

    expect(wrapped.robustnessEvidencePublicationTrace).toMatchObject({
      status: 'published',
      missing: [],
    })
  })

  it('preserves unsupported-runtime fallback when no host-sidecar publisher is provided', async () => {
    await expect(withWasmRobustnessEvidencePublicationTrace(result, dataset, handoff)).resolves.toMatchObject({
      robustnessEvidencePublicationTrace: {
      status: 'unsupported_runtime',
      },
    })
  })
})
