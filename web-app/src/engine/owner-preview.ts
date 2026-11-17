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
  // Missing spectral values (NaN under the owner mask) never reach Methods: the preview runs on the
  // rows with complete spectra and says which rows it left out. The dataset itself is unchanged.
  // An infinite value is not a missing value: it reaches the owner, which refuses it.
  const rows: number[] = []
  for (let row = 0; row < ds.nSamples; row++) {
    let complete = true
    for (let j = 0; j < ds.nFeatures && complete; j++) complete = !Number.isNaN(ds.X[row * ds.nFeatures + j])
    if (complete) rows.push(row)
  }
  const omitted = ds.nSamples - rows.length
  if (omitted && !rows.length) throw new Error(`Every sample has a missing spectral value: this preview needs at least one complete spectrum. The dataset is unchanged; a run can replace the missing values instead (run settings).`)
  const outputRow = new Map(rows.map((row, index) => [row, index]))
  const takeRows = (picked: readonly number[]): Matrix => {
    const data = new Float64Array(picked.length * ds.nFeatures)
    picked.forEach((row, i) => data.set(ds.X.subarray(row * ds.nFeatures, (row + 1) * ds.nFeatures), i * ds.nFeatures))
    return { data, rows: picked.length, cols: ds.nFeatures }
  }
  const raw: Matrix = omitted ? takeRows(rows) : { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
  let X: Matrix = raw
  const steps: StepOutcome[] = []
  const trainFit = msg.options?.fitScope === 'train'
  const fitMessage = trainFit
    ? 'Preprocessing is fitted on labelled train rows (all labelled non-predict rows when no train partition exists), then applied to all displayed rows.'
    : 'Preprocessing is fitted on all displayed rows.'
  const warnings = [`${fitMessage} Centred PCA uses all displayed rows; exploration only, no model is trained or scored.`]
  if (omitted) warnings.push(`${omitted} sample${omitted === 1 ? '' : 's'} left out: missing values. This preview (preprocessing, PCA and folds) is computed on the ${rows.length} of ${ds.nSamples} samples with complete spectra; the dataset is unchanged.`)
  // fit rows as output rows of the preview (the training cohort restricted to complete spectra)
  const fitRows = trainFit ? trainRowsOf(ds).flatMap((row) => outputRow.get(row) ?? []) : null
  const fitMatrix = (matrix: Matrix): Matrix => {
    if (!fitRows) return matrix
    if (!fitRows.length) throw new Error(`Preprocessing preview needs rows of the training cohort with a value for “${ds.targetName}” and complete spectra; there are none. Choose another target to show, or view the raw spectra.`)
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
  // output rows of the preview, each mapped to its dataset row by `rows`
  const outputs = Array.from({ length: X.rows }, (_, index) => index)
  const result: PlaygroundResult = {
    requestId: request.id,
    rows,
    spectra: outputs.map((index) => X.data.subarray(index * X.cols, (index + 1) * X.cols)),
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
        // dataset rows of each fold as output rows of the preview (rows it left out are not drawn)
        folds: native.folds.map((fold, index) => ({
          label: `Fold ${index + 1}`,
          train: expandFoldRows(identity, fold.train_sample_ids, 'train', ds).flatMap((row) => outputRow.get(row) ?? []),
          test: expandFoldRows(identity, fold.validation_sample_ids, 'validation', ds).flatMap((row) => outputRow.get(row) ?? []),
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
    const projectionX = msg.options?.profile === 'dataset-view' ? raw : X
    const components = Math.min(request.needs.components, projectionX.rows - 1, projectionX.cols)
    if (components < 1) warnings.push('PCA is unavailable in Web for fewer than two displayed rows or no features.')
    else {
      const pca = methods.preflightPca(projectionX, components)
      warnings.push(`PCA computed by Methods, centred on all displayed ${msg.options?.profile === 'dataset-view' ? 'raw' : 'preview'} rows; exploration only.`)
      // Display fractions use the owner's eigenvalues and full covariance trace.
      const explained = Array.from(pca.eigenvalues, (value, index) => pca.unresolved[index] !== 0 || !(pca.fullMoments[0] > 0) ? NaN : value / pca.fullMoments[0])
      if (request.needs.projection === 'pca') result.projection = {
        method: 'pca',
        explained,
        coordinates: outputs.map((index) => pca.scores.data.subarray(index * pca.scores.cols, (index + 1) * pca.scores.cols)),
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
