import type { Metrics, PredRow, ScoreNode, TaskType } from '@/engine/types'
import { primaryMetric } from '@/lib/format'

/** Chart palette mirroring theme --chart-1..5. recharts needs concrete colors. */
export const CHART = {
  teal: '#0d9488',
  cyan: '#06b6d4',
  indigo: '#4f46e5',
  green: '#10b981',
  amber: '#d97706',
} as const

/** A short, locale-aware "Jun 4, 14:32" timestamp. */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** min/max of a numeric array, padded by `pad` fraction of the span. */
export function paddedExtent(values: number[], pad = 0.05): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return [0, 1]
  let lo = Math.min(...finite)
  let hi = Math.max(...finite)
  if (lo === hi) {
    const eps = Math.abs(lo) || 1
    lo -= eps
    hi += eps
  }
  const span = (hi - lo) * pad
  return [lo - span, hi + span]
}

/** Equal-axis extent for a parity plot: union of actual & predicted ranges. */
export function parityExtent(rows: PredRow[]): [number, number] {
  return paddedExtent([...rows.map((r) => r.actual), ...rows.map((r) => r.predicted)])
}

export interface Bin {
  x0: number
  x1: number
  /** bin center label */
  label: string
  count: number
}

/** Fixed-count histogram binning over a numeric array. */
export function histogram(values: number[], binCount = 20): Bin[] {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return []
  let lo = Math.min(...finite)
  let hi = Math.max(...finite)
  if (lo === hi) {
    hi = lo + 1
    lo = lo - 1
  }
  const width = (hi - lo) / binCount
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => {
    const x0 = lo + i * width
    const x1 = x0 + width
    return { x0, x1, label: ((x0 + x1) / 2).toPrecision(3), count: 0 }
  })
  for (const v of finite) {
    let idx = Math.floor((v - lo) / width)
    if (idx < 0) idx = 0
    if (idx >= binCount) idx = binCount - 1
    bins[idx].count += 1
  }
  return bins
}

/** Count occurrences of each label, returned in `labels` order. */
export function classCounts(labels: string[], universe?: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const l of universe ?? []) counts.set(l, 0)
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  const order = universe && universe.length > 0 ? universe : Array.from(counts.keys())
  return order.map((label) => ({ label, count: counts.get(label) ?? 0 }))
}

/** The primary metric value for a score node under a task type. */
export function primaryValue(task: TaskType, metrics: Metrics): number | undefined {
  return metrics[primaryMetric(task).key]
}

/** Per-fold primary-metric series for a bar chart. */
export function foldSeries(task: TaskType, folds: ScoreNode[]): { fold: string; value: number; id: string }[] {
  return folds.map((f) => ({ fold: f.name, value: primaryValue(task, f.metrics) ?? NaN, id: f.id }))
}
