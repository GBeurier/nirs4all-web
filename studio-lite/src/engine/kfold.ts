import { shuffledIndices } from './algo/linalg'
import type { MaterializedDataset } from './types'

export interface Fold {
  foldId: number
  trainIdx: number[]
  valIdx: number[]
}

/**
 * Build CV folds over the TRAIN partition only (the test partition is held out
 * for the refit score). If the dataset carries explicit folds (by sampleId),
 * honor them; otherwise build a seeded K-fold. Splits are returned as row
 * indices into the dataset; OOF predictions are later joined by sampleId, never
 * by row order.
 */
export function buildFolds(ds: MaterializedDataset, k: number, seed: number): Fold[] {
  const trainRows: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'train') trainRows.push(i)
  if (trainRows.length === 0) for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') trainRows.push(i)

  if (ds.folds && ds.folds.length > 0) {
    const idOf = new Map(ds.sampleIds.map((id, i) => [id, i]))
    const trainSet = new Set(trainRows)
    return ds.folds.map((f) => {
      const valIdx = f.valSampleIds.map((id) => idOf.get(id)).filter((i): i is number => i !== undefined && trainSet.has(i))
      const valSet = new Set(valIdx)
      return { foldId: f.foldId, valIdx, trainIdx: trainRows.filter((i) => !valSet.has(i)) }
    })
  }

  const kk = Math.max(2, Math.min(k, trainRows.length))
  const order = shuffledIndices(trainRows.length, seed).map((i) => trainRows[i])
  const folds: Fold[] = []
  for (let f = 0; f < kk; f++) {
    const valIdx: number[] = []
    for (let i = f; i < order.length; i += kk) valIdx.push(order[i])
    const valSet = new Set(valIdx)
    folds.push({ foldId: f + 1, valIdx, trainIdx: trainRows.filter((i) => !valSet.has(i)) })
  }
  return folds
}

export function trainRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'train') r.push(i)
  if (r.length === 0) for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') r.push(i)
  return r
}

export function testRowsOf(ds: MaterializedDataset): number[] {
  const r: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'test') r.push(i)
  return r
}
