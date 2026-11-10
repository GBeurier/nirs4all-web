import { useEffect, useMemo, useRef } from 'react'
import type { PlaygroundRunRequest } from 'nirs4all-ui/playground'
import type { MaterializedDataset, PipelineDSL } from '@/engine/types'
import { playgroundDatasetKey } from './playgroundAdapter'
import type { PreviewOp } from './preview'
import { usePlaygroundHost } from './usePlaygroundHost'

/** Every execution-affecting control participates in the response identity. */
export function datasetPreviewFingerprint(datasetKey: string, kind: 'preprocess' | 'pca', active: boolean,
  op: PreviewOp | null, cv: PipelineDSL['cv'] | null) {
  return JSON.stringify([datasetKey, kind, active, op ? { id: op.id, type: op.type, params: op.params } : null, cv])
}

/** The restored controls submit requests to the same Methods/DAG worker as Playground. */
export function useDatasetPreview(ds: MaterializedDataset, kind: 'preprocess' | 'pca', active: boolean,
  op: PreviewOp | null = null, cv: NonNullable<PipelineDSL['cv']> | null = null) {
  const datasetKey = playgroundDatasetKey(ds)
  const config = datasetPreviewFingerprint(datasetKey, kind, active, op, cv)
  const { result, status, error, onRunRequest, invalidate } = usePlaygroundHost(ds, datasetKey, config)
  const sequence = useRef(0)
  const requestIdentity = useRef({ config: '', id: '' })
  if (requestIdentity.current.config !== config) {
    requestIdentity.current = { config, id: `${datasetKey}:dataset-preview:${++sequence.current}` }
  }
  const requestId = requestIdentity.current.id
  useEffect(() => {
    if (!active) { invalidate(); return }
    const request: PlaygroundRunRequest = {
      id: requestId, datasetId: datasetKey,
      steps: op?.type ? [{ id: op.id, operatorId: op.type, params: op.params, enabled: true }] : [],
      cursorStepId: op?.type ? op.id : null,
      needs: { projection: kind === 'pca' ? 'pca' : null, components: 4, loadings: false, outliers: false,
        folds: cv !== null, repetitions: null },
    }
    onRunRequest(request, { profile: 'dataset-view', fitScope: kind === 'preprocess' ? 'train' : undefined,
      ...(cv !== null && { folds: cv }) })
  }, [datasetKey, kind, active, op, cv, requestId, onRunRequest, invalidate])

  const current = result?.requestId === requestId ? result : null
  const processed = useMemo(() => {
    if (!current || kind !== 'preprocess') return null
    const input = current.spectra
    if ('data' in input) return Float64Array.from(input.data)
    const data = new Float64Array(ds.nSamples * ds.nFeatures)
    input.forEach((row, index) => data.set(Array.from(row), index * ds.nFeatures))
    return data
  }, [current, kind, ds.nSamples, ds.nFeatures])
  return { result: current, processed, status, error }
}
