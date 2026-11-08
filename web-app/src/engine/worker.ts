// Engine Web Worker: hosts MainEngine off the main thread so heavy libn4m /
// dag-ml WASM compute (notably the AOM operator screen on a large dataset) never
// blocks the UI. The main thread talks to it through WorkerEngine (worker-engine.ts)
// with a tiny request/response protocol: {run|predict|export|cancel} in, {progress|
// result|error} out, correlated by job id. onProgress is relayed as messages and
// AbortSignal is bridged to a per-job AbortController.
/// <reference lib="webworker" />
import { MainEngine } from './main-engine'
import { isRtErrorException, rtErrorToWire } from './rt'
import { runResultToRtResultEnvelope } from './rt-result'
import { buildWebRuntimeProfile } from './web-profile'
import { nodeByType } from '@/catalog/nodes'
import { loadMethodsWasm } from './nirs4all-core'
import type { PlaygroundResult, PlaygroundRunRequest, StepOutcome } from 'nirs4all-ui/playground'
import type { Matrix, NativeEstimator, ParamValue, Transformer } from './wasm/methods/index.js'
import type {
  NativeRobustnessEvidencePublicationHandoff,
  RobustnessEvidenceSidecarOptions,
  RunOptions,
} from './types'

const ctx = self as unknown as DedicatedWorkerGlobalScope
// The served module worker and the single-file inline worker run the same owner DAG-ML engine.
const engine = new MainEngine({ mainThread: false, profile: buildWebRuntimeProfile() })
const controllers = new Map<string, AbortController>()

interface RunMsg {
  type: 'run'
  id: string
  ds: Parameters<MainEngine['run']>[0]
  dsl: Parameters<MainEngine['run']>[1]
  allowFallback?: boolean
  includeRtResult?: boolean
  robustnessEvidencePublicationHandoff?: NativeRobustnessEvidencePublicationHandoff
  robustnessEvidenceSidecar?: RobustnessEvidenceSidecarOptions
}
interface PredictMsg { type: 'predict'; id: string; model: Parameters<MainEngine['predict']>[0]; Xnew: Float64Array; nSamples: number; nFeatures: number; featureNames?: string[] }
interface ExportMsg { type: 'export'; id: string; model: Parameters<MainEngine['exportModel']>[0]; allowTrainingRows: boolean }
interface CancelMsg { type: 'cancel'; id: string }
interface PreviewMsg {
  type: 'preview'
  id: string
  datasetKey: string
  ds: Parameters<MainEngine['run']>[0]
  request: PlaygroundRunRequest
}
type InMsg = RunMsg | PredictMsg | ExportMsg | CancelMsg | PreviewMsg

