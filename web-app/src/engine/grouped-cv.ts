import type { DagMlMod } from './dagml'
import { datasetRelations } from './relations'
import type { MaterializedDataset, PipelineDSL } from './types'

interface FoldSet {
  id: string; sample_ids: string[]; sample_groups: Record<string, string>
  partition_mode?: 'resampled'
  folds: { fold_id: string; train_sample_ids: string[]; validation_sample_ids: string[] }[]
}
type GroupRuntime = { group_kfold_split_json(spec: string, groups: string, id: string): string }
export function validatePartitionGroups(ds: MaterializedDataset): void {
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
    if (prior && prior !== ds.partitions[i]) throw new Error('A declared group crosses Train/Test partitions; provide a group-safe holdout')
    partitions.set(group, ds.partitions[i])
  }
}
/** Augmentations are training observations, never independent scoring rows. */
export function nonAugmentedScoreRows(ds: MaterializedDataset, selected: number[]): number[] {
  const rows = selected.filter((i) => !ds.augmented?.[i])
  if (!rows.length) throw new Error('Scoring requires at least one non-augmented observation')
  return rows
}
export function buildNativeFolds(dagml: DagMlMod, ds: MaterializedDataset, cv: NonNullable<PipelineDSL['cv']>, trainRows: number[]): FoldSet {
  validatePartitionGroups(ds)
  const relations = datasetRelations(ds)
  const grouped = cv.strategy === 'group' || (cv.strategy !== 'sample' && ds.groupIds !== undefined)
  if (ds.augmented?.some(Boolean) && !grouped) throw new Error('Augmented observations require explicit origin-safe groups for browser CV')
  const sampleIds = trainRows.map((i) => `s${i}`)
  const requested = cv.folds
  if (!Number.isInteger(requested) || requested < 2) throw new Error('Cross-validation requires at least two folds')
  if (grouped) {
    const runtime = dagml as DagMlMod & Partial<GroupRuntime>
    if (typeof runtime.group_kfold_split_json !== 'function') throw new Error('The staged DAG-ML WASM lacks native GroupKFold; rebuild it before grouped CV')
    const groups = Object.fromEntries(trainRows.map((i) => {
      if (!relations[i].group_id) throw new Error('Grouped CV requires a nonempty group_id for every training row')
      return [`s${i}`, relations[i].group_id]
    }))
    // No clipping to the group count: native refusal preserves the requested CV.
    const folds = JSON.parse(runtime.group_kfold_split_json(JSON.stringify({ n_splits: requested }), JSON.stringify(groups), 'outer')) as FoldSet
    const augmented = new Set(trainRows.filter((i) => relations[i].augmented).map((i) => `s${i}`))
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
  const spec = JSON.stringify({ n_splits: Math.min(requested, trainRows.length), shuffle: true, seed: cv.seed })
  return JSON.parse(ds.taskType === 'regression'
    ? dagml.kfold_split_json(spec, JSON.stringify(sampleIds), 'outer')
    : dagml.stratified_kfold_split_json(spec, JSON.stringify(sampleIds), JSON.stringify(Object.fromEntries(trainRows.map((i) => [`s${i}`, ds.classes?.[i] ?? String(Math.round(ds.y[i]))]))), 'outer')) as FoldSet
}
