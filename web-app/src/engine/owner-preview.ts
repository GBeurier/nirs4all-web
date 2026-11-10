import { nodeByType } from '@/catalog/nodes'
import { loadDagMlWasm, loadMethodsWasm } from './nirs4all-core'
import { buildNativeFolds, expandFoldRows } from './grouped-cv'
import { physicalIdentity } from './relations'
import { trainRowsOf } from './partition'
import type { OwnerPreviewOptions } from './preview-options'
import type { PlaygroundResult, PlaygroundRunRequest, StepOutcome } from 'nirs4all-ui/playground'
import type { Matrix, NativeEstimator, ParamValue, Transformer } from './wasm/methods/index.js'
import type { MaterializedDataset } from './types'

export interface OwnerPreviewMessage {
  type: 'preview'
  id: string
  datasetKey: string
  ds: MaterializedDataset
  request: PlaygroundRunRequest
  options?: OwnerPreviewOptions
}

/** Exploration only: native transformers and centred PCA, never run()/score. */
export async function runOwnerPreview(msg: OwnerPreviewMessage, signal: AbortSignal): Promise<PlaygroundResult> {
  const { ds, request } = msg
  if (msg.id !== request.id || msg.datasetKey !== request.datasetId) throw new Error('Preview dataset/request mismatch.')
  const methods = await loadMethodsWasm()
  signal.throwIfAborted()
  let X: Matrix = { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
  const steps: StepOutcome[] = []
  const trainFit = msg.options?.fitScope === 'train'
  const fitMessage = trainFit
    ? 'Preprocessing is fitted on labelled train rows (all labelled non-predict rows when no train partition exists), then applied to all displayed rows.'
    : 'Preprocessing is fitted on all displayed rows.'
  const warnings = [`${fitMessage} Centred PCA uses all displayed rows; exploration only, no model is trained or scored.`]
  const fitRows = trainFit ? trainRowsOf(ds) : null
  const fitMatrix = (matrix: Matrix): Matrix => {
    if (!fitRows) return matrix
    if (!fitRows.length) throw new Error('Preprocessing preview requires labelled rows in the training cohort; missing-target and predict-only rows are excluded.')
    const data = new Float64Array(fitRows.length * matrix.cols)
    fitRows.forEach((row, i) => data.set(matrix.data.subarray(row * matrix.cols, (row + 1) * matrix.cols), i * matrix.cols))
    return { data, rows: fitRows.length, cols: matrix.cols }
  }
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
      estimator.fit(fitMatrix(X), undefined, node.native.inputs.axis !== 'none' ? { axis: ds.axis } : {})
      const transformed = estimator.transform(X)
      // No invented axis for a changed feature basis/width.
      if (transformed.rows !== X.rows || transformed.cols !== ds.nFeatures) {
        throw new Error(`Preview operator ${step.operatorId} changes the row/axis shape; unavailable in Web.`)
      }
      X = transformed
      steps.push({ stepId: step.id, status: 'ok', shape: [X.rows, X.cols], message: `Native Methods transform. ${fitMessage} Exploration only.` })
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
  if (request.needs.folds && msg.options?.folds) {
    try {
      const dagml = await loadDagMlWasm()
      signal.throwIfAborted()
      const identity = physicalIdentity(ds)
      const native = buildNativeFolds(dagml, ds, msg.options.folds, trainRowsOf(ds))
      result.folds = {
        splitter: 'DAG-ML native CV (physical samples and declared groups)', kind: 'cv',
        folds: native.folds.map((fold, index) => ({
          label: `Fold ${index + 1}`,
          train: expandFoldRows(identity, fold.train_sample_ids, 'train', ds),
          test: expandFoldRows(identity, fold.validation_sample_ids, 'validation', ds),
        })),
      }
      warnings.push(`Preview folds are generated by DAG-ML on the run's labelled training cohort (non-predict fallback when no train partition exists), physical samples and declared groups; ${msg.options.folds.folds} folds, seed ${msg.options.folds.seed}, strategy ${msg.options.folds.strategy ?? 'auto'}. Rows outside that cohort are not in CV. They match a run only with the same CV configuration.`)
    } catch (error) {
      signal.throwIfAborted()
      warnings.push(`DAG-ML preview folds refused: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else if (request.needs.folds) warnings.push('Preview folds require an explicit host CV configuration; configure CV in the pipeline editor.')
  if (request.needs.folds && ds.folds?.length) warnings.push('Dataset-declared folds are not used by Web CV; this preview uses the same native CV configuration as the Web run.')
  if (request.needs.repetitions) warnings.push('Repetition distances are unavailable in Web.')
  if (request.needs.projection === 'pca' || request.needs.loadings) {
    // DatasetView has always projected raw X; partition filters affect drawing only.
    const projectionX = msg.options?.profile === 'dataset-view' ? { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures } : X
    const components = Math.min(request.needs.components, projectionX.rows - 1, projectionX.cols)
    if (components < 1) warnings.push('PCA is unavailable in Web for fewer than two displayed rows or no features.')
    else {
      const pca = methods.preflightPca(projectionX, components)
      warnings.push(`PCA computed by Methods (preflightPca), centred on all displayed ${msg.options?.profile === 'dataset-view' ? 'raw' : 'preview'} rows; exploration only.`)
      // Display fractions use the owner's eigenvalues and full covariance trace.
      const explained = Array.from(pca.eigenvalues, (value, index) => pca.unresolved[index] !== 0 || !(pca.fullMoments[0] > 0) ? NaN : value / pca.fullMoments[0])
      if (request.needs.projection === 'pca') result.projection = {
        method: 'pca',
        explained,
        coordinates: rows.map((row) => pca.scores.data.subarray(row * pca.scores.cols, (row + 1) * pca.scores.cols)),
      }
      if (request.needs.loadings) result.loadings = {
        explained,
        components: Array.from({ length: pca.loadings.rows }, (_, row) =>
          pca.loadings.data.subarray(row * pca.loadings.cols, (row + 1) * pca.loadings.cols)),
      }
      const unresolved = Array.from(pca.unresolved).flatMap((value, index) => value !== 0 ? [`PC${index + 1}`] : [])
      if (unresolved.length) warnings.push(`Methods reports unresolved PCA components: ${unresolved.join(', ')}. Their explained variance is unavailable, never zero percent.`)
    }
  }
  signal.throwIfAborted()
  return result
}
