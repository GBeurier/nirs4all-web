import { buildN4aBundle } from '@/lib/n4a'
import type {
  RobustnessEvidencePublisher,
  RobustnessEvidencePublisherInput,
  RobustnessEvidencePublisherResult,
  RobustnessEvidenceRuntimeEvidence,
  RobustnessEvidenceSidecarOptions,
} from './types'

export const ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT = 'nirs4all-web.robustness-evidence-sidecar' as const
export const ROBUSTNESS_EVIDENCE_SIDECAR_VERSION = 1 as const
export const ROBUSTNESS_EVIDENCE_INDEXEDDB_NAME = 'nirs4all-web:robustness-evidence:v1' as const
export const ROBUSTNESS_EVIDENCE_INDEXEDDB_STORE = 'prediction_arrays' as const

export interface RobustnessEvidenceSidecarRecord {
  format: typeof ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT
  version: typeof ROBUSTNESS_EVIDENCE_SIDECAR_VERSION
  key: string
  runId: string
  createdAt: string
  handoff: RobustnessEvidencePublisherInput['handoff']
  runtimeEvidence: RobustnessEvidenceRuntimeEvidence
  predictionArrays: {
    X: Float64Array
    axis: number[]
    axisUnit: string
    nFeatures: number
    nSamples: number
    sampleIds: string[]
  }
      resultMetadata: {
        robustness_evidence: {
      X: {
        field: 'prediction_arrays.X'
        key: string
        rows: number
        cols: number
      }
      predictor_bundle: {
        field: 'result_metadata.robustness_evidence.predictor_bundle'
        format: 'nirs4all-web/n4a'
        key: string
      }
      publisher: 'nirs4all-web.browser-sidecar'
    }
  }
  predictorBundle: unknown
}

export interface RobustnessEvidenceSidecarStore {
  readonly id: string
  put(record: RobustnessEvidenceSidecarRecord): Promise<{ key: string }>
}

export interface BrowserRobustnessEvidencePublisherOptions {
  now?: () => Date
}

function sidecarKey(runId: string, createdAt: string): string {
  return `${runId}:${createdAt}`.replace(/[^A-Za-z0-9_.:-]+/g, '-')
}

export function buildRobustnessEvidenceSidecarRecord(
  input: RobustnessEvidencePublisherInput,
  options: BrowserRobustnessEvidencePublisherOptions = {},
): RobustnessEvidenceSidecarRecord {
  const createdAt = (options.now ?? (() => new Date()))().toISOString()
  const key = sidecarKey(input.result.id, createdAt)
  return {
    format: ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT,
    version: ROBUSTNESS_EVIDENCE_SIDECAR_VERSION,
    key,
    runId: input.result.id,
    createdAt,
    handoff: input.handoff,
    runtimeEvidence: input.runtimeEvidence,
    predictionArrays: {
      X: input.dataset.X,
      axis: [...input.dataset.axis],
      axisUnit: input.dataset.axisUnit,
      nFeatures: input.dataset.nFeatures,
      nSamples: input.dataset.nSamples,
      sampleIds: [...input.dataset.sampleIds],
    },
    resultMetadata: {
      robustness_evidence: {
        X: {
          field: 'prediction_arrays.X',
          key,
          rows: input.dataset.nSamples,
          cols: input.dataset.nFeatures,
        },
        predictor_bundle: {
          field: 'result_metadata.robustness_evidence.predictor_bundle',
          format: 'nirs4all-web/n4a',
          key,
        },
        publisher: 'nirs4all-web.browser-sidecar',
      },
    },
    predictorBundle: buildN4aBundle(input.result),
  }
}

export function createBrowserRobustnessEvidencePublisher(
  store: RobustnessEvidenceSidecarStore,
  options: BrowserRobustnessEvidencePublisherOptions = {},
): RobustnessEvidencePublisher {
  return async (input): Promise<RobustnessEvidencePublisherResult> => {
    const record = buildRobustnessEvidenceSidecarRecord(input, options)
    const saved = await store.put(record)
    const key = saved.key
    return {
      publisher: store.id,
      published: {
        'prediction_arrays.X': {
          key,
          rows: record.predictionArrays.nSamples,
          cols: record.predictionArrays.nFeatures,
          sampleIds: record.predictionArrays.sampleIds.length,
          store: store.id,
        },
        'result_metadata.robustness_evidence.X': record.resultMetadata.robustness_evidence.X,
        'result_metadata.robustness_evidence.predictor_bundle': record.resultMetadata.robustness_evidence.predictor_bundle,
      },
      metadata: {
        key,
        store: store.id,
        format: ROBUSTNESS_EVIDENCE_SIDECAR_FORMAT,
        version: ROBUSTNESS_EVIDENCE_SIDECAR_VERSION,
      },
    }
  }
}

export interface IndexedDbRobustnessEvidenceSidecarStoreOptions {
  dbName?: string
  storeName?: string
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function openIndexedDbStore(
  options: Required<IndexedDbRobustnessEvidenceSidecarStoreOptions>,
): Promise<IDBDatabase> {
  const request = indexedDB.open(options.dbName, 1)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(options.storeName)) {
      db.createObjectStore(options.storeName, { keyPath: 'key' })
    }
  }
  return requestToPromise(request)
}

export function createIndexedDbRobustnessEvidenceSidecarStore(
  options: IndexedDbRobustnessEvidenceSidecarStoreOptions = {},
): RobustnessEvidenceSidecarStore {
  const resolved = {
    dbName: options.dbName ?? ROBUSTNESS_EVIDENCE_INDEXEDDB_NAME,
    storeName: options.storeName ?? ROBUSTNESS_EVIDENCE_INDEXEDDB_STORE,
  }
  return {
    id: `indexeddb:${resolved.dbName}/${resolved.storeName}`,
    async put(record) {
      if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is unavailable in this runtime')
      }
      const db = await openIndexedDbStore(resolved)
      try {
        const tx = db.transaction(resolved.storeName, 'readwrite')
        const store = tx.objectStore(resolved.storeName)
        await requestToPromise(store.put(record))
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
        })
      } finally {
        db.close()
      }
      return { key: record.key }
    },
  }
}

export function createIndexedDbRobustnessEvidencePublisher(
  storeOptions: IndexedDbRobustnessEvidenceSidecarStoreOptions = {},
  publisherOptions: BrowserRobustnessEvidencePublisherOptions = {},
): RobustnessEvidencePublisher {
  return createBrowserRobustnessEvidencePublisher(
    createIndexedDbRobustnessEvidenceSidecarStore(storeOptions),
    publisherOptions,
  )
}

export function createRobustnessEvidencePublisherFromSidecar(
  sidecar: RobustnessEvidenceSidecarOptions | undefined,
): RobustnessEvidencePublisher | undefined {
  if (!sidecar) return undefined
  if (sidecar.kind === 'indexeddb') {
    return createIndexedDbRobustnessEvidencePublisher({
      dbName: sidecar.dbName,
      storeName: sidecar.storeName,
    })
  }
  return undefined
}
