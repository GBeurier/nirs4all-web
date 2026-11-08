// Identity transport only. Group splitting and relation validation remain native.
import { hasTarget } from './partition'
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

/**
 * Formal physical-sample identity of a dataset, as DAG-ML/dag-ml-data execution handles.
 *
 * `s{i}` addresses row `i` (the DMD observation) and `p{k}` the k-th distinct physical sample
 * in first-seen row order (the DMD sample). Neither handle is a scientific identifier: the
 * original ids stay in `ds.sampleIds`/`ds.observationIds` and in the relation metadata.
 */
export interface PhysicalIdentity {
  /** per row: physical-sample handle `p{k}` */
  sampleHandle: string[]
  /** per row: observation (execution row) handle `s{i}` */
  observationHandle: string[]
  /** physical-sample handle -> its rows, in dataset order */
  rowsOf: ReadonlyMap<string, readonly number[]>
  /** distinct physical-sample handles in first-seen order (DMD schema sample_ids) */
  handles: readonly string[]
  /** `positional`: explicit independent-row profile (every row its own sample, no external id) */
  basis: 'declared' | 'positional'
  /** some non-augmented physical sample has more than one observation */
  repeated: boolean
  /** declared training/held-out sample ids reused by predict-only rows (separate, never scored) */
  predictReuse: string[]
  /** what keys a physical sample: a declared repetition column, the declared sample id, or the row */
  physicalKey: 'repetition' | 'sample_id' | 'row'
  /** per row: the original label naming its physical sample (null: the row is its own sample) */
  physicalLabel: (string | null)[]
}

/**
 * Builds the physical-sample handles and enforces the owner identity constraints:
 * one declared physical sample never spans Train and a held-out Test partition (R1, no
 * partition-prefix detachment), and its target is one sample-level value (R2, the dag-ml-data
 * target grain: one value per sample, or missing for every scan). Predict-only rows are a
 * separate never-scored replay cohort; a reused id there is labelled, not refused.
 *
 * The physical sample of a scan is, in order: a declared repetition column value (nirs4all
 * `repetition`: the column naming the physical sample of each spectrum, e.g. a metadata
 * Sample_ID that io kept positional), else the io-declared sample id, else the row itself
 * (explicit independent-row profile). No key is inferred from column names. A declared
 * repetition column supersedes the sample id: an ACTIVE scan (non-augmented Train/Test with a
 * target) with an empty repetition value is refused (E1) — it is never re-keyed by its sample
 * id or row, which would mix physical-sample and unknown-identity units in one run. Inactive
 * scans (target-missing, predict-only, augmented) with an empty value stay their own row unit.
 */
