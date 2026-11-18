// Target projection and run-scoped missing-value selection over a dataset nirs4all-io assembled.
// A dataset keeps EVERY owner target column (`MaterializedDataset.targets`) and every missing cell
// the owner reports; nothing is dropped at load. One target is projected onto `y` for the views
// and for a run. When the spectra hold missing values a run removes the affected samples from ITS
// OWN view, uses the spectra nirs4all-io replaced, or keeps them, on the user's explicit launch
// choice. No value is parsed, imputed or computed here: rows are selected on the owner's values and
// masks only.
import type { DatasetTarget, MaterializedDataset, MissingSpectraChoice, MissingValuePolicy, RunDataSelection, TaskType } from '@/engine/types'
import { inferTaskType } from './dataset'

/** The default task of a target: an owner text-label column is a classification target; a numeric
 *  column follows the shared numeric heuristic (`inferTaskType`). */
export function inferTargetTask(target: DatasetTarget): TaskType {
  if (target.kind === 'classification_string') {
    return new Set(target.labels?.filter((label) => label !== '')).size <= 2 ? 'binary' : 'multiclass'
  }
  return inferTaskType(Array.from(target.values), undefined)
}

/** Project one owner target onto the engine's single-target view for a task type. A missing value
 *  is never a class (y NaN, class ''). A text-label column has no numeric value: asked as a
 *  regression target it is all-missing, and the engine refuses to train on it. */
export function projectTarget(target: DatasetTarget, task: TaskType): Pick<MaterializedDataset, 'y' | 'yRaw' | 'labelsRaw' | 'classes'> {
  const text = target.kind === 'classification_string'
  const labelsRaw = text ? [...(target.labels ?? [])] : Array.from(target.values, (v) => (Number.isFinite(v) ? String(v) : ''))
  const yRaw = Float64Array.from(target.values)
  if (task === 'regression') return { y: Float64Array.from(target.values), yRaw, labelsRaw, classes: undefined }
  const classes = text ? labelsRaw : Array.from(target.values, (v) => (Number.isFinite(v) ? String(Math.round(v)) : ''))
  const vocab = [...new Set(classes)].filter((label) => label !== '').sort()
  const index = new Map(vocab.map((label, i) => [label, i]))
  return { y: Float64Array.from(classes, (label) => index.get(label) ?? NaN), yRaw, labelsRaw, classes }
}

/** The dataset's targets by name (a dataset that did not come from io has only its projected one). */
export const targetNames = (ds: MaterializedDataset): string[] => ds.targets?.map((target) => target.name) ?? [ds.targetName]

/** Make `name` the projected target. The other targets, the spectra and every row stay as they are. */
export function selectDatasetTarget(ds: MaterializedDataset, name: string): MaterializedDataset {
  const target = ds.targets?.find((candidate) => candidate.name === name)
  if (!target) {
    if (!ds.targets && name === ds.targetName) return ds
    throw new Error(`"${name}" is not a target of this dataset (${targetNames(ds).join(', ')}).`)
  }
  const taskType = target.taskType ?? inferTargetTask(target)
  return { ...ds, ...projectTarget(target, taskType), targetName: name, taskType }
}

/** Record the user's task type for the projected target and re-project it. */
export function setTargetTask(ds: MaterializedDataset, task: TaskType): MaterializedDataset {
  if (!ds.targets?.some((target) => target.name === ds.targetName)) return ds
  const targets = ds.targets.map((target) => (target.name === ds.targetName ? { ...target, taskType: task } : target))
  return selectDatasetTarget({ ...ds, targets }, ds.targetName)
}

/** Rename the projected target (display name); refused when another target already has that name. */
export function renameTarget(ds: MaterializedDataset, name: string): MaterializedDataset {
  if (name === ds.targetName) return ds
  if (ds.targets?.some((target) => target.name === name)) throw new Error(`Another target is already named "${name}".`)
  return { ...ds, targetName: name, ...(ds.targets ? { targets: ds.targets.map((target) => (target.name === ds.targetName ? { ...target, name } : target)) } : {}) }
}

/** Distinct non-numeric labels of a text-label target whose other labels are numbers: the cells that
 *  made nirs4all-io read a numeric-looking column as text (for a hint; nothing is re-read). */
export function textLabelsAmongNumbers(target: DatasetTarget): string[] {
  if (target.kind !== 'classification_string' || !target.labels) return []
  const distinct = [...new Set(target.labels.filter((label) => label !== ''))]
  const text = distinct.filter((label) => Number.isNaN(Number(label)))
  return text.length > 0 && text.length < distinct.length && text.length <= 5 ? text : []
}

