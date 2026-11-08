// Read a new-spectra file for Predict: the matrix the model scores, the header's column
// names (the engine checks them against the model's fitted columns) and an optional reference
// column. The file is read by nirs4all-io (delimiter, header row, numeric axis, column roles);
// this module keeps no CSV parser. A file io reports as header-less is anonymous: its columns
// are taken by position, which the UI states. The complete io evidence (owner record, spec,
// analysis, input bytes) stays on `retained`.
import { describeColumns } from '@/engine/feature-identity'
import type { FittedPipeline } from '@/engine/types'
import type { PredictionMatrix } from './wasm-io'

export type PredictionInput = PredictionMatrix

async function bytesOf(file: Blob & { name?: string }): Promise<{ name: string; bytes: Uint8Array }> {
  return { name: file.name ?? 'prediction.csv', bytes: new Uint8Array(await file.arrayBuffer()) }
}

/** Read through IO's proposal, or pass an explicit header choice before inference. */
export async function readPredictionFile(file: Blob & { name?: string }, nFeatures: number, hasHeader?: boolean): Promise<PredictionInput> {
  const { readPredictionMatrix } = await import('./wasm-io')
  return readPredictionMatrix(await bytesOf(file), nFeatures, hasHeader)
}

/** Read a separate reference file (one value per prediction row) for an already read matrix. */
export async function readReferenceFile(input: PredictionInput, file: Blob & { name?: string }): Promise<string[]> {
  const { readReferenceColumn } = await import('./wasm-io')
  return readReferenceColumn(input, await bytesOf(file))
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
