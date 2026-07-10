// Build a MaterializedDataset (the engine contract) from uploaded CSV files,
// following the nirs4all convention X_train/X_test + y_train/y_test (+ metadata).
// Task type and class labels are inferred from y. The spectral axis is read from
// the X header when numeric. Vendor formats route through wasm-io.ts instead.
import type { MaterializedDataset, Partition, TaskType } from '@/engine/types'
import { parseCsv } from './csv'

export interface RawFile {
  name: string
  text: string
}

export interface DatasetSummary {
  name: string
  nSamples: number
  nFeatures: number
  nTrain: number
  nTest: number
  axisRange: [number, number]
  axisUnit: string
  taskType: TaskType
  targetName: string
  classes?: { label: string; count: number }[]
  yStats?: { min: number; max: number; mean: number; std: number }
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase()
// `x`/`y` as a delimited token (X_train, x.csv) OR a leading x/y glued to a
// partition word (Xtrain, Ytest, Xcal) — the latter is the common no-underscore
// convention the bare `[^a-z]x[^a-z]` rule misses.
const isX = (n: string) => /(^|[^a-z])x([^a-z]|$)|^x(train|test|cal|val|valid|calib|pred|holdout)|spectr|features?/i.test(baseName(n))
const isY = (n: string) => /(^|[^a-z])y([^a-z]|$)|^y(train|test|cal|val|valid|calib|pred|holdout)|target|label|conc|reference/i.test(baseName(n))
const isMeta = (n: string) => /meta/i.test(baseName(n))
const isTest = (n: string) => /test|valid|holdout/i.test(baseName(n))

export function inferTaskType(yNum: number[], labels: string[] | undefined): TaskType {
  if (labels && labels.some((l) => l !== '' && Number.isNaN(Number(l)))) {
    const uniq = new Set(labels)
    return uniq.size <= 2 ? 'binary' : 'multiclass'
  }
  const vals = yNum.filter((v) => Number.isFinite(v))
  if (vals.length === 0) return 'regression' // no usable target → don't guess classification
  const uniq = new Set(vals.map((v) => Math.round(v * 1e6) / 1e6))
  const allInt = vals.every((v) => Number.isInteger(v))
  if (allInt && uniq.size <= Math.max(2, Math.min(10, vals.length / 5))) {
    return uniq.size <= 2 ? 'binary' : 'multiclass'
  }
  return 'regression'
}

function axisFromHeader(header: string[]): { axis: number[]; unit: string } {
  const nums = header.map((h) => Number(h.replace(',', '.')))
  if (nums.every((n) => Number.isFinite(n)) && nums.length > 1) {
    const start = nums[0]
    const looksIndex = (start === 0 || start === 1) && nums.every((v, i) => i === 0 || Math.abs(v - (start + i)) < 1e-6)
    const mid = (Math.min(start, nums[nums.length - 1]) + Math.max(start, nums[nums.length - 1])) / 2
    // NIR: wavelengths ~700–2600 nm; wavenumbers ~3000–30000 cm⁻¹
    const unit = looksIndex ? 'index' : mid >= 3000 ? 'cm-1' : 'nm'
    return { axis: nums, unit }
  }
  return { axis: header.map((_, i) => i), unit: 'index' }
}

/**
 * Parse a spectra (X) CSV into numeric rows + axis. X files often carry the
 * wavelength axis as a numeric first row with no text header; if so it is taken
 * as the axis, not a sample. Shared by dataset assembly and new-spectra prediction.
 */
export function parseSpectraCsv(text: string): { rows: number[][]; axis: number[]; axisUnit: string } {
  const xc = parseCsv(text)
  let headerCells = xc.header
  let dataRows = xc.rows
  if (!xc.hasHeader && xc.rows.length > 1) {
    const r0 = xc.rows[0]
    const monotonic =
      r0.length > 2 &&
      r0.every((v) => Number.isFinite(v)) &&
      (r0.every((v, i) => i === 0 || v > r0[i - 1]) || r0.every((v, i) => i === 0 || v < r0[i - 1]))
    // only treat row 0 as the wavelength axis if its magnitudes are axis-scale —
    // absorbance spectra stay small (≲10) while wavelength/wavenumber axes are >50
    const maxAbs = Math.max(...r0.map((v) => Math.abs(v)))
    if (monotonic && maxAbs > 50) {
      headerCells = r0.map(String)
      dataRows = xc.rows.slice(1)
    }
  }
  const { axis, unit } = axisFromHeader(headerCells)
  return { rows: dataRows, axis, axisUnit: unit }
}

interface Block {
  X: number[][]
  axis: number[]
  axisUnit: string
  yNum: number[]
  yLabels: string[]
  ids: string[]
  /** raw (string) per-row values of each non-id metadata column, length == X rows */
  meta: { name: string; values: string[] }[]
}

function buildBlock(files: RawFile[], partition: Partition): Block | null {
  const xFile = files.find((f) => isX(f.name) && !isY(f.name))
  if (!xFile) return null
  const { rows: dataRows, axis, axisUnit: unit } = parseSpectraCsv(xFile.text)

  let yNum: number[] = []
  let yLabels: string[] = []
  const yFile = files.find((f) => isY(f.name) && !isX(f.name))
  if (yFile) {
    const yc = parseCsv(yFile.text)
    // y is the first non-id column (or the only column)
    const col = yc.header.length > 1 ? yc.header.length - 1 : 0
    yNum = yc.rows.map((r) => r[col] ?? r[0])
    yLabels = yc.raw.map((r) => r[col] ?? r[0] ?? '')
  } else {
    yNum = dataRows.map(() => NaN)
    yLabels = dataRows.map(() => '')
  }

  let ids = dataRows.map((_, i) => `${partition}-${i}`)
  let meta: { name: string; values: string[] }[] = []
  const metaFile = files.find((f) => isMeta(f.name))
  if (metaFile) {
    const mc = parseCsv(metaFile.text)
    const idCol = mc.header.findIndex((h) => /id|sample|name/i.test(h))
    // Only trust the metadata file if it aligns 1:1 with the spectra rows.
    if (mc.raw.length === dataRows.length) {
      if (idCol >= 0) ids = mc.raw.map((r, i) => r[idCol] || `${partition}-${i}`)
      meta = mc.header
        .map((h, c) => ({ name: h || `col${c + 1}`, idx: c }))
        .filter(({ idx }) => idx !== idCol)
        .map(({ name, idx }) => ({ name, values: mc.raw.map((r) => r[idx] ?? '') }))
    }
  }
  return { X: dataRows, axis, axisUnit: unit, yNum, yLabels, ids, meta }
}

export function buildDataset(files: RawFile[], name = 'Uploaded dataset'): MaterializedDataset {
  const trainFiles = files.filter((f) => !isTest(f.name))
  const testFiles = files.filter((f) => isTest(f.name))
  const train = buildBlock(trainFiles.length ? trainFiles : files, 'train')
  if (!train) throw new Error('No spectra (X) file found. Expected a file with "X" / "spectra" in its name.')
  const test = testFiles.length ? buildBlock(testFiles, 'test') : null

  const blocks = [train, ...(test ? [test] : [])]
  const nFeatures = train.X[0]?.length ?? 0
  if (nFeatures === 0) throw new Error('Spectra file has no columns.')
  // validate shapes before filling typed arrays (no silent NaN padding)
  for (const b of blocks) {
    const bad = b.X.findIndex((r) => r.length !== nFeatures)
    if (bad >= 0) throw new Error(`Inconsistent spectra width: row ${bad + 1} has ${b.X[bad].length} values, expected ${nFeatures}.`)
    if (b.yNum.length !== b.X.length) throw new Error(`Target count (${b.yNum.length}) does not match spectra count (${b.X.length}).`)
  }
  const nSamples = blocks.reduce((a, b) => a + b.X.length, 0)
  const X = new Float64Array(nSamples * nFeatures)
  const yRaw = new Float64Array(nSamples)
  const partitions: Partition[] = []
  const sampleIds: string[] = []
  const labelsRaw: string[] = []
  let row = 0
  for (const b of blocks) {
    const part: Partition = b === train ? 'train' : 'test'
    for (let i = 0; i < b.X.length; i++) {
      for (let j = 0; j < nFeatures; j++) X[row * nFeatures + j] = b.X[i][j]
      yRaw[row] = b.yNum[i]
      partitions.push(part)
      sampleIds.push(b.ids[i])
      labelsRaw.push(b.yLabels[i])
      row++
    }
  }

  const taskType = inferTaskType(Array.from(yRaw), labelsRaw)
  const { y, classes } = encodeTarget(yRaw, labelsRaw, taskType)

  // Per-sample metadata (explore-only): the train block's columns define the
  // schema; concatenate each column's values block-by-block in the SAME row order
  // as X/y (null where a block lacks the column), then classify numeric vs
  // categorical from the non-null cells.
  const schema = train.meta.map((c) => c.name)
  const metadata = schema.length
    ? schema.map((nameCol) => {
        const raw: (string | null)[] = []
        for (const b of blocks) {
          const col = b.meta.find((c) => c.name === nameCol)
          for (let i = 0; i < b.X.length; i++) {
            const v = col?.values[i]
            raw.push(v === undefined || v === '' ? null : v)
          }
        }
        const nonNull = raw.filter((v): v is string => v !== null)
        const numeric = nonNull.length > 0 && nonNull.every((v) => Number.isFinite(Number(v)))
        return numeric
          ? { name: nameCol, kind: 'numeric' as const, values: raw.map((v) => (v === null ? null : Number(v))) }
          : { name: nameCol, kind: 'categorical' as const, values: raw.map((v) => (v === null ? null : String(v))) }
      })
    : undefined

  return {
    X,
    nSamples,
    nFeatures,
    axis: train.axis,
    axisUnit: train.axisUnit,
    y,
    yRaw,
    labelsRaw,
    targetName: 'target',
    taskType,
    classes,
    sampleIds,
    partitions,
    metadata,
  }
}

/** Encode the raw target into the model target (y) + class labels for a task type. */
export function encodeTarget(yRaw: Float64Array, labelsRaw: string[], task: TaskType): { y: Float64Array; classes?: string[] } {
  if (task === 'regression') return { y: Float64Array.from(yRaw), classes: undefined }
  const classes = labelsRaw.map((l, i) => (l !== '' && Number.isNaN(Number(l)) ? l : String(Math.round(yRaw[i]))))
  const vocab = [...new Set(classes)].sort()
  const idx = new Map(vocab.map((v, i) => [v, i]))
  const y = Float64Array.from(classes, (c) => idx.get(c) ?? 0)
  return { y, classes }
}

/** Re-encode a dataset's target when the user overrides the task type. */
export function reencodeTarget(ds: MaterializedDataset, task: TaskType): { y: Float64Array; classes?: string[] } {
  const yRaw = ds.yRaw ?? ds.y
  const labelsRaw = ds.labelsRaw ?? Array.from(ds.y, (v) => String(v))
  return encodeTarget(yRaw, labelsRaw, task)
}

export function summarize(ds: MaterializedDataset): DatasetSummary {
  const nTrain = ds.partitions.filter((p) => p === 'train').length
  const nTest = ds.partitions.filter((p) => p === 'test').length
  const summary: DatasetSummary = {
    name: ds.targetName,
    nSamples: ds.nSamples,
    nFeatures: ds.nFeatures,
    nTrain,
    nTest,
    axisRange: [ds.axis[0] ?? 0, ds.axis[ds.axis.length - 1] ?? 0],
    axisUnit: ds.axisUnit,
    taskType: ds.taskType,
    targetName: ds.targetName,
  }
  if (ds.taskType === 'regression') {
    const vals = Array.from(ds.y).filter(Number.isFinite)
    // a target-less dataset (explore / predict-only) has no finite y — leave
    // yStats undefined rather than emitting Math.min([]) = +Infinity in the UI.
    if (vals.length > 0) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1))
      summary.yStats = { min: Math.min(...vals), max: Math.max(...vals), mean, std }
    }
  } else if (ds.classes) {
    const counts = new Map<string, number>()
    for (const c of ds.classes) counts.set(c, (counts.get(c) ?? 0) + 1)
    summary.classes = [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label))
  }
  return summary
}

/** Subsample spectra rows for plotting (returns row arrays + their partition/target). */
export function spectraForPlot(ds: MaterializedDataset, maxRows = 120): { values: number[]; partition: Partition; target: number }[] {
  const step = Math.max(1, Math.ceil(ds.nSamples / maxRows))
  const out: { values: number[]; partition: Partition; target: number }[] = []
  for (let i = 0; i < ds.nSamples; i += step) {
    out.push({
      values: Array.from(ds.X.subarray(i * ds.nFeatures, (i + 1) * ds.nFeatures)),
      partition: ds.partitions[i],
      target: ds.y[i],
    })
  }
  return out
}
