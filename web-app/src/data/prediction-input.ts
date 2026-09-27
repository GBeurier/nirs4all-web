// Read a new-spectra CSV for Predict: the matrix the model scores, the header's
// column names (the engine checks them against the model's fitted columns) and
// an optional trailing reference-Y column. A file without a header row is
// anonymous: its columns are taken by position, which the UI states.
import { describeColumns } from '@/engine/feature-identity'
import type { FittedPipeline } from '@/engine/types'
import { parseCsv } from './csv'
import { parseSpectraCsv } from './dataset'

export interface PredictionInput {
  X: Float64Array
  nSamples: number
  nFeatures: number
  /** the header's names of the model's columns; absent: positional input */
  featureNames?: string[]
  /** an extra trailing column (nFeatures + 1) read as the reference Y, raw cells */
  autoY: string[] | null
}

export function readPredictionCsv(text: string, nFeatures: number): PredictionInput {
  // parseSpectraCsv takes a numeric wavelength header row as the axis (matches dataset assembly)
  const parsed = parseSpectraCsv(text)
  const rows = parsed.rows
  if (rows.length === 0) throw new Error('No data rows found in the file.')
  const cols = rows[0].length
  // an extra trailing column (nFeatures + 1) is interpreted as the reference Y
  const hasAutoY = cols === nFeatures + 1
  if (cols !== nFeatures && !hasAutoY) {
    throw new Error(`Column count mismatch: the file has ${cols} columns but the model expects ${nFeatures} features${cols === nFeatures + 2 ? '' : ' (or ' + (nFeatures + 1) + ' with a trailing Y column)'}.`)
  }
  const names = parsed.columnNames
  if (names && names.length !== cols) throw new Error(`The header row has ${names.length} names but the data rows have ${cols} columns.`)
  const nSamples = rows.length
  const X = new Float64Array(nSamples * nFeatures)
  const autoY: string[] | null = hasAutoY ? new Array(nSamples) : null
  // raw string cells aligned to the data rows — offset by 1 when parseSpectraCsv took a wavelength row as the header
  const pcForRaw = hasAutoY ? parseCsv(text) : null
  const rawOffset = pcForRaw ? pcForRaw.rows.length - rows.length : 0
  const rawCells = pcForRaw?.raw ?? null
  for (let i = 0; i < nSamples; i++) {
    const row = rows[i]
    if (row.length !== cols) throw new Error(`Row ${i + 1} has ${row.length} columns, expected ${cols}.`)
    for (let j = 0; j < nFeatures; j++) {
      const v = row[j]
      if (!Number.isFinite(v)) throw new Error(`Non-numeric value at row ${i + 1}, column ${j + 1}.`)
      X[i * nFeatures + j] = v
    }
    if (autoY) {
      // prefer the raw string (preserves class labels)
      const raw = rawCells?.[i + rawOffset]?.[nFeatures]
      autoY[i] = (raw ?? String(row[nFeatures])).trim()
    }
  }
  return { X, nSamples, nFeatures, ...(names ? { featureNames: names.slice(0, nFeatures) } : {}), autoY }
}

/** How the input's columns meet the model's: checked by name and order, or
 *  taken by position (and why). */
export function columnContract(model: Pick<FittedPipeline, 'features' | 'nFeatures'>, featureNames: string[] | undefined): { checked: boolean; message: string } {
  if (!model.features) {
    return {
      checked: false,
      message: `This model records no column names (index axis or older bundle): the ${model.nFeatures} columns are taken by position and their order is not checked.`,
    }
  }
  const columns = describeColumns(model.features)
  if (!featureNames) {
    return {
      checked: false,
      message: `This file has no header row: its ${model.nFeatures} columns are taken by position as the model's ${columns}. Their order is not checked; include the header row to have it checked.`,
    }
  }
  return { checked: true, message: `Columns checked by name and order against the model's ${columns}.` }
}
