import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { columnContract, readPredictionFile, readReferenceFile } from './prediction-input'
import { checkInputColumns } from '@/engine/feature-identity'
import { IoIngestionRefusal } from './wasm-io'

it('automatically reads a confident named header using the actual IO proposal', async () => {
  // IO detect_header sees a text first row followed by numeric rows (confidence 1.0).
  const input = await readPredictionFile(new File(['alpha;beta;gamma\n0.1;0.2;0.3\n0.4;0.5;0.6'], 'prediction.csv'), 3)
  expect(input.retained.analysis.plan?.params?.['prediction.csv']?.header_ambiguous).not.toBe(true)
  expect(input.nSamples).toBe(2)
  expect(input.featureNames).toEqual(['alpha', 'beta', 'gamma'])
  expect(Array.from(input.X)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
  expect(input.autoY).toBeNull()
})

it('refuses an ambiguous automatic input using the actual owner diagnostic', async () => {
  // Same unrecognized numeric-row literal as IO's undeclared_header_warning test.
  const error = await readPredictionFile(new File(['0.0465041;0.2\n0.0475041;0.2\n'], 'ambiguous.csv'), 2)
    .catch((e: unknown) => e) as IoIngestionRefusal
  expect(error).toBeInstanceOf(IoIngestionRefusal)
  expect(error.analysis!.plan!.params!['ambiguous.csv'].header_ambiguous).toBe(true)
  const warning = error.analysis!.plan!.warnings!.find((value) => value.includes('header_ambiguous'))
  expect(warning).toContain("file 'ambiguous.csv'")
  expect(warning).toContain('Declare params.has_header=true or params.has_header=false explicitly.')
  expect(error.message).toContain(warning!)
  expect(error.retained).toBeUndefined() // No owner assembly occurred.
})

it('reads all headerless Corn rows positionally and still refuses permuted named columns', async () => {
  const text = readFileSync(new URL('./demo/corn/Xtest.csv', import.meta.url), 'utf8')
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const named = await readPredictionFile(new File([text], 'Xtest.csv'), 700, true)
  const model = { nFeatures: 700, features: { names: named.featureNames! } }
  const input = await readPredictionFile(new File([lines.slice(1).join('\n')], 'Xtest-no-header.csv'), 700, false)
  expect(input.nSamples).toBe(20)
  expect(input.X[0]).toBe(0.0465041)
  expect(input.featureNames).toBeUndefined()
  expect(input.autoY).toBeNull()
  expect(new Uint8Array(input.X.buffer)).toEqual(new Uint8Array(named.X.buffer))
  expect(input.retained.spec.sources![0]).toMatchObject({ role: 'features', params: { has_header: false } })
  expect(() => checkInputColumns(model, input.nFeatures, input.featureNames)).not.toThrow()
  expect(columnContract(model, input.featureNames)).toEqual({ checked: false, message: expect.stringMatching(/no header row.*taken by position/) })
  const reversed = lines.map((line) => line.split(';').reverse().join(';')).join('\n')
  const permuted = await readPredictionFile(new File([reversed], 'Xtest-permuted.csv'), 700, true)
  expect(() => checkInputColumns(model, permuted.nFeatures, permuted.featureNames)).toThrow(/different order/)
})

it('declares prediction roles before IO assembly for generic headerless matrices with optional trailing references', async () => {
  const input = await readPredictionFile(new File(['0.1;0.2;0.3\n0.4;0.5;0.6\n0.7;0.8;0.9'], 'spectra.csv'), 3, false)
  expect([input.nSamples, input.nFeatures, input.featureNames, input.autoY]).toEqual([3, 3, undefined, null])
  expect(Array.from(input.X)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
  const withReference = await readPredictionFile(new File(['0.1;0.2;0.3;10\n0.4;0.5;0.6;20\n0.7;0.8;0.9;30'], 'spectra-reference.csv'), 3, false)
  expect(withReference.nSamples).toBe(3)
  expect(withReference.featureNames).toBeUndefined()
  expect(new Uint8Array(withReference.X.buffer)).toEqual(new Uint8Array(input.X.buffer))
  expect(withReference.autoY).toEqual(['10', '20', '30'])
  expect(withReference.retained.spec.sources![0].columns).toEqual([{ role: 'features', select: [0, 1, 2] }, { role: 'targets', select: 3 }])
})

it('reads a separately configured reference file without inheriting the spectra header choice', async () => {
  const input = await readPredictionFile(new File(['0.1;0.2;0.3\n0.4;0.5;0.6\n0.7;0.8;0.9'], 'spectra.csv'), 3, false)
  const before = new Uint8Array(input.X.buffer).slice()
  expect(await readReferenceFile(input, new File(['protein\n10\n20\n30'], 'reference.csv'))).toEqual(['10', '20', '30'])
  expect(new Uint8Array(input.X.buffer)).toEqual(before)
  await expect(readReferenceFile(input, new File(['protein\n10\n20'], 'reference.csv'))).rejects.toThrow(/row|match|align/i)
})
