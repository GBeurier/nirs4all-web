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

  // Classification → stratified K-fold: distribute each class's shuffled rows
  // round-robin across folds (staggered per class) so every fold keeps the class
  // proportions. Mirrors the served DagMlEngine default (stratified_kfold_split).
  if (ds.taskType !== 'regression') {
    const byClass = new Map<string, number[]>()
    for (const r of trainRows) {
      const key = ds.classes?.[r] ?? String(Math.round(ds.y[r]))
      const arr = byClass.get(key)
      if (arr) arr.push(r)
      else byClass.set(key, [r])
    }
    const valByFold: number[][] = Array.from({ length: kk }, () => [])
    let classNo = 0
    for (const rows of byClass.values()) {
      const shuffled = shuffledIndices(rows.length, seed + classNo).map((i) => rows[i])
      for (let i = 0; i < shuffled.length; i++) valByFold[(i + classNo) % kk].push(shuffled[i])
      classNo++
    }
    return valByFold.map((valIdx, f) => {
      const valSet = new Set(valIdx)
      return { foldId: f + 1, valIdx, trainIdx: trainRows.filter((i) => !valSet.has(i)) }
    })
  }

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
