// Partition lookups over a materialized dataset (the FIRST split: train vs test).
// These are plain identity/partition reads — used by both the served path
// (DagMlEngine) and the offline path (orchestrate). Kept separate from kfold.ts
// so the TS fold-builder (kfold.ts buildFolds) stays strictly the offline path.
import type { MaterializedDataset } from './types'

/** A row without a finite target (missing y, or a missing class label) never
 *  enters FIT, CV or scoring; it stays in the dataset for prediction. */
export const hasTarget = (ds: MaterializedDataset, row: number): boolean =>
  Number.isFinite(ds.y[row]) && (ds.taskType === 'regression' || ds.classes?.[row] !== '')

/** Labeled row indices of the train partition (falls back to all non-predict rows). */
export function trainRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'train') r.push(i)
  if (r.length === 0) for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') r.push(i)
  return r.filter((i) => hasTarget(ds, i))
}

/** Labeled row indices of the held-out test partition (empty if none). */
export function testRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'test' && hasTarget(ds, i)) r.push(i)
  return r
}

/** Train/test rows left out of fitting and scoring because their target is missing. */
export function missingTargetCount(ds: MaterializedDataset): number {
  let n = 0
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict' && !hasTarget(ds, i)) n++
  return n
}

export const missingTargetMessage = (n: number): string =>
  `${n} row${n === 1 ? '' : 's'} without a target excluded from fitting and scoring`