// --- run-scoped selection ---------------------------------------------------------------------

/** The launch choices of a run: target, missing-target strategy and, when the spectra hold missing
 *  values, what to do with them (`null`/absent: not chosen yet — the run does not start). */
export interface RunSelection extends Pick<RunDataSelection, 'target' | 'missingValues'> { missingSpectra?: MissingSpectraChoice | null }
export type { MissingSpectraChoice, MissingValuePolicy }

interface Incomplete { rows: boolean[]; columns: boolean[]; nRows: number; nColumns: number; cells: number }
const incompleteCache = new WeakMap<Float64Array, Incomplete>()
/** Rows and columns of X with a missing cell (NaN under the owner mask; an infinite value is not a
 *  missing value and is left to the engine's own refusal). Cached per X buffer: X is never mutated. */
function incompleteOf(ds: MaterializedDataset): Incomplete {
  const cached = incompleteCache.get(ds.X)
  if (cached) return cached
  const rows = new Array<boolean>(ds.nSamples).fill(false)
  const columns = new Array<boolean>(ds.nFeatures).fill(false)
  let cells = 0
  for (let i = 0; i < ds.nSamples; i++) {
    for (let j = 0; j < ds.nFeatures; j++) {
      if (Number.isNaN(ds.X[i * ds.nFeatures + j])) { rows[i] = columns[j] = true; cells++ }
    }
  }
  const found = { rows, columns, nRows: rows.filter(Boolean).length, nColumns: columns.filter(Boolean).length, cells }
  incompleteCache.set(ds.X, found)
  return found
}

/** Rows with a missing spectral value (true = incomplete), aligned with the dataset rows. */
export const incompleteRows = (ds: MaterializedDataset): boolean[] => incompleteOf(ds).rows

const pick = <T,>(values: readonly T[], keep: readonly boolean[]): T[] => values.filter((_, i) => keep[i])
const pickFloat = (values: Float64Array, keep: readonly boolean[]): Float64Array => Float64Array.from(Array.from(values).filter((_, i) => keep[i]))

/** The dataset restricted to the kept rows: every row-aligned field follows; nothing else changes. */
function keepRows(ds: MaterializedDataset, keep: readonly boolean[]): MaterializedDataset {
  const nSamples = keep.filter(Boolean).length
  const X = new Float64Array(nSamples * ds.nFeatures)
  let row = 0
  for (let i = 0; i < ds.nSamples; i++) {
    if (keep[i]) X.set(ds.X.subarray(i * ds.nFeatures, (i + 1) * ds.nFeatures), row++ * ds.nFeatures)
  }
  const optional = <T,>(values: T[] | undefined): T[] | undefined => (values ? pick(values, keep) : undefined)
  const next: MaterializedDataset = {
    ...ds, X, nSamples, y: pickFloat(ds.y, keep), sampleIds: pick(ds.sampleIds, keep), partitions: pick(ds.partitions, keep),
  }
  if (ds.yRaw) next.yRaw = pickFloat(ds.yRaw, keep)
  for (const field of ['labelsRaw', 'classes', 'partitionNames'] as const) if (ds[field]) next[field] = optional(ds[field])
  for (const field of ['groupIds', 'originIds', 'repetitionIds', 'observationIds'] as const) if (ds[field]) next[field] = optional(ds[field])
  if (ds.augmented) next.augmented = optional(ds.augmented)
  if (ds.metadata) next.metadata = ds.metadata.map((column) => ({ ...column, values: pick(column.values, keep) }))
  if (ds.targets) {
    next.targets = ds.targets.map((target) => {
      const values = pickFloat(target.values, keep)
      const labels = target.labels ? pick(target.labels, keep) : undefined
      const missing = labels ? labels.filter((label) => label === '').length : Array.from(values).filter((v) => !Number.isFinite(v)).length
      return { ...target, values, ...(labels ? { labels } : {}), missing }
    })
  }
  return next
}

const labelled = (ds: MaterializedDataset, target: DatasetTarget | undefined, row: number): boolean =>
  target ? (target.labels ? target.labels[row] !== '' : Number.isFinite(target.values[row])) : Number.isFinite(ds.y[row])

