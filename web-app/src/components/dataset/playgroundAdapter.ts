import type { OperatorDefinition, PlaygroundDataset } from 'nirs4all-ui/playground'
import type { RowColumn } from 'nirs4all-ui/workbench'
import { PREPROCESSING_NODES } from '@/catalog/nodes'
import type { MaterializedDataset } from '@/engine/types'

// App replaces this immutable projection for every load/configuration edit.
// Identity includes target, task, partitions and repetition without hashing X.
const datasetKeys = new WeakMap<MaterializedDataset, string>()
let nextDatasetKey = 0

export function playgroundDatasetKey(ds: MaterializedDataset): string {
  let key = datasetKeys.get(ds)
  if (!key) {
    key = `web-dataset-${++nextDatasetKey}`
    datasetKeys.set(ds, key)
  }
  return key
}

/** Display views share the host's Float64 rows; no spectral values are copied. */
export function playgroundDataset(ds: MaterializedDataset, name: string): PlaygroundDataset {
  const categorical = (key: string, label: string, values: RowColumn['values']): RowColumn => ({
    key, label, kind: 'categorical', values,
  })
  const metadata: RowColumn[] = (ds.metadata ?? []).map((column) =>
    categorical(`metadata:${column.name}`, column.name, column.values))
  if (ds.groupIds) metadata.push(categorical('role:group', 'Group', ds.groupIds))
  if (ds.originIds) metadata.push(categorical('role:origin', 'Origin', ds.originIds))
  const repetition = ds.repetitionIds
    ?? ds.metadata?.find((column) => column.name === ds.repetition)?.values
    ?? (ds.repetition && ds.repetition === ds.sampleIdColumn ? ds.sampleIds : undefined)
  if (repetition) metadata.push(categorical('role:repetition', ds.repetition ?? 'Repetition', repetition))
  const classification = ds.taskType !== 'regression'
  const classes = classification ? [...new Set(ds.classes ?? [])].filter((label) => label !== '').sort() : undefined
  return {
    id: playgroundDatasetKey(ds),
    name,
    spectra: Array.from({ length: ds.nSamples }, (_, row) => ds.X.subarray(row * ds.nFeatures, (row + 1) * ds.nFeatures)),
    wavelengths: ds.axis,
    unit: ds.axisUnit,
    sampleIds: ds.sampleIds,
    partition: ds.partitions,
    targets: [{
      name: ds.targetName,
      kind: classification ? 'classification' : 'regression',
      values: Array.from(ds.y, (value, row) => Number.isFinite(value)
        ? classification ? ds.classes?.[row] ?? classes?.[value] ?? null : value
        : null),
      ...(classes && { classes }),
    }],
    metadata,
    ...(repetition && { groupColumn: 'role:repetition' }),
    description: ds.axisUnit === 'index'
      ? 'Feature index (positional axis; no physical wavelength unit was supplied).'
      : `Spectral axis in ${ds.axisUnit}.`,
  }
}

/** First preview profile: unsupervised, native, shape-preserving transformers. */
export const PLAYGROUND_OPERATORS: readonly OperatorDefinition[] = PREPROCESSING_NODES
  .filter((node) => node.type.startsWith('n4m:') && node.native?.role === 'transformer'
    && node.native.inputs.y !== 'required' && node.native.inputs.labels !== 'required'
    && node.params.every((param) => param.type !== 'array'))
  .map((node): OperatorDefinition => ({
    id: node.type,
    name: node.name,
    kind: 'preprocessing',
    category: node.subcategory,
    description: node.description,
    params: node.params.map((param) => ({ ...param, type: param.type === 'array' ? 'string' : param.type })),
  }))

/** Resolve selected observation rows without collapsing repeated sample IDs. */
export function playgroundSelectionIds(ds: MaterializedDataset, rows: readonly number[]): string[] {
  return rows.map((row) => ds.sampleIds[row])
}
