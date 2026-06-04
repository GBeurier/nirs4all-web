import type { Confusion, Metrics, PredRow } from './types'

export function regressionMetrics(rows: PredRow[]): Metrics {
  const n = rows.length
  if (n === 0) return { n: 0 }
  let se = 0
  let ae = 0
  let mean = 0
  for (const r of rows) mean += r.actual
  mean /= n
  let sst = 0
  for (const r of rows) {
    const e = r.predicted - r.actual
    se += e * e
    ae += Math.abs(e)
    sst += (r.actual - mean) ** 2
  }
  const rmse = Math.sqrt(se / n)
  const mae = ae / n
  const r2 = sst > 0 ? 1 - se / sst : 0
  return { rmse, mae, r2, n }
}

export function classificationMetrics(rows: PredRow[], labels: string[]): { metrics: Metrics; confusion: Confusion } {
  const k = labels.length
  const idx = new Map(labels.map((l, i) => [l, i]))
  const matrix = Array.from({ length: k }, () => new Array(k).fill(0))
  let correct = 0
  for (const r of rows) {
    const ti = idx.get(r.actualLabel ?? String(r.actual)) ?? Math.round(r.actual)
    const pi = idx.get(r.predictedLabel ?? String(r.predicted)) ?? Math.round(r.predicted)
    if (ti >= 0 && ti < k && pi >= 0 && pi < k) {
      matrix[ti][pi]++
      if (ti === pi) correct++
    }
  }
  const n = rows.length
  const accuracy = n > 0 ? correct / n : 0
  // macro F1
  let f1sum = 0
  for (let c = 0; c < k; c++) {
    let tp = matrix[c][c]
    let fp = 0
    let fn = 0
    for (let i = 0; i < k; i++) {
      if (i !== c) fp += matrix[i][c]
      if (i !== c) fn += matrix[c][i]
    }
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0
    f1sum += prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0
  }
  const f1 = k > 0 ? f1sum / k : 0
  return { metrics: { accuracy, f1, n }, confusion: { labels, matrix } }
}

/** Mean ± of a metric across fold nodes (used for the CV aggregate row). */
export function meanMetric(values: (number | undefined)[]): number {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN
}