/** What a run with this selection uses and leaves out, without building its view. */
export function runSelectionEffect(ds: MaterializedDataset, selection: RunSelection): RunDataSelection {
  const target = ds.targets?.find((candidate) => candidate.name === selection.target)
  const incomplete = incompleteOf(ds)
  const choice = incomplete.cells ? selection.missingSpectra ?? undefined : undefined
  const dropRows = choice?.action === 'remove_samples'
  // the engine fits on the train partition only: held-out test rows are never fitted on
  let missingTargets = 0
  let train = 0
  let test = 0
  let excludedSamples = 0
  for (let i = 0; i < ds.nSamples; i++) {
    if (dropRows && incomplete.rows[i]) { excludedSamples++; continue }
    if (ds.partitions[i] === 'predict') continue
    if (!labelled(ds, target, i)) { missingTargets++; continue }
    if (ds.partitions[i] === 'test') test++
    if (ds.partitions[i] === 'train') train++
  }
  return {
    target: selection.target, missingValues: selection.missingValues, ...(choice ? { missingSpectra: choice } : {}),
    missingTargets, train, test, excludedSamples,
    missingCells: incomplete.cells, incompleteSamples: incomplete.nRows,
    replacedCells: choice?.action === 'replace' ? incomplete.cells : 0,
  }
}

/** Why a run that left missing spectral values as they are was refused (null for any other run): the
 *  owner's refusal names a non-finite cell, not the launch choice that sent it. */
export function keptMissingSpectraNotice(effect: RunDataSelection): string | null {
  if (effect.missingSpectra?.action !== 'keep') return null
  return `This run left the ${effect.missingCells} missing spectral value${effect.missingCells === 1 ? '' : 's'} as ${effect.missingCells === 1 ? 'it is' : 'they are'} (run settings). The execution path accepts only finite spectral values — dag-ml-data checks every cell before any pipeline step — so no step of this pipeline could handle them. Choose “Remove” or “Replace” in the run settings to run this pipeline.`
}

/**
 * The view of the dataset a run executes on: the launch target projected onto `y`, and — only when
 * the spectra hold missing values — what the user chose for them: the affected samples removed, the
 * values replaced (`replaced`: the spectra nirs4all-io assembled under its `replace` policy, see
 * `replaceMissingSpectra` in `data/wasm-io.ts`; no value is computed here), or left as they are for
 * the pipeline. Without a choice the run does not start: nothing is applied by default.
 * Rows without a value for the target stay in the view: the engine excludes them from fitting and
 * scoring through the owner relations (dag-ml-data `excluded`, dag-ml `target_missing_sample_ids`),
 * unless the missing-target strategy is to stop. The loaded dataset is never modified.
 */
export function prepareRunDataset(ds: MaterializedDataset, selection: RunSelection, replaced?: Float64Array): { dataset: MaterializedDataset; effect: RunDataSelection } {
  const effect = runSelectionEffect(ds, selection)
  if (effect.missingCells && !effect.missingSpectra) {
    throw new Error(`The spectra hold ${effect.missingCells} missing value${effect.missingCells === 1 ? '' : 's'} in ${effect.incompleteSamples} sample${effect.incompleteSamples === 1 ? '' : 's'}. Choose in the run settings what this run does with them: remove the affected samples, replace the missing values, or leave them as they are.`)
  }
  if (selection.missingValues === 'refuse' && effect.missingTargets) {
    throw new Error(`This run is set to stop on missing target values: ${effect.missingTargets} train/test sample${effect.missingTargets === 1 ? ' has' : 's have'} no value for "${selection.target}". Choose to leave them out in the run settings to run without them.`)
  }
  let view = ds
  const incomplete = incompleteOf(ds)
  if (effect.excludedSamples) view = keepRows(view, incomplete.rows.map((missing) => !missing))
  if (effect.missingSpectra?.action === 'replace') {
    if (!replaced || replaced.length !== ds.X.length) throw new Error('The replaced spectra from nirs4all-io are required to run with replaced missing values.')
    const remaining = replaced.reduce((count, value) => count + (Number.isNaN(value) ? 1 : 0), 0)
    if (remaining) {
      const method = effect.missingSpectra.method
      const edge = method === 'forward_fill' ? ' (no earlier value in their spectrum)' : method === 'backward_fill' ? ' (no later value in their spectrum)' : ''
      throw new Error(`${remaining} of the ${effect.missingCells} missing spectral values could not be replaced by nirs4all-io${edge}. Choose another replacement method, or remove the affected samples.`)
    }
    view = { ...view, X: replaced }
  }
  view = selectDatasetTarget(view, selection.target)
  if (view.targets || view.missingFeatures) {
    // the run view is a single-target projection: the engine worker does not need the other targets
    const { targets: _targets, missingFeatures: _missing, ...projection } = view
    view = projection
  }
  return { dataset: view, effect }
}
