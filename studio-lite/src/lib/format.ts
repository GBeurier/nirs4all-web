import type { Metrics, TaskType } from '@/engine/types'

export function fmt(v: number | undefined | null, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2)
  return v.toFixed(digits)
}

/** The headline metric + its label for a task type (drives the ranking display). */
export function primaryMetric(task: TaskType): { key: keyof Metrics; label: string; higherIsBetter: boolean } {
  return task === 'regression'
    ? { key: 'rmse', label: 'RMSE', higherIsBetter: false }
    : { key: 'accuracy', label: 'Accuracy', higherIsBetter: true }
}

/** Ordered metric chips to display for a task type. */
export function metricChips(task: TaskType): { key: keyof Metrics; label: string }[] {
  return task === 'regression'
    ? [
        { key: 'rmse', label: 'RMSE' },
        { key: 'r2', label: 'R²' },
        { key: 'mae', label: 'MAE' },
      ]
    : [
        { key: 'accuracy', label: 'Acc' },
        { key: 'f1', label: 'F1' },
      ]
}
