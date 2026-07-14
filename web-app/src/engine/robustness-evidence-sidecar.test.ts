import { describe, expect, it } from 'vitest'

import {
  buildRobustnessEvidenceSidecarRecord,
  createBrowserRobustnessEvidencePublisher,
  createRobustnessEvidencePublisherFromSidecar,
  ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT,
  type RobustnessEvidenceSidecarStore,
} from './robustness-evidence-sidecar'
import type {
  MaterializedDataset,
  NativeRobustnessEvidencePublicationHandoff,
  RunResult,
} from './types'

const handoff: NativeRobustnessEvidencePublicationHandoff = {
  kind: 'robustness_evidence_publication_handoff',
  requested: true,
  destination: 'result_metadata.robustness_evidence',
  failClosed: true,
  keywordIds: ['predict.save_to_workspace', 'predict.workspace_metadata', 'predict.workspace_result_metadata'],
  requiredEffects: [
    'workspace_prediction_rows',
    'prediction_arrays',
    'result_metadata',
    'workspace_prediction_id',
    'prediction_sample_metadata',
    'robustness_evidence',
  ],
  conformalArtifactPolicy: 'prediction_publisher_does_not_persist_conformal_artifacts',
  alignmentStrategies: ['sample_indices', 'full_dataset_length'],
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

function runtimeEvidence() {
  return {
    datasetRows: 2,
    datasetFeatures: 2,
    refitPredictionCount: 1,
    cvPredictionCount: 0,
    hasInMemoryModel: true,
  }
}

describe('browser robustness evidence sidecar publisher', () => {
  it('builds a sidecar record with row-aligned X and a predictor bundle', () => {
    const record = buildRobustnessEvidenceSidecarRecord({
      dataset,
      handoff,
      result,
      runtimeEvidence: runtimeEvidence(),
    }, {
      now: () => new Date('2026-07-14T01:00:00.000Z'),
    })

    expect(record).toMatchObject({
      format: ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT,
      version: 1,
      key: 'run-1:2026-07-14T01:00:00.000Z',
      runId: 'run-1',
      handoff: {
        keywordIds: ['predict.save_to_workspace', 'predict.workspace_metadata', 'predict.workspace_result_metadata'],
        requiredEffects: [
          'workspace_prediction_rows',
          'prediction_arrays',
          'result_metadata',
          'workspace_prediction_id',
          'prediction_sample_metadata',
          'robustness_evidence',
        ],
        conformalArtifactPolicy: 'prediction_publisher_does_not_persist_conformal_artifacts',
      },
      predictionArrays: {
        axis: [1000, 1005],
        axisUnit: 'nm',
        nFeatures: 2,
        nSamples: 2,
        sampleIds: ['s0', 's1'],
      },
      resultMetadata: {
        robustness_evidence: {
          X: {
            field: 'prediction_arrays.X',
            key: 'run-1:2026-07-14T01:00:00.000Z',
            rows: 2,
            cols: 2,
          },
          predictor_bundle: {
            field: 'result_metadata.robustness_evidence.predictor_bundle',
            format: 'nirs4all-web/n4a',
            key: 'run-1:2026-07-14T01:00:00.000Z',
          },
          publisher: 'nirs4all-web.browser-sidecar',
        },
      },
    })
    expect(record.predictionArrays.X).toBe(dataset.X)
    expect(record.predictorBundle).toMatchObject({
      format: 'nirs4all-web/n4a',
      name: 'PLS',
      targetName: 'y',
      model: {
        taskType: 'regression',
      },
    })
  })

  it('publishes all handoff fields through a sidecar store', async () => {
    const records: unknown[] = []
    const store: RobustnessEvidenceSidecarStore = {
      id: 'memory-sidecar',
      async put(record) {
        records.push(record)
        return { key: record.key }
      },
    }
    const publisher = createBrowserRobustnessEvidencePublisher(store, {
      now: () => new Date('2026-07-14T01:00:00.000Z'),
    })

    const publication = await publisher({
      dataset,
      handoff,
      result,
      runtimeEvidence: runtimeEvidence(),
    })

    expect(records).toHaveLength(1)
    expect(publication).toMatchObject({
      publisher: 'memory-sidecar',
      published: {
        'prediction_arrays.X': {
          key: 'run-1:2026-07-14T01:00:00.000Z',
          rows: 2,
          cols: 2,
          sampleIds: 2,
          store: 'memory-sidecar',
        },
        'result_metadata.robustness_evidence.X': {
          key: 'run-1:2026-07-14T01:00:00.000Z',
          rows: 2,
          cols: 2,
        },
        'result_metadata.robustness_evidence.predictor_bundle': {
          key: 'run-1:2026-07-14T01:00:00.000Z',
          format: 'nirs4all-web/n4a',
        },
      },
      metadata: {
        key: 'run-1:2026-07-14T01:00:00.000Z',
        store: 'memory-sidecar',
        format: ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT,
        version: 1,
      },
    })
  })

  it('propagates store errors so the trace layer can mark publication failed', async () => {
    const publisher = createBrowserRobustnessEvidencePublisher({
      id: 'memory-sidecar',
      async put() {
        throw new Error('sidecar quota exceeded')
      },
    })

    await expect(publisher({
      dataset,
      handoff,
      result,
      runtimeEvidence: runtimeEvidence(),
    })).rejects.toThrow('sidecar quota exceeded')
  })

  it('resolves serializable sidecar options into a runtime publisher', () => {
    expect(createRobustnessEvidencePublisherFromSidecar(undefined)).toBeUndefined()
    expect(createRobustnessEvidencePublisherFromSidecar({
      kind: 'indexeddb',
      dbName: 'custom-db',
      storeName: 'custom-store',
    })).toBeTypeOf('function')
  })
})
