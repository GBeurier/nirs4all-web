import { describe, expect, it } from 'vitest'
import { buildDataset, datasetInputName, encodeTarget, inferTaskType, isTestName, summarize, type RawFile } from './dataset'

const xTrain = '1000;1010;1020;1030\n0.10;0.12;0.15;0.14\n0.11;0.13;0.16;0.15\n0.09;0.11;0.14;0.13\n0.12;0.14;0.17;0.16'
const yTrain = 'protein\n11.2\n10.7\n14.1\n9.8'
const xTest = '1000;1010;1020;1030\n0.10;0.12;0.15;0.14\n0.11;0.13;0.16;0.15'
const yTest = 'protein\n11.0\n10.9'

describe('buildDataset', () => {
  it.each(['Mtrain.csv', 'M_train.csv', 'metadata.csv', 'M_features_train.csv', 'M_reference_train.csv'])('names and reads X when %s and targets precede spectra', (metadataName) => {
    const files: RawFile[] = [
      { name: metadataName, text: 'sample_id;batch\nS1;1\nS2;2\nS3;1\nS4;2' },
      { name: 'Ytrain.csv', text: yTrain },
      { name: 'Xtest.csv', text: xTest },
      { name: 'Xtrain.csv', text: xTrain },
      { name: 'Ytest.csv', text: yTest },
    ]
    const ds = buildDataset(files)
    expect(datasetInputName(files)).toBe('Xtrain.csv')
    expect(ds.nFeatures).toBe(4)
    expect(ds.axis).toEqual([1000, 1010, 1020, 1030])
    expect(Array.from(ds.X.slice(0, 4))).toEqual([0.10, 0.12, 0.15, 0.14])
    expect(Array.from(ds.y)).toEqual([11.2, 10.7, 14.1, 9.8, 11.0, 10.9])
    expect(ds.sampleIds.slice(0, 4)).toEqual(['S1', 'S2', 'S3', 'S4'])
    expect(ds.metadata).toEqual([{ name: 'batch', kind: 'numeric', values: [1, 2, 1, 2, null, null] }])
  })

  it.each(['Mango_spectra.csv', 'Mixture_spectra.csv'])('keeps %s as a feature file', (name) => {
    expect(datasetInputName([{ name }])).toBe(name)
    expect(buildDataset([{ name, text: xTrain }]).nFeatures).toBe(4)
  })

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

  it.each([['Xcal', 'Ycal', 'Xval', 'Yval'], ['Xval', 'Yval', 'Xcal', 'Ycal'], ['X_cal', 'Y_cal', 'X_val', 'Y_val']])('reads %s/%s as train and the val files as test, in any upload order', (x, y, xv, yv) => {
    const ds = buildDataset([
      { name: `${x}.csv`, text: x.includes('val') ? xTest : xTrain },
      { name: `${y}.csv`, text: y.includes('val') ? yTest : yTrain },
      { name: `${xv}.csv`, text: xv.includes('val') ? xTest : xTrain },
      { name: `${yv}.csv`, text: yv.includes('val') ? yTest : yTrain },
    ])
    expect(ds.partitions.filter((p) => p === 'train')).toHaveLength(4)
    expect(ds.partitions.filter((p) => p === 'test')).toHaveLength(2)
    expect(Array.from(ds.y)).toEqual([11.2, 10.7, 14.1, 9.8, 11.0, 10.9])
  })

  it('treats `val` as a partition token only', () => {
    for (const name of ['Xval', 'Yval', 'Mval', 'X_val', 'val_spectra', 'Xtest', 'validation', 'holdout']) expect(isTestName(name.toLowerCase())).toBe(true)
    for (const name of ['interval', 'xcal', 'mcal', 'x_train', 'evaluated', 'xvalue']) expect(isTestName(name)).toBe(false)
  })

  it('keeps NA and empty targets missing instead of a value or a class', () => {
    const ds = buildDataset([{ name: 'X_train.csv', text: xTrain }, { name: 'y_train.csv', text: 'protein\n11.2\nNA\n14.1\nnan' }])
    expect(ds.taskType).toBe('regression')
    expect(Array.from(ds.y).map(Number.isNaN)).toEqual([false, true, false, true])
    expect(inferTaskType([NaN, NaN, NaN], ['A', 'NA', 'B'])).toBe('binary')
    const { y, classes } = encodeTarget(Float64Array.from([NaN, NaN, NaN, 1, NaN]), ['A', '', 'B', '1', 'NA'], 'multiclass')
    expect(classes).toEqual(['A', '', 'B', '1', ''])
    expect(Array.from(y)).toEqual([1, NaN, 2, 0, NaN])
  })

  it('infers classification from few-valued integer / label targets', () => {
    expect(inferTaskType([0, 1, 0, 1, 1, 0], undefined)).toBe('binary')
    expect(inferTaskType([], ['A', 'B', 'C', 'A'])).toBe('multiclass')
    expect(inferTaskType([11.2, 10.7, 14.1, 9.8, 12.3], undefined)).toBe('regression')
  })
})
