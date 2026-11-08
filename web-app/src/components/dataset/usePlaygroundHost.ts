import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaygroundResult, PlaygroundRunRequest, PlaygroundStatus } from 'nirs4all-ui/playground'
import { createPreviewWorker } from '@/engine/preview-worker'
import type { MaterializedDataset } from '@/engine/types'

/** Response identity is scoped to both a dataset revision and a request. */
export function createPreviewGate() {
  let latest: { datasetKey: string; requestId: string } | null = null
  return {
    invalidate() { latest = null },
    start(datasetKey: string, requestId: string) { latest = { datasetKey, requestId } },
    accepts(datasetKey: string, requestId: string) {
      return latest?.datasetKey === datasetKey && latest.requestId === requestId
    },
  }
}

export function usePlaygroundHost(ds: MaterializedDataset, datasetKey: string) {
  const worker = useRef<Worker | null>(null)
  const active = useRef(false)
  const gate = useRef(createPreviewGate())
  const currentKey = useRef(datasetKey)
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [status, setStatus] = useState<PlaygroundStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const invalidate = useCallback(() => {
    gate.current.invalidate()
    // Native calls are synchronous inside the worker. Termination also cancels
    // those calls immediately, without waiting for its message loop to yield.
    if (active.current) {
      worker.current?.terminate()
      worker.current = null
    }
    active.current = false
    setResult(null)
    setStatus('idle')
    setError(null)
  }, [])
  if (currentKey.current !== datasetKey) {
    currentKey.current = datasetKey
    invalidate()
  }
  useEffect(() => () => {
    gate.current.invalidate()
    worker.current?.terminate()
    worker.current = null
    active.current = false
  }, [])

  const onRunRequest = useCallback((request: PlaygroundRunRequest) => {
    invalidate()
    if (request.datasetId !== currentKey.current) return
    gate.current.start(datasetKey, request.id)
    active.current = true
    setStatus('running')
    try {
      // Same engine-worker module/protocol as run/predict. The factory is a
      // real-URL module worker when served and the inline classic worker in the
      // single-file build (per-profile alias in vite.config.ts).
      // Reuse a completed worker and its loaded Methods module. Only an
      // in-flight cancellation or failure requires a fresh worker.
      const job = worker.current ?? createPreviewWorker()
      worker.current = job
      job.onmessage = (event: MessageEvent) => {
        const response = event.data
        if (!gate.current.accepts(response.datasetKey, response.id) || response.id !== request.id) return
        if (response.type === 'preview-result' && response.result.requestId === request.id) {
          setResult(response.result)
          setStatus('idle')
        } else if (response.type === 'error') {
          setError(response.message)
          setStatus('error')
        } else return
        active.current = false
        if (response.type === 'error') {
          job.terminate()
          if (worker.current === job) worker.current = null
        }
      }
      job.onerror = (event) => {
        if (!gate.current.accepts(datasetKey, request.id)) return
        setError(event.message || 'Owner preview unavailable in Web.')
        setStatus('error')
        active.current = false
        job.terminate()
        if (worker.current === job) worker.current = null
      }
      // Clone across the worker boundary; never transfer/detach the live X.
      job.postMessage({ type: 'preview', id: request.id, datasetKey, ds, request })
    } catch (cause) {
      worker.current?.terminate()
      worker.current = null
      active.current = false
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [ds, datasetKey, invalidate])

  return { result, status, error, onRunRequest, invalidate }
}
