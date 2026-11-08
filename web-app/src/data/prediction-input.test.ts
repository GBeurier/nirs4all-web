import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDataset } from './dataset'
import { columnContract, readPredictionFile, readReferenceFile } from './prediction-input'
import { IoIngestionRefusal } from './wasm-io'

// Prediction files are read by nirs4all-io: Web keeps no CSV parser, so the io binding is
// scripted here with records shaped like the real wire (logical `data` + `validity`, `y.columns`,
// owner numeric-coordinate packets). What is tested is what Web does with the OWNER's output:
// the header/positional report, the reference column, the model-width contract and the refusals.
const io = vi.hoisted(() => ({
  specs: [] as { sources?: { id: string; role: string; input?: string; params?: Record<string, unknown>; columns?: { role: string; select: unknown }[] }[]; sample_index?: unknown }[],
  width: 3,
  hasHeader: true,
  headerAmbiguous: false,
  inferenceOptions: [] as { file_params?: Record<string, { has_header: boolean }> }[],
  inspectionOptions: [] as { params: Record<string, Record<string, unknown>> }[],
  next: (() => null) as (spec: unknown, files: { name: string }[]) => unknown,
}))
vi.mock('@/engine/nirs4all-core', () => ({
  loadDataIoWasm: async () => ({ formats: {}, io: {
    inferDataset: (files: { name: string }[], _records: unknown, options: { file_params?: Record<string, { has_header: boolean }> }) => {
      io.inferenceOptions.push(options)
      const hasHeader = options.file_params?.[files[0].name]?.has_header ?? io.hasHeader
      const ambiguous = io.headerAmbiguous && options.file_params?.[files[0].name]?.has_header === undefined
      return {
        structure: { value: 'single_combined' },
        params: { [files[0].name]: { has_header: { value: hasHeader }, ...(ambiguous ? { header_ambiguous: true } : {}) } },
        warnings: ambiguous ? [`file '${files[0].name}': header_ambiguous: first row resembles the data rows and is not a recognized nm/cm-1 axis; default has_header=true. Declare params.has_header=true or params.has_header=false explicitly.`] : [],
        resolved_spec: { name: 'p', sample_index: { by: 'id', key: 'Sample_ID' }, sources: [{ id: 'data', role: 'mixed', input: files[0].name, key: 'Sample_ID', columns: [{ role: 'features', select: ['a'] }, { role: 'targets', select: ['t'] }], params: { delimiter: ';', has_header: hasHeader } }] },
      }
    },
    describeTables: (files: { name: string }[], options: { params: Record<string, Record<string, unknown>> }) => {
      io.inspectionOptions.push(options)
      return [{
        name: files[0].name, readable: true, n_cols: io.width,
        params: { ...options.params[files[0].name], na: { policy: 'ignore' } },
      }]
    },
    assembleDataset: (files: { name: string }[], _records: unknown, spec: string) => {
      const parsed = JSON.parse(spec)
      io.specs.push(parsed)
      return io.next(parsed, files)
    },
  } }),
}))

