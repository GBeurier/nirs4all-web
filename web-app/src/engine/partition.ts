// Partition lookups over a materialized dataset (the FIRST split: train vs test).
// These are plain identity/partition reads — used by both the served path
// (DagMlEngine) and the offline path (orchestrate). Kept separate from kfold.ts
// so the TS fold-builder (kfold.ts buildFolds) stays strictly the offline path.
import type { MaterializedDataset } from './types'

/** Row indices of the train partition (falls back to all non-predict rows). */
export function trainRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'train') r.push(i)
  if (r.length === 0) for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') r.push(i)
  return r
}

/** Row indices of the held-out test partition (empty if none). */
export function testRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'test') r.push(i)
  return r
}