export function physicalIdentity(ds: MaterializedDataset): PhysicalIdentity {
  if (ds.sampleIds.length !== ds.nSamples || ds.partitions.length !== ds.nSamples) throw new Error('Sample identities must be aligned with rows')
  const basis = ds.identity?.basis === 'positional' ? 'positional' : 'declared'
  const reps = repetitionValues(ds)
  if (reps) {
    const active = (i: number) => !ds.augmented?.[i] && (ds.partitions[i] === 'train' || ds.partitions[i] === 'test') && hasTarget(ds, i)
    const empty = reps.flatMap((value, i) => (value === null && active(i) ? [i] : []))
    if (empty.length) {
      const partitions = [...new Set(empty.map((i) => ds.partitionNames?.[i] ?? ds.partitions[i]))].join(', ')
      throw new Error(`The declared repetition column "${ds.repetition}" is empty on ${empty.length} scan(s) that are fitted or scored (Train/Test with a target), in ${partitions}; first: ${empty.slice(0, 3).map((i) => ds.sampleIds[i]).join(', ')}. Every such scan needs its physical sample: fill the column, or remove the repetition declaration.`)
    }
  }
  // The original label naming a scan's physical sample (null: the row is its own unit).
  const labelOf = (i: number): string | null => (reps ? reps[i] : basis === 'declared' ? ds.sampleIds[i] : null)
  const keyOf = (i: number): string => {
    if (ds.augmented?.[i]) return JSON.stringify(['augmented', i])
    const label = labelOf(i)
    if (label === null) return JSON.stringify(['row', i])
    return JSON.stringify([ds.partitions[i] === 'predict' ? 'predict' : 'scored', reps ? 'repetition' : 'sample', label])
  }
  const nameOf = (i: number) => labelOf(i) ?? ds.sampleIds[i]
  const index = new Map<string, number>()
  const sampleHandle: string[] = []
  const rowsOf = new Map<string, number[]>()
  for (let i = 0; i < ds.nSamples; i++) {
    const key = keyOf(i)
    let k = index.get(key)
    if (k === undefined) index.set(key, (k = index.size))
    const handle = `p${k}`
    sampleHandle.push(handle)
    const rows = rowsOf.get(handle)
    if (rows) rows.push(i)
    else rowsOf.set(handle, [i])
  }
  const partitionName = (i: number) => ds.partitionNames?.[i] ?? ds.partitions[i]
  const names = (rows: number[], role: string) => [...new Set(rows.filter((i) => ds.partitions[i] === role).map(partitionName))].join(', ')
  for (const [, rows] of rowsOf) {
    // R1: a physical sample is trained on or held out, never both.
    if (rows.some((i) => ds.partitions[i] === 'train') && rows.some((i) => ds.partitions[i] === 'test')) {
      throw new Error(`Physical sample "${nameOf(rows[0])}" has scans in Train (${names(rows, 'train')}) and in the held-out Test partition (${names(rows, 'test')}). One physical sample cannot be both trained on and evaluated; fix the partition assignment or the sample ids in the dataset spec.`)
    }
    // R2: dag-ml-data holds one target value per sample; Web never picks one scan's value.
    const first = ds.y[rows[0]]
    if (rows.some((i) => !(Number.isFinite(first) ? ds.y[i] === first : !Number.isFinite(ds.y[i])))) {
      throw new Error(`Physical sample "${nameOf(rows[0])}" has different targets on its scans. dag-ml-data scores one target per physical sample (observation-level targets are not a supported target grain); declare one reference value per sample or distinct sample ids.`)
    }
  }
  const labelled = (keep: (i: number) => boolean) => ds.sampleIds.flatMap((_, i) => {
    const label = ds.augmented?.[i] || !keep(i) ? null : labelOf(i)
    return label === null ? [] : [label]
  })
  const scoredLabels = new Set(labelled((i) => ds.partitions[i] !== 'predict'))
  const predictReuse = [...new Set(labelled((i) => ds.partitions[i] === 'predict').filter((label) => scoredLabels.has(label)))]
  return {
    sampleHandle,
    observationHandle: ds.sampleIds.map((_, i) => `s${i}`),
    rowsOf,
    handles: [...rowsOf.keys()],
    basis,
    repeated: [...rowsOf.values()].some((rows) => rows.filter((i) => !ds.augmented?.[i]).length > 1),
    predictReuse,
    physicalKey: reps ? (reps.some((value) => value !== null) ? 'repetition' : 'row') : basis === 'declared' ? 'sample_id' : 'row',
    physicalLabel: ds.sampleIds.map((_, i) => (ds.augmented?.[i] ? null : labelOf(i))),
  }
}

/** Per-row value of a declared repetition column (nirs4all `repetition`). The sample-id
 *  column itself adds nothing: physical samples are already the CV unit (`p{k}`). */
function repetitionValues(ds: MaterializedDataset): (string | null)[] | undefined {
  if (ds.repetition === undefined || ds.repetition === ds.sampleIdColumn) return undefined
  const columns = columnsNamed(ds, ds.repetition)
  if (!columns.length) throw new Error(`Repetition column not found in the dataset metadata: ${ds.repetition}`)
  return ds.sampleIds.map((_, i) => {
    const value = columns.map((c) => c.values[i]).find((v) => v !== null && v !== '')
    return value === undefined ? null : String(value)
  })
}

/**
 * CV groups: declared group_id joined with a declared repetition column, as connected
 * components (nirs4all `compute_effective_groups`). Keys are dataset-global: a group or
 * repetition shared by Train and Test is refused by `validatePartitionGroups`, never
 * detached by a partition prefix. Rows of one physical sample share one group, and an
 * augmentation joins its origin. Undeclared groups stay absent: the physical sample
 * (`p{k}`) is already the CV unit.
 */