const packet = (values: number[]) => {
  const view = new DataView(new ArrayBuffer(values.length * 8))
  values.forEach((v, i) => view.setFloat64(i * 8, v, true))
  return { kind: 'numeric', count: values.length, data_bytes_hex: Array.from(new Uint8Array(view.buffer), (b) => b.toString(16).padStart(2, '0')).join('') }
}
type Y = { name: string; kind?: string; values: number[]; valid?: boolean[] }
const target = (columns: Y[]) => ({
  columns: columns.map((c) => ({ name: c.name, kind: c.kind ?? 'numeric', block: { n_rows: c.values.length, n_cols: 1, validity: c.valid ?? c.values.map(() => true) } })),
  data: Float64Array.from(Array.from({ length: columns[0].values.length }, (_, r) => columns.map((c) => c.values[r])).flat()),
})
/** An owner record: one `predict` partition. */
function record(rows: number, cols: number, o: { values?: number[]; valid?: boolean[]; axis?: number[]; headerUnit?: string; headers?: string[]; y?: ReturnType<typeof target>; categories?: Record<string, { categories: string[] }> } = {}) {
  const values = o.values ?? Array.from({ length: rows * cols }, (_, i) => i + 0.5)
  return {
    name: 'p', task_type: 'regression', signal_type: 'absorbance', n_sources: 1, folds: [],
    blocks: { predict: {
      n_samples: rows,
      x: [{ data: Float64Array.from(values), n_rows: rows, n_cols: cols, validity: o.valid ?? values.map(() => true) }],
      feature_headers: [o.headers ?? Array.from({ length: cols }, (_, i) => String(o.axis?.[i] ?? i))],
      feature_axes: [[{ name: 'feature', unit: null, coordinates: o.axis ? packet(o.axis) : { kind: 'string', values: o.headers ?? [] } }]],
      header_units: [o.headerUnit ?? 'text'], signal_types: [null],
      y: o.y ?? null, y_headers: o.y?.columns.map((c) => c.name) ?? [], y_categorical: o.categories,
      metadata: null, weights: null, weights_header: null,
    } },
  }
}
const file = (text = 'ignored by the scripted io') => new File([text], 'new-spectra.csv')
const axisModel = { nFeatures: 3, features: { names: ['1000', '1010', '1020'], axis: [1000, 1010, 1020], unit: 'nm' } }

beforeEach(() => {
  io.width = 3
  io.hasHeader = true
  io.headerAmbiguous = false
  io.specs.length = 0
  io.inferenceOptions.length = 0
  io.inspectionOptions.length = 0
})

