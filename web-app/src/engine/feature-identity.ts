// Column identity of a fitted model (re-audit R09, contract F03). A model trained
// on a dataset whose columns are known — a spectral axis or header names —
// records them in order (`FittedPipeline.features`); predict then refuses an input
// whose named columns differ in content, order or count, instead of accepting a
// same-width permutation. An input without names (no header) is taken by
// position, and the UI says so. Column names are strings without NUL.
//
// This is identity plumbing only: the libn4m backend also hands the names to its
// native role pipeline, which checks them again (methods/n4m.ts).
import type { FeatureIdentity, FittedPipeline, MaterializedDataset } from './types'

/** Canonical name of a header cell: a numeric cell (a spectral axis value) by its
 *  number, so "1000.0" and "1000" name the same column; any other cell trimmed. */
export function columnName(cell: string): string {
  const text = cell.trim()
  const value = Number(text.replace(',', '.'))
  return text !== '' && Number.isFinite(value) ? String(value) : text
}

/** Refuse a column name the native C strings would truncate. */
export function checkColumnNames(names: readonly string[], where: string): void {
  const k = names.findIndex((n) => typeof n !== 'string' || n.includes('\0'))
  if (k >= 0) throw new Error(`${where}: column ${k + 1} has a name that is not a string without NUL characters.`)
}

/** The input columns a model fitted on this dataset records: its header names,
 *  else its spectral axis (values as canonical names). Undefined for an index
 *  axis (anonymous columns) or names that do not identify each column once. */
export function datasetFeatureIdentity(ds: MaterializedDataset): FeatureIdentity | undefined {
  const fromAxis = ds.featureNames === undefined && ds.axisUnit !== 'index'
  const names = ds.featureNames ?? (fromAxis ? ds.axis.map((v) => String(v)) : undefined)
  if (!names || names.length !== ds.nFeatures || new Set(names).size !== names.length) return undefined
  checkColumnNames(names, 'Dataset columns')
  return fromAxis ? { names, axis: [...ds.axis], unit: ds.axisUnit } : { names: [...names] }
}

/** Human description of the fitted columns ("axis 1100 … 2498 nm, 700 columns"). */
export function describeColumns(features: FeatureIdentity): string {
  const n = features.names.length
  const span = n > 1 ? `${features.names[0]} … ${features.names[n - 1]}` : features.names[0]
  return features.axis ? `axis ${span}${features.unit ? ` ${features.unit}` : ''}, ${n} columns` : `columns ${span}, ${n} names`
}

const preview = (names: string[]): string => names.slice(0, 3).map((n) => `"${n}"`).join(', ') + (names.length > 3 ? ', …' : '')

/** Why `input` names different columns than `fitted` (content, order or
 *  count), or null when they are the same columns in the same order. */
export function columnMismatch(fitted: readonly string[], input: readonly string[]): string | null {
  if (fitted.length === input.length && fitted.every((n, i) => n === input[i])) return null
  const inputSet = new Set(input)
  const fittedSet = new Set(fitted)
  const unknown = input.filter((n) => !fittedSet.has(n))
  const missing = fitted.filter((n) => !inputSet.has(n))
  if (unknown.length === 0 && missing.length === 0 && fitted.length === input.length) {
    const k = input.findIndex((n, i) => n !== fitted[i])
    return `the columns are in a different order: column ${k + 1} is "${input[k]}" where the model has "${fitted[k]}"`
  }
  const parts = [`${input.length} columns for ${fitted.length}`]
  if (unknown.length) parts.push(`${unknown.length} not in the model (${preview(unknown)})`)
  if (missing.length) parts.push(`${missing.length} missing (${preview(missing)})`)
  return `the columns differ: ${parts.join('; ')}`
}

/**
 * The predict-time column check. The width must match the model's; when the
 * model records its columns and the input is named, the names must be the same
 * columns in the same order. An unnamed input is positional.
 */
export function checkInputColumns(model: Pick<FittedPipeline, 'nFeatures' | 'features'>, nFeatures: number, names: string[] | undefined): void {
  if (nFeatures !== model.nFeatures) {
    throw new Error(`The input has ${nFeatures} columns but the model was fitted on ${model.nFeatures}.`)
  }
  if (names === undefined) return
  checkColumnNames(names, 'Input columns')
  if (names.length !== nFeatures) throw new Error(`The input has ${names.length} column names for ${nFeatures} columns.`)
  if (!model.features) return
  const why = columnMismatch(model.features.names, names)
  if (why) {
    throw new Error(`The input columns do not match the model's (${describeColumns(model.features)}): ${why}. Provide the columns with the training names, in the training order.`)
  }
}

/** A stored feature identity (imported bundle, saved session), validated
 *  against the model width; throws on a malformed one. */
export function parseFeatureIdentity(value: unknown, nFeatures: number): FeatureIdentity | undefined {
  if (value === undefined) return undefined
  const f = value as FeatureIdentity
  const bad = (why: string): never => {
    throw new Error(`The model's column identity is invalid: ${why}.`)
  }
  if (!f || typeof f !== 'object' || !Array.isArray(f.names)) return bad('no column names')
  if (f.names.length !== nFeatures) bad(`${f.names.length} names for ${nFeatures} features`)
  checkColumnNames(f.names, 'Model columns')
  if (new Set(f.names).size !== f.names.length) bad('duplicate column names')
  if (f.axis !== undefined) {
    if (!Array.isArray(f.axis) || f.axis.length !== nFeatures || !f.axis.every((v, i) => Number.isFinite(v) && String(v) === f.names[i])) {
      bad('the spectral axis does not match the column names')
    }
  }
  if (f.unit !== undefined && typeof f.unit !== 'string') bad('the axis unit is not a string')
  return { names: [...f.names], ...(f.axis ? { axis: [...f.axis] } : {}), ...(f.unit !== undefined ? { unit: f.unit } : {}) }
}
