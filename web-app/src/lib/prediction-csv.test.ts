import { describe, expect, it } from 'vitest'
import type { PredictResult } from '@/engine/types'
import { predictionCsv } from './prediction-csv'

describe('Predict CSV export', () => {
  it('exports every regression row at full precision with explicit input row numbers', () => {
    const values = Float64Array.from({ length: 17 }, (_, i) => i + 0.123456789012345)
    const csv = predictionCsv({ values }, 17, 'regression', 'protein')
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(18)
    expect(lines[0]).toBe('row,predicted:protein')
    expect(lines[1]).toBe(`1,${values[0]}`)
    expect(lines[17]).toBe(`17,${values[16]}`)
  })

  it('exports classification labels instead of their encoded numbers and escapes CSV fields', () => {
    expect(predictionCsv({
      values: Float64Array.of(1, 0),
      labels: ['class, "A"', 'class\r\nB'],
      sampleIds: ['sample,1', 'sample"2'],
    }, 2, 'multiclass', 'species')).toBe(
      'sampleId,predictedClass:species\r\n"sample,1","class, ""A"""\r\n"sample""2","class\r\nB"\r\n',
    )
  })

  it('preserves Archive V2 target names, sample identity and row-major matrix order', () => {
    expect(predictionCsv({
      values: Float64Array.of(1.25, 10, 2.5, 20), rows: 2, cols: 2,
      sampleIds: ['sample.9', 'sample.3'], targetNames: ['protein, dry', 'moisture "wet"'],
    }, 2, 'regression', 'ignored scalar fallback')).toBe(
      'sampleId,"predicted:protein, dry","predicted:moisture ""wet"""\r\nsample.9,1.25,10\r\nsample.3,2.5,20\r\n',
    )
  })

  it('uses neutral headers when target names are unavailable', () => {
    expect(predictionCsv({ values: Float64Array.of(3) }, 1, 'regression')).toBe('row,predicted\r\n1,3\r\n')
    expect(predictionCsv({ values: Float64Array.of(3, 4), cols: 2 }, 1, 'regression'))
      .toBe('row,predicted:target_1,predicted:target_2\r\n1,3,4\r\n')
  })

  it.each([
    { values: Float64Array.of(1) },
    { values: Float64Array.of(1, 2), rows: 1 },
    { values: Float64Array.of(1, 2), cols: 0 },
    { values: Float64Array.of(1, NaN) },
    { values: Float64Array.of(1, Infinity) },
    { values: Float64Array.of(1, 2), sampleIds: ['only-one'] },
    { values: Float64Array.of(1, 2), targetNames: ['one', 'too-many'] },
    { values: Float64Array.of(1, 2), labels: ['only-one'] },
  ] satisfies PredictResult[])('refuses incomplete or inconsistent output %#', (result) => {
    expect(() => predictionCsv(result, 2, 'regression')).toThrow(/export is unavailable/)
  })

  it('refuses empty output and classification without class labels', () => {
    expect(() => predictionCsv({ values: new Float64Array() }, 0, 'regression')).toThrow()
    expect(() => predictionCsv({ values: Float64Array.of(1) }, 1, 'binary')).toThrow(/class labels are missing/)
  })
})
