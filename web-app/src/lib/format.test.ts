import { describe, expect, it } from 'vitest'
import { fmt, metricChips, primaryMetric } from './format'

// Pins the metric vocabulary Web derives from the shared nirs4all-ui/score
// catalog: exact labels and directions the Results UI renders. If these
// change, the shared catalog changed — review the UI copy deliberately.
describe('metric display vocabulary (nirs4all-ui/score)', () => {
  it('keeps the headline metric per task type, direction-aware', () => {
    expect(primaryMetric('regression')).toEqual({ key: 'rmse', label: 'RMSE', higherIsBetter: false })
    expect(primaryMetric('multiclass')).toEqual({ key: 'accuracy', label: 'Accuracy', higherIsBetter: true })
    expect(primaryMetric('binary')).toEqual({ key: 'accuracy', label: 'Accuracy', higherIsBetter: true })
  })

  it('keeps the ordered metric chips per task type', () => {
    expect(metricChips('regression')).toEqual([
      { key: 'rmse', label: 'RMSE' },
      { key: 'r2', label: 'R²' },
      { key: 'mae', label: 'MAE' },
    ])
    expect(metricChips('multiclass')).toEqual([
      { key: 'accuracy', label: 'Acc' },
      { key: 'f1', label: 'F1' },
    ])
  })

  it('keeps compact number formatting as a Web display policy', () => {
    expect(fmt(0.123456)).toBe('0.123')
    expect(fmt(12345)).toBe('1.23e+4')
    expect(fmt(0.0000123)).toBe('1.23e-5')
    expect(fmt(null)).toBe('—')
    expect(fmt(Number.NaN)).toBe('—')
  })
})
