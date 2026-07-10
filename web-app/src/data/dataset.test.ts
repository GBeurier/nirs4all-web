import { describe, expect, it } from 'vitest'
import { buildDataset, inferTaskType, summarize, type RawFile } from './dataset'

const xTrain = '1000;1010;1020;1030\n0.10;0.12;0.15;0.14\n0.11;0.13;0.16;0.15\n0.09;0.11;0.14;0.13\n0.12;0.14;0.17;0.16'
const yTrain = 'protein\n11.2\n10.7\n14.1\n9.8'
const xTest = '1000;1010;1020;1030\n0.10;0.12;0.15;0.14\n0.11;0.13;0.16;0.15'
const yTest = 'protein\n11.0\n10.9'

describe('buildDataset', () => {
  it('assembles train/test from the X/y convention with a wavelength axis', () => {
    const files: RawFile[] = [
      { name: 'X_train.csv', text: xTrain },
      { name: 'y_train.csv', text: yTrain },
      { name: 'X_test.csv', text: xTest },
      { name: 'y_test.csv', text: yTest },
    ]
    const ds = buildDataset(files, 'fruit')
    expect(ds.nFeatures).toBe(4)
    expect(ds.nSamples).toBe(6)
    expect(ds.partitions.filter((p) => p === 'train').length).toBe(4)
    expect(ds.partitions.filter((p) => p === 'test').length).toBe(2)
    expect(ds.axis).toEqual([1000, 1010, 1020, 1030])
    expect(ds.axisUnit).toBe('nm')
    expect(ds.taskType).toBe('regression')
    expect(ds.X[0]).toBeCloseTo(0.1)
    expect(ds.y[0]).toBeCloseTo(11.2)
    const s = summarize(ds)
    expect(s.nTrain).toBe(4)
    expect(s.yStats?.max).toBeCloseTo(14.1)
  })

  it('infers classification from few-valued integer / label targets', () => {
    expect(inferTaskType([0, 1, 0, 1, 1, 0], undefined)).toBe('binary')
    expect(inferTaskType([], ['A', 'B', 'C', 'A'])).toBe('multiclass')
    expect(inferTaskType([11.2, 10.7, 14.1, 9.8, 12.3], undefined)).toBe('regression')
  })
})
