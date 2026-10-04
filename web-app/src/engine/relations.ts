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

export function datasetRelations(ds: MaterializedDataset) {
  if (ds.sampleIds.some((id) => typeof id !== 'string' || id.length === 0 || id.includes('\0'))) throw new Error('Sample identities must be nonempty strings without NUL')
  if (ds.augmented?.some((value) => typeof value !== 'boolean')) throw new Error('Augmentation flags must be explicit booleans')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds]) {
    if (values?.some((value) => value !== null && (typeof value !== 'string' || value.length === 0 || value.includes('\0')))) throw new Error('Relation identities must be nonempty strings or null')
  }
  if (ds.sampleIds.length !== ds.nSamples || new Set(ds.sampleIds).size !== ds.nSamples) throw new Error('Sample identities must be unique and aligned with rows')
  for (const values of [ds.groupIds, ds.originIds, ds.repetitionIds, ds.augmented]) {
    if (values && values.length !== ds.nSamples) throw new Error('Relation column is not aligned with dataset rows')
  }
  const groups = [...new Set(ds.groupIds?.filter((v): v is string => v !== null) ?? [])].sort()
  const reps = [...new Set(ds.repetitionIds?.filter((v): v is string => v !== null) ?? [])].sort()
  const sampleAt = new Map(ds.sampleIds.map((id, i) => [id, i]))
  return ds.sampleIds.map((id, i) => {
    const origin = ds.originIds?.[i] ?? null
    const originRow = origin === null ? undefined : sampleAt.get(origin)
    if (origin !== null && originRow === undefined) throw new Error(`Origin ${origin} is not a dataset observation`)
    if (Boolean(ds.augmented?.[i]) !== (origin !== null)) throw new Error('An origin requires an explicitly augmented observation, and every augmented observation needs an origin')
    if (originRow !== undefined && ds.groupIds && ds.groupIds[i] !== ds.groupIds[originRow]) throw new Error('An augmented observation and its origin must belong to the same group')
    return {
      observation_id: `s${i}`, sample_id: `s${i}`, source_id: 'nir', target_id: 'y',
      group_id: ds.groupIds?.[i] == null ? null : `g${groups.indexOf(ds.groupIds[i]!)}`,
      origin_id: originRow === undefined ? null : `s${originRow}`,
      repetition_id: ds.repetitionIds?.[i] == null ? null : `r${reps.indexOf(ds.repetitionIds[i]!)}`,
      augmented: ds.augmented?.[i] ?? false, excluded: false,
      metadata: { original_sample_id: id, ...(ds.groupIds ? { original_group_id: ds.groupIds[i] } : {}), ...(ds.originIds ? { original_origin_id: origin } : {}), ...(ds.repetitionIds ? { original_repetition_id: ds.repetitionIds[i] } : {}) },
    }
  })
}