/** Exploration only: native transformers and centred PCA, never run()/score. */
async function preview(msg: PreviewMsg, signal: AbortSignal): Promise<PlaygroundResult> {
  const { ds, request } = msg
  if (msg.id !== request.id || msg.datasetKey !== request.datasetId) throw new Error('Preview dataset/request mismatch.')
  const methods = await loadMethodsWasm()
  signal.throwIfAborted()
  let X: Matrix = { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
  const steps: StepOutcome[] = []
  const warnings = ['Preprocessing and centred PCA are fitted on all displayed rows, exploration only; no model is trained or scored.']
  for (const step of request.steps) {
    if (!step.enabled) continue
    signal.throwIfAborted()
    const node = nodeByType(step.operatorId)
    if (!step.operatorId.startsWith('n4m:') || node?.category !== 'preprocessing'
      || node.native?.role !== 'transformer' || node.native.inputs.y === 'required'
      || node.native.inputs.labels === 'required' || node.params.some((param) => param.type === 'array')) {
      throw new Error(`Preview operator ${step.operatorId} is unavailable in Web: only unsupervised native preprocessing transformers are supported.`)
    }
    const params: Record<string, ParamValue> = {}
    for (const [name, value] of Object.entries(step.params)) {
      if (!node.params.some((param) => param.name === name)) throw new Error(`Unknown preview parameter ${name}.`)
      if (value === undefined) continue
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new Error(`Unsupported preview parameter ${name}.`)
      }
      params[name] = value
    }
    const estimator = new (methods.methodClass(node.native.methodId))() as NativeEstimator & Transformer
    try {
      estimator.params = params
      estimator.fit(X, undefined, node.native.inputs.axis !== 'none' ? { axis: ds.axis } : {})
      const transformed = estimator.transform(X)
      // No invented axis for a changed feature basis/width.
      if (transformed.rows !== X.rows || transformed.cols !== ds.nFeatures) {
        throw new Error(`Preview operator ${step.operatorId} changes the row/axis shape; unavailable in Web.`)
      }
      X = transformed
      steps.push({ stepId: step.id, status: 'ok', shape: [X.rows, X.cols], message: 'Native Methods transform, fitted on all displayed rows; exploration only.' })
    } finally {
      estimator.dispose()
    }
  }
  const rows = Array.from({ length: X.rows }, (_, row) => row)
  const result: PlaygroundResult = {
    requestId: request.id,
    rows,
    spectra: rows.map((row) => X.data.subarray(row * X.cols, (row + 1) * X.cols)),
    wavelengths: ds.axis,
    unit: ds.axisUnit,
    steps,
    projection: null,
    loadings: null,
    outliers: null,
    folds: null,
    repetitions: null,
    warnings,
  }
  if (request.needs.projection === 'umap') warnings.push('UMAP is unavailable in Web; no substitute projection is returned.')
  if (request.needs.outliers) warnings.push('Outlier monitoring is unavailable in Web: a reference/monitored protocol has not been configured.')
  if (request.needs.folds) warnings.push('Preview folds are unavailable in Web; configure CV in the pipeline editor.')
  if (request.needs.repetitions) warnings.push('Repetition distances are unavailable in Web.')
  if (request.needs.projection === 'pca' || request.needs.loadings) {
    const components = Math.min(request.needs.components, X.rows - 1, X.cols)
    if (components < 1) warnings.push('PCA is unavailable in Web for fewer than two displayed rows or no features.')
    else {
      const pca = methods.preflightPca(X, components)
      warnings.push('PCA computed by Methods (preflightPca), centred on all displayed rows; exploration only.')
      if (request.needs.projection === 'pca') result.projection = {
        method: 'pca',
        coordinates: rows.map((row) => pca.scores.data.subarray(row * pca.scores.cols, (row + 1) * pca.scores.cols)),
      }
      if (request.needs.loadings) result.loadings = {
        components: Array.from({ length: pca.loadings.rows }, (_, row) =>
          pca.loadings.data.subarray(row * pca.loadings.cols, (row + 1) * pca.loadings.cols)),
      }
      if (pca.unresolved.some((value) => value !== 0)) warnings.push('Methods reports unresolved PCA components; interpret these coordinates with care.')
    }
  }
  signal.throwIfAborted()
  return result
}

ctx.onmessage = (ev: MessageEvent<InMsg>) => {
  void handle(ev.data)
}

async function handle(msg: InMsg): Promise<void> {
  if (msg.type === 'cancel') {
    controllers.get(msg.id)?.abort()
    return
  }
  const ctrl = new AbortController()
  controllers.set(msg.id, ctrl)
  const opts: RunOptions = {
    signal: ctrl.signal,
    onProgress: (progress) => ctx.postMessage({ type: 'progress', id: msg.id, progress }),
    allowFallback: msg.type === 'run' ? msg.allowFallback : undefined,
    robustnessEvidencePublicationHandoff: msg.type === 'run' ? msg.robustnessEvidencePublicationHandoff : undefined,
    robustnessEvidenceSidecar: msg.type === 'run' ? msg.robustnessEvidenceSidecar : undefined,
  }
  try {
    if (msg.type === 'preview') {
      const result = await preview(msg, ctrl.signal)
      ctx.postMessage({ type: 'preview-result', id: msg.id, datasetKey: msg.datasetKey, result })
    } else if (msg.type === 'run') {
      const result = await engine.run(msg.ds, msg.dsl, opts)
      ctx.postMessage({
        type: 'result',
        id: msg.id,
        result,
        rtResult: runResultToRtResultEnvelope(result, { allowFallback: msg.allowFallback === true }),
      })
    } else if (msg.type === 'export') {
      const result = await engine.exportModel(msg.model, { allowTrainingRows: msg.allowTrainingRows })
      ctx.postMessage({ type: 'result', id: msg.id, result })
    } else {
      const result = await engine.predict(msg.model, msg.Xnew, msg.nSamples, msg.nFeatures, msg.featureNames)
      ctx.postMessage({ type: 'result', id: msg.id, result })
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    // forward name so the client can rebuild an AbortError DOMException (App.tsx
    // suppresses those) rather than surfacing a cancel as a hard error; forward the
    // typed RtError (B-018) so a strict-mode refusal keeps its cause across the boundary.
    ctx.postMessage({ type: 'error', id: msg.id, ...(msg.type === 'preview' && { datasetKey: msg.datasetKey }), name: err.name, message: err.message, rtError: isRtErrorException(e) ? rtErrorToWire(e.rtError) : undefined })
  } finally {
    controllers.delete(msg.id)
  }
}
