import type { DagMlMod } from './dagml'
import { hasTarget } from './partition'
import { datasetRelations, hasCvGroups, physicalIdentity, type PhysicalIdentity } from './relations'
import type { MaterializedDataset, PipelineDSL } from './types'

export interface FoldSet {
  id: string; sample_ids: string[]; sample_groups: Record<string, string>
  partition_mode?: 'resampled'
  target_missing_sample_ids?: string[]
  folds: { fold_id: string; train_sample_ids: string[]; validation_sample_ids: string[] }[]
}
/** DAG-ML GroupKFold: explicit unique candidate universe (`sampleIds`), groups for the observed-target
 *  candidates only, and the target-missing candidates kept outside CV (`targetMissing`). */
type GroupRuntime = { group_kfold_split_json(spec: string, sampleIds: string, groups: string, id: string, targetMissing?: string): string }
export function validatePartitionGroups(ds: MaterializedDataset): void {
  // datasetRelations enforces the physical-sample identity first (one sample never
  // spans Train/Test; one target per physical sample).
  const relations = datasetRelations(ds)
  // This check must precede trimming relations to the REFIT cohort: prediction
  // uses fresh IDs and cannot recover an origin that linked Test back to Train.
  // Include prediction-only ancestors when connecting a family, but never
  // treat their partition as a training or scoring partition.
  const rows = new Map(relations.map((relation, i) => [relation.observation_id, i]))
  const parents = relations.map((_, i) => i)
  const rootOf = (start: number): number => {
    let root = start
    while (parents[root] !== root) {
      parents[root] = parents[parents[root]]
      root = parents[root]
    }
    return root
  }
  for (let i = 0; i < relations.length; i++) {
    const origin = relations[i].origin_id
    if (origin !== null) parents[rootOf(i)] = rootOf(rows.get(origin)!)
  }
  const originPartitions = new Map<number, string>()
  const partitions = new Map<string, string>()
  for (let i = 0; i < relations.length; i++) {
    if (ds.partitions[i] === 'predict') continue
    const family = rootOf(i)
    const originPartition = originPartitions.get(family)
    if (originPartition && originPartition !== ds.partitions[i]) throw new Error('An augmentation origin crosses Train/Test partitions; provide an origin-safe holdout')
    originPartitions.set(family, ds.partitions[i])
    const group = relations[i].group_id
    if (!group) {
      if (ds.groupIds !== undefined) throw new Error('Declared group_id must be nonempty for every Train/Test observation')
      continue
    }
    const prior = partitions.get(group)
    if (prior && prior !== ds.partitions[i]) throw new Error('A declared group or repetition crosses Train/Test partitions; provide a group-safe holdout (keys are dataset-wide, never partition-scoped)')
    partitions.set(group, ds.partitions[i])
  }
}
/** Augmentations are training observations, never independent scoring rows. */
export function nonAugmentedScoreRows(ds: MaterializedDataset, selected: number[]): number[] {
  const rows = selected.filter((i) => !ds.augmented?.[i])
  if (!rows.length) throw new Error('Scoring requires at least one non-augmented observation')
  return rows
}
/** Distinct physical-sample handles of `rows`, in their first-seen order. */
export function handlesOf(identity: PhysicalIdentity, rows: readonly number[]): string[] {
  return [...new Set(rows.map((i) => identity.sampleHandle[i]))]
}
/** Expand native fold handles (`p{k}`) to their dataset rows through the exact handle table.
 *  Validation rows never include augmented observations (training-only). */
export function expandFoldRows(identity: PhysicalIdentity, handles: readonly string[], role: 'train' | 'validation', ds: MaterializedDataset): number[] {
  const rows: number[] = []
  for (const handle of handles) {
    const members = identity.rowsOf.get(handle)
    if (!members) throw new Error(`Native fold refers to unknown sample ${handle}`)
    rows.push(...members.filter((i) => role === 'train' || !ds.augmented?.[i]))
  }
  return rows
}
export function buildNativeFolds(dagml: DagMlMod, ds: MaterializedDataset, cv: NonNullable<PipelineDSL['cv']>, trainRows: number[]): FoldSet {
  validatePartitionGroups(ds)
  const relations = datasetRelations(ds)
  const identity = physicalIdentity(ds)
  const grouped = cv.strategy === 'group' || (cv.strategy !== 'sample' && hasCvGroups(ds))
  if (ds.augmented?.some(Boolean) && !grouped) throw new Error('Augmented observations require explicit origin-safe groups for browser CV')
  // The CV unit is the physical sample p{k}: every scan of one sample follows it.
  // Native FoldSet records excluded targets outside its CV universe. Pass the
  // original training cohort so the native splitter owns this exclusion.
  const trainHandles = handlesOf(identity, trainRows)
  const missingRows = Array.from({ length: ds.nSamples }, (_, i) => i)
    .filter((i) => ds.partitions[i] === 'train' && !hasTarget(ds, i))
  const missingHandles = handlesOf(identity, missingRows)
  const cohort = [...trainHandles, ...missingHandles]
  const firstRow = (handle: string) => identity.rowsOf.get(handle)![0]
  const missingJson = missingHandles.length ? JSON.stringify(missingHandles) : undefined
  const requested = cv.folds
  if (!Number.isInteger(requested) || requested < 2) throw new Error('Cross-validation requires at least two folds')
  if (grouped) {
    const runtime = dagml as DagMlMod & Partial<GroupRuntime>
    if (typeof runtime.group_kfold_split_json !== 'function') throw new Error('The staged DAG-ML WASM lacks native GroupKFold; rebuild it before grouped CV')
    // Groups are required for the fitted cohort only. A target-missing handle is passed as a
    // candidate id, never given a group (the owner keeps it outside CV and ignores its group).
    const groups = Object.fromEntries(trainHandles.map((handle) => {
      const group = relations[firstRow(handle)].group_id
      if (!group) throw new Error('Grouped CV requires a nonempty group_id for every training row')
      return [handle, group]
    }))
    // No clipping to the group count: native refusal preserves the requested CV.
    const folds = JSON.parse(runtime.group_kfold_split_json(JSON.stringify({ n_splits: requested }), JSON.stringify(cohort), JSON.stringify(groups), 'outer', missingJson)) as FoldSet
    const augmented = new Set(trainHandles.filter((handle) => relations[firstRow(handle)].augmented))
    if (augmented.size) {
      // Preserve native group assignments and their training scopes. The native
      // resampled contract allows the training-only augmentation IDs to have
      // no validation prediction; original observations remain validated once.
      folds.partition_mode = 'resampled'
      for (const fold of folds.folds) {
        fold.validation_sample_ids = fold.validation_sample_ids.filter((id) => !augmented.has(id))
        if (!fold.validation_sample_ids.length) throw new Error('Every grouped fold requires non-augmented validation observations')
      }
    }
    return folds
  }
  const spec = JSON.stringify({ n_splits: Math.min(requested, trainHandles.length), shuffle: true, seed: cv.seed })
  return JSON.parse(ds.taskType === 'regression'
    ? dagml.kfold_split_json(spec, JSON.stringify(cohort), 'outer', missingJson)
    : dagml.stratified_kfold_split_json(spec, JSON.stringify(cohort), JSON.stringify(Object.fromEntries(trainHandles.map((handle) => [handle, ds.classes?.[firstRow(handle)] ?? String(Math.round(ds.y[firstRow(handle)]))]))), 'outer', missingJson)) as FoldSet
}
