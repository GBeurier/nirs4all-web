// Identity transport only. Group splitting and relation validation remain native.
import type { MaterializedDataset } from './types'

export const isRelationColumn = (name: string): boolean =>
  /^(group_id|origin_id|repetition_id|augmented)$/i.test(name)

export function metadataRelations(metadata: MaterializedDataset['metadata']): Pick<MaterializedDataset, 'groupIds' | 'originIds' | 'repetitionIds' | 'augmented'> {
  const column = (name: string) => metadata?.find((c) => c.name.toLowerCase() === name)
  const identity = (name: string) => column(name)?.values.map((v) => v === null || v === '' ? null : String(v))
  const augmented = column('augmented')?.values.map((v) => {
    if (v === 1 || v === '1' || v === 'true') return true
    if (v === null || v === 0 || v === '0' || v === 'false' || v === '') return false
    throw new Error('augmented must contain true/false or 1/0 values')
  })
  return { groupIds: identity('group_id'), originIds: identity('origin_id'), repetitionIds: identity('repetition_id'), augmented }
}

/** Metadata columns named `column`, including nirs4all-io's source-prefixed
 *  collision names (`<sourceId>__<column>`, e.g. `train_m__Sample_ID`). */
const columnsNamed = (ds: MaterializedDataset, column: string) =>
  ds.metadata?.filter((c) => c.name === column || c.name.endsWith(`__${column}`)) ?? []

/** Columns a user can declare as the repetition column: the sample-id column and
 *  every non-relation metadata column, io prefixes removed. */
export function repetitionCandidates(ds: MaterializedDataset): string[] {
  const names = (ds.metadata ?? []).filter((c) => !isRelationColumn(c.name)).map((c) => c.name.replace(/^.*__/, ''))
  return [...new Set([...(ds.sampleIdColumn ? [ds.sampleIdColumn] : []), ...names])]
}

/** Per-row value of the dataset's repetition column (nirs4all `repetition`). */
function repetitionValues(ds: MaterializedDataset): (string | null)[] | undefined {
  if (ds.repetition === undefined) return undefined
  if (ds.repetition === ds.sampleIdColumn) return ds.sampleIds
  const columns = columnsNamed(ds, ds.repetition)
  if (!columns.length) throw new Error(`Repetition column not found in the dataset metadata: ${ds.repetition}`)
  return ds.sampleIds.map((_, i) => {
    const value = columns.map((c) => c.values[i]).find((v) => v !== null && v !== '')
    return value === undefined ? null : String(value)
  })
}

/**
 * CV groups: declared group_id joined with the repetition column, as connected
 * components (nirs4all `compute_effective_groups`). Repetitions are scoped per
 * partition — CV only splits Train, and cal/val files may reuse a sample code —
 * so a repetition never makes a group cross Train/Test. An augmentation joins
 * its origin; a row with no repetition value only constrains through those.
 */
function effectiveGroups(ds: MaterializedDataset): (string | null)[] | undefined {
  const reps = repetitionValues(ds)
  if (!reps) return ds.groupIds
  const parent = ds.sampleIds.map((_, i) => i)
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const firstRow = new Map<string, number>()
  const link = (key: string, i: number) => {
    const first = firstRow.get(key)
    if (first === undefined) firstRow.set(key, i)
    else parent[root(i)] = root(first)
  }
  const rowOf = new Map<string, number>()
  ds.sampleIds.forEach((id, i) => rowOf.has(id) || rowOf.set(id, i))
  for (let i = 0; i < ds.nSamples; i++) {
    // the physical-sample key is partition-scoped, as in nirs4all-preflight
    if (reps[i] !== null) link(JSON.stringify(['repetition', ds.partitions[i], reps[i]]), i)
    const group = ds.groupIds?.[i]
    if (group != null) link(JSON.stringify(['group', group]), i)
    // an augmentation stays with its origin
    const origin = ds.originIds?.[i]
    const originRow = origin == null ? undefined : rowOf.get(origin)
    if (originRow !== undefined) parent[root(i)] = root(originRow)
  }
  return parent.map((_, i) => (ds.groupIds && ds.groupIds[i] == null && reps[i] === null ? null : `component-${root(i)}`))
}

/** Does CV group by declared groups or a repetition column? */
export const hasCvGroups = (ds: MaterializedDataset): boolean => ds.groupIds !== undefined || ds.repetition !== undefined

export function datasetRelations(ds: MaterializedDataset) {
  if (ds.sampleIds.some((id) => typeof id !== 'string' || id.length === 0 || id.includes('\0'))) throw new Error('Sample identities must be nonempty strings without NUL')
  if (ds.augmented?.some((value) => typeof value !== 'boolean')) throw new Error('Augmentation flags must be explicit booleans')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds]) {
    if (values?.some((value) => value !== null && (typeof value !== 'string' || value.length === 0 || value.includes('\0')))) throw new Error('Relation identities must be nonempty strings or null')
  }
  // Sample identities may repeat (replicate scans); the row identity s{i} is the
  // observation and sample identity, so uniqueness is only required of rows.
  if (ds.sampleIds.length !== ds.nSamples) throw new Error('Sample identities must be aligned with rows')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds, ds.augmented]) {
    if (values && values.length !== ds.nSamples) throw new Error('Relation column is not aligned with dataset rows')
  }
  const groupOf = effectiveGroups(ds)
  const groups = [...new Set(groupOf?.filter((v): v is string => v !== null) ?? [])].sort()
  const reps = [...new Set(ds.repetitionIds?.filter((v): v is string => v !== null) ?? [])].sort()
  const sampleAt = new Map<string, number>()
  const repeated = new Set<string>()
  ds.sampleIds.forEach((id, i) => (sampleAt.has(id) ? repeated.add(id) : sampleAt.set(id, i)))
  return ds.sampleIds.map((id, i) => {
    const origin = ds.originIds?.[i] ?? null
    const originRow = origin === null ? undefined : sampleAt.get(origin)
    if (origin !== null && originRow === undefined) throw new Error(`Origin ${origin} is not a dataset observation`)
    if (origin !== null && repeated.has(origin)) throw new Error(`Origin ${origin} names several observations`)
    if (Boolean(ds.augmented?.[i]) !== (origin !== null)) throw new Error('An origin requires an explicitly augmented observation, and every augmented observation needs an origin')
    if (originRow !== undefined && ds.groupIds && ds.groupIds[i] !== ds.groupIds[originRow]) throw new Error('An augmented observation and its origin must belong to the same group')
    return {
      observation_id: `s${i}`, sample_id: `s${i}`, source_id: 'nir', target_id: 'y',
      group_id: groupOf?.[i] == null ? null : `g${groups.indexOf(groupOf[i]!)}`,
      origin_id: originRow === undefined ? null : `s${originRow}`,
      repetition_id: ds.repetitionIds?.[i] == null ? null : `r${reps.indexOf(ds.repetitionIds[i]!)}`,
      // A row without a target is excluded natively: training views drop it,
      // validation/predict views keep it (dag-ml-data `include_excluded`).
      augmented: ds.augmented?.[i] ?? false, excluded: !Number.isFinite(ds.y[i]),
      metadata: { original_sample_id: id, ...(ds.groupIds ? { original_group_id: ds.groupIds[i] } : {}), ...(ds.originIds ? { original_origin_id: origin } : {}), ...(ds.repetitionIds ? { original_repetition_id: ds.repetitionIds[i] } : {}) },
    }
  })
}
