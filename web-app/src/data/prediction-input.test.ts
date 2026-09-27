import { describe, expect, it } from 'vitest'
import { buildDataset } from './dataset'
import { columnContract, readPredictionCsv } from './prediction-input'

const axisModel = { nFeatures: 3, features: { names: ['1000', '1010', '1020'], axis: [1000, 1010, 1020], unit: 'nm' } }

describe('readPredictionCsv', () => {
  it('names the columns from a numeric wavelength header row', () => {
    const input = readPredictionCsv('1000;1010;1020\n0.1;0.2;0.3\n0.4;0.5;0.6', 3)
    expect(input.featureNames).toEqual(['1000', '1010', '1020'])
    expect(Array.from(input.X)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    expect(input.autoY).toBeNull()
  })

  it('keeps a permuted header as written (the engine refuses it)', () => {
    expect(readPredictionCsv('1020;1010;1000\n0.1;0.2;0.3\n0.4;0.5;0.6', 3).featureNames).toEqual(['1020', '1010', '1000'])
  })

  it('names the model columns of a text header and reads a trailing Y column', () => {
    const input = readPredictionCsv('a,b,c,protein\n0.1,0.2,0.3,11\n0.4,0.5,0.6,12', 3)
    expect(input.featureNames).toEqual(['a', 'b', 'c'])
    expect(input.autoY).toEqual(['11', '12'])
  })

  it('has no names without a header row', () => {
    expect(readPredictionCsv('0.1;0.2;0.3\n0.4;0.5;0.6', 3).featureNames).toBeUndefined()
  })

  it('refuses a header whose width differs from the rows', () => {
    expect(() => readPredictionCsv('a,b\n0.1,0.2,0.3\n0.4,0.5,0.6', 3)).toThrow(/header row has 2 names/)
  })
})

describe('columnContract', () => {
  it('reports a named input as checked', () => {
    expect(columnContract(axisModel, ['1000', '1010', '1020'])).toEqual({ checked: true, message: expect.stringMatching(/checked by name and order.*axis 1000 … 1020 nm, 3 columns/) })
  })

  it('makes the positional contract of an anonymous input explicit', () => {
    const c = columnContract(axisModel, undefined)
    expect(c.checked).toBe(false)
    expect(c.message).toMatch(/no header row: its 3 columns are taken by position.*not checked/)
  })

  it('makes the positional contract of a model without names explicit', () => {
    const c = columnContract({ nFeatures: 3 }, ['1000', '1010', '1020'])
    expect(c.checked).toBe(false)
    expect(c.message).toMatch(/records no column names.*taken by position/)
  })
})

describe('dataset column names', () => {
  const y = 'y\n1\n2\n3'
  it('keeps a text header as the feature names', () => {
    const ds = buildDataset([{ name: 'X_train.csv', text: 'a;b;c\n0.1;0.2;0.3\n0.2;0.3;0.4\n0.3;0.4;0.5' }, { name: 'y_train.csv', text: y }])
    expect(ds.featureNames).toEqual(['a', 'b', 'c'])
    expect(ds.axisUnit).toBe('index')
  })

  it('refuses test spectra whose columns differ from the training spectra', () => {
    const files = [
      { name: 'X_train.csv', text: '1000;1010;1020\n0.1;0.2;0.3\n0.2;0.3;0.4\n0.3;0.4;0.5' },
      { name: 'y_train.csv', text: y },
      { name: 'X_test.csv', text: '1020;1010;1000\n0.1;0.2;0.3\n0.2;0.3;0.4\n0.3;0.4;0.5' },
      { name: 'y_test.csv', text: y },
    ]
    expect(() => buildDataset(files)).toThrow(/test spectra columns do not match.*different order/)
  })
})