describe('readPredictionFile (nirs4all-io)', () => {
  it('reports a header row from the owner axis: names are the exact coordinates, X is the logical data', async () => {
    io.headerAmbiguous = true // An explicit true declaration suppresses owner ambiguity.
    io.specs.length = 0
    const owner = record(2, 3, { values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], axis: [1000, 1010, 1020] })
    io.next = () => owner
    const input = await readPredictionFile(file('1000;1010;1020\n0.1;0.2;0.3\n0.4;0.5;0.6'), 3, true)
    expect(input.featureNames).toEqual(['1000', '1010', '1020'])
    expect(Array.from(input.X)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    expect(input.nSamples).toBe(2)
    expect(input.autoY).toBeNull()
    // The prediction contract declares all model columns as features before assembly.
    expect(io.specs[0].sources![0]).toMatchObject({ role: 'features', input: 'new-spectra.csv', key: 'Sample_ID', columns: [{ role: 'features', select: [0, 1, 2] }] })
    expect(io.specs[0].sample_index).toEqual({ by: 'id', key: 'Sample_ID' })
    expect(io.inferenceOptions).toEqual([{ file_params: { 'new-spectra.csv': { has_header: true } } }])
    expect(io.inspectionOptions[0].params['new-spectra.csv'].has_header).toBe(true)
  })

  it('keeps a permuted header as written (the engine refuses it)', async () => {
    io.next = () => record(2, 3, { axis: [1020, 1010, 1000] })
    expect((await readPredictionFile(file(), 3, true)).featureNames).toEqual(['1020', '1010', '1000'])
  })

  it('names the columns of a text header and reads the reference column io assigned', async () => {
    io.width = 4
    io.next = () => record(2, 3, { headers: ['a', 'b', 'c'], y: target([{ name: 'protein', values: [11, 12] }]) })
    const input = await readPredictionFile(file(), 3, true)
    expect(input.featureNames).toEqual(['a', 'b', 'c'])
    expect(input.autoY).toEqual(['11', '12'])
  })

  it('decodes a classification reference column to its labels and keeps masked cells empty', async () => {
    io.width = 4
    io.next = () => record(3, 3, {
      headers: ['a', 'b', 'c'],
      y: target([{ name: 'grade', kind: 'classification_string', values: [0, 1, 0], valid: [true, true, false] }]),
      categories: { grade: { categories: ['A', 'B'] } },
    })
    expect((await readPredictionFile(file(), 3, true)).autoY).toEqual(['A', 'B', ''])
  })

  it('has no names when io reports no header row (positional)', async () => {
    io.headerAmbiguous = true // An explicit false declaration suppresses owner ambiguity.
    io.next = () => record(2, 3, { axis: [0, 1, 2], headerUnit: 'index' })
    const input = await readPredictionFile(file(), 3, false)
    expect(input.featureNames).toBeUndefined()
    expect(io.specs).toHaveLength(1)
    expect(io.specs[0].sources![0].params!.has_header).toBe(false)
    expect(io.specs[0].sources![0].columns).toEqual([{ role: 'features', select: [0, 1, 2] }])
    expect(io.inferenceOptions).toEqual([{ file_params: { 'new-spectra.csv': { has_header: false } } }])
    expect(io.inspectionOptions[0].params['new-spectra.csv'].has_header).toBe(false)
  })

  it('keeps automatic prediction when the owner proposal is unambiguous', async () => {
    io.next = () => record(2, 3, { headers: ['alpha', 'beta', 'gamma'] })
    const input = await readPredictionFile(file(), 3)
    expect(io.inferenceOptions).toEqual([{}])
    expect(io.inspectionOptions).toHaveLength(1)
    expect(io.specs).toHaveLength(1)
    expect(input.nSamples).toBe(2)
    expect(input.featureNames).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('surfaces owner ambiguity after one inference and before assembly or prediction', async () => {
    io.headerAmbiguous = true
    const predict = vi.fn()
    const error = await readPredictionFile(file(), 3).then(predict).catch((e: unknown) => e) as IoIngestionRefusal
    expect(error).toBeInstanceOf(IoIngestionRefusal)
    expect(error.analysis!.plan!.params!['new-spectra.csv'].header_ambiguous).toBe(true)
    expect(error.message).toContain(error.analysis!.plan!.warnings![0])
    expect(error.message).toMatch(/Declare params.has_header=true or params.has_header=false explicitly/)
    expect(io.inferenceOptions).toEqual([{}])
    expect(io.inspectionOptions).toHaveLength(0)
    expect(io.specs).toHaveLength(0)
    expect(predict).not.toHaveBeenCalled()
  })

  it('declares the trailing reference by model width before the only owner assembly', async () => {
    io.width = 4
    io.specs.length = 0
    io.next = (spec) => {
      const source = (spec as typeof io.specs[number]).sources![0]
      return source.columns?.some((c) => c.role === 'targets' && c.select === 3)
        ? record(2, 3, { headers: ['a', 'b', 'c'], y: target([{ name: 'ref', values: [5, 6] }]) })
        : record(2, 4, { headers: ['a', 'b', 'c', 'd'] })
    }
    const input = await readPredictionFile(file(), 3, true)
    expect(io.specs).toHaveLength(1)
    expect(io.specs[0].sources![0].columns).toEqual([{ role: 'features', select: [0, 1, 2] }, { role: 'targets', select: 3 }])
    expect(input.autoY).toEqual(['5', '6'])
    expect(input.retained.spec.sources![0].columns).toEqual(io.specs[0].sources![0].columns) // the spec that produced X is retained
  })

  it('refuses an inspected width mismatch before assembly and keeps the original bytes', async () => {
    io.width = 5
    const error = await readPredictionFile(file('x'), 3, true).catch((e: unknown) => e) as IoIngestionRefusal
    expect(error).toBeInstanceOf(IoIngestionRefusal)
    expect(error.message).toMatch(/Column count mismatch: the file has 5 columns/)
    expect(io.specs).toHaveLength(0)
    expect(new TextDecoder().decode(error.inputs[0].bytes)).toBe('x')
  })

  it('refuses another width, keeping the owner record and the input bytes', async () => {
    const owner = record(2, 5)
    io.next = () => owner
    const error = await readPredictionFile(file('x'), 3, true).catch((e: unknown) => e) as IoIngestionRefusal
    expect(error).toBeInstanceOf(IoIngestionRefusal)
    expect(error.message).toMatch(/Column count mismatch: the file has 5 feature columns but the model expects 3 features \(or 4 with a trailing reference column\)/)
    expect(error.retained!.record).toBe(owner)
    expect(new TextDecoder().decode(error.inputs[0].bytes)).toBe('x')
  })

  it('refuses a masked cell instead of predicting on a placeholder', async () => {
    io.next = () => record(2, 3, { valid: [true, true, true, false, true, true] })
    await expect(readPredictionFile(file(), 3, true)).rejects.toThrow(/Missing value at row 2, column 1/)
  })

  it('refuses several reference columns, naming them', async () => {
    io.next = () => record(2, 3, { y: target([{ name: 'a', values: [1, 2] }, { name: 'b', values: [3, 4] }]) })
    await expect(readPredictionFile(file(), 3, true)).rejects.toThrow(/2 reference columns \(a, b\)/)
  })
})

describe('readReferenceFile (nirs4all-io)', () => {
  it('joins the reference file positionally to the SAME prediction matrix and returns its labels', async () => {
    io.width = 4
    io.next = () => record(3, 3, { headers: ['a', 'b', 'c'], y: target([{ name: 't', values: [9, 9, 9] }]) })
    const input = await readPredictionFile(file(), 3, false)
    io.specs.length = 0
    io.next = (_spec, files) => {
      expect(files.map((f) => f.name)).toEqual(['new-spectra.csv', 'reference.csv'])
      return record(3, 3, { headers: ['a', 'b', 'c'], y: target([{ name: 'conc', values: [1.5, 2.5, 3.5] }]) })
    }
    const labels = await readReferenceFile(input, new File(['1.5\n2.5\n3.5'], 'reference.csv'))
    expect(labels).toEqual(['1.5', '2.5', '3.5'])
    const [, joined] = [io.specs[0].sources![0], io.specs[0].sources![1]]
    expect(joined).toMatchObject({ id: 'reference', role: 'targets', input: 'reference.csv' })
    expect(io.inferenceOptions.at(-1)).toEqual({})
    expect(joined.params!.has_header).toBe(true) // The distinct reference does not inherit the spectra's false choice.
    // io's own target column of the prediction file is not the reference; features are unchanged; the join is positional
    expect(io.specs[0].sources![0].columns).toEqual([{ role: 'features', select: [0, 1, 2] }, { role: 'metadata', select: 3 }])
    expect(io.specs[0].sample_index).toBeUndefined()
    expect('key' in io.specs[0].sources![0]).toBe(false)
  })

  it('refuses a reference file whose rows do not match the prediction rows, keeping both inputs', async () => {
    io.next = () => record(3, 3, { headers: ['a', 'b', 'c'] })
    const input = await readPredictionFile(file(), 3, true)
    io.next = () => record(3, 3, { y: target([{ name: 't', values: [1, 2] }]) })
    await expect(readReferenceFile(input, new File(['1\n2'], 'reference.csv'))).rejects.toThrow(/does not match the prediction rows/)
  })

  it('reports an owner join failure with both files kept unchanged', async () => {
    io.next = () => record(3, 3, { headers: ['a', 'b', 'c'] })
    const input = await readPredictionFile(file(), 3, true)
    io.next = () => { throw new Error('row counts differ') }
    const error = await readReferenceFile(input, new File(['1'], 'reference.csv')).catch((e: unknown) => e) as IoIngestionRefusal
    expect(error).toBeInstanceOf(IoIngestionRefusal)
    expect(error.message).toMatch(/could not join the reference file.*row counts differ.*kept unchanged/)
    expect(error.inputs.map((f) => f.name)).toEqual(['new-spectra.csv', 'reference.csv'])
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

// The former local CSV builder is a TEST ORACLE only (never a runtime path).
describe('oracle dataset column names', () => {
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