function effectiveGroups(ds: MaterializedDataset, identity: PhysicalIdentity): (string | null)[] | undefined {
  const reps = repetitionValues(ds)
  if (!reps && !ds.groupIds) return undefined
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
    link(JSON.stringify(['sample', identity.sampleHandle[i]]), i)
    if (reps && reps[i] !== null) link(JSON.stringify(['repetition', reps[i]]), i)
    const group = ds.groupIds?.[i]
    if (group != null) link(JSON.stringify(['group', group]), i)
    // an augmentation stays with its origin
    const origin = ds.originIds?.[i]
    const originRow = origin == null ? undefined : rowOf.get(origin)
    if (originRow !== undefined) parent[root(i)] = root(originRow)
  }
  // A component is a CV group as soon as one member carries a declared group or repetition.
  const constrained = new Set<number>()
  for (let i = 0; i < ds.nSamples; i++) {
    if (ds.groupIds?.[i] != null || (reps && reps[i] !== null)) constrained.add(root(i))
  }
  return parent.map((_, i) => (constrained.has(root(i)) ? `component-${root(i)}` : null))
}

/** Does CV group by declared groups or a declared repetition column other than the
 *  sample id? Repeated sample ids alone do not: native folds are over physical samples. */
export const hasCvGroups = (ds: MaterializedDataset): boolean =>
  ds.groupIds !== undefined || (ds.repetition !== undefined && ds.repetition !== ds.sampleIdColumn)

export function datasetRelations(ds: MaterializedDataset, identity = physicalIdentity(ds)) {
  if (ds.sampleIds.some((id) => typeof id !== 'string' || id.length === 0 || id.includes('\0'))) throw new Error('Sample identities must be nonempty strings without NUL')
  if (ds.augmented?.some((value) => typeof value !== 'boolean')) throw new Error('Augmentation flags must be explicit booleans')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds]) {
    if (values?.some((value) => value !== null && (typeof value !== 'string' || value.length === 0 || value.includes('\0')))) throw new Error('Relation identities must be nonempty strings or null')
  }
  // Sample identities may repeat (replicate scans): s{i} is the observation handle and p{k}
  // the physical-sample handle; the original ids are carried in the relation metadata.
  if (ds.sampleIds.length !== ds.nSamples) throw new Error('Sample identities must be aligned with rows')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds, ds.augmented, ds.observationIds]) {
    if (values && values.length !== ds.nSamples) throw new Error('Relation column is not aligned with dataset rows')
  }
  const physicalReps = repetitionValues(ds)
  const groupOf = effectiveGroups(ds, identity)
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
      observation_id: identity.observationHandle[i], sample_id: identity.sampleHandle[i], source_id: 'nir', target_id: 'y',
      group_id: groupOf?.[i] == null ? null : `g${groups.indexOf(groupOf[i]!)}`,
      origin_id: originRow === undefined ? null : `s${originRow}`,
      repetition_id: ds.repetitionIds?.[i] == null ? null : `r${reps.indexOf(ds.repetitionIds[i]!)}`,
      // A row without a target is excluded natively: training views drop it,
      // validation/predict views keep it (dag-ml-data `include_excluded`).
      augmented: ds.augmented?.[i] ?? false, excluded: !Number.isFinite(ds.y[i]),
      metadata: { original_sample_id: id, identity_basis: identity.basis, physical_key: identity.physicalLabel[i] === null ? 'row' : identity.physicalKey, io_partition: ds.partitionNames?.[i] ?? ds.partitions[i], ...(physicalReps ? { original_repetition: physicalReps[i] } : {}), ...(ds.observationIds ? { original_observation_id: ds.observationIds[i] } : {}), ...(ds.groupIds ? { original_group_id: ds.groupIds[i] } : {}), ...(ds.originIds ? { original_origin_id: origin } : {}), ...(ds.repetitionIds ? { original_repetition_id: ds.repetitionIds[i] } : {}) },
    }
  })
}
