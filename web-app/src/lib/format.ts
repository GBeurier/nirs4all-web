import { getMetricDefinition, isLowerBetter } from 'nirs4all-ui/score'
import type { Metrics, TaskType } from '@/engine/types'

export function fmt(v: number | undefined | null, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2)
  return v.toFixed(digits)
}

// Metric vocabulary (labels, abbreviations, direction) comes from the shared
// nirs4all-ui/score catalog so Web and Studio agree on it; only the compact
// number formatting above stays a Web display policy.

function metricLabel(key: keyof Metrics & string): string {
  return getMetricDefinition(key)?.label ?? key.toUpperCase()
}

function metricAbbreviation(key: keyof Metrics & string): string {
  return getMetricDefinition(key)?.abbreviation ?? key.toUpperCase()
}

/** The headline metric + its label for a task type (drives the ranking display). */
export function primaryMetric(task: TaskType): { key: keyof Metrics; label: string; higherIsBetter: boolean } {
  const key = task === 'regression' ? 'rmse' : 'accuracy'
  return { key, label: metricLabel(key), higherIsBetter: !isLowerBetter(key) }
}

/** Ordered metric chips to display for a task type. */
export function metricChips(task: TaskType): { key: keyof Metrics; label: string }[] {
  const keys: (keyof Metrics & string)[] = task === 'regression' ? ['rmse', 'r2', 'mae'] : ['accuracy', 'f1']
  return keys.map((key) => ({ key, label: metricAbbreviation(key) }))
}
