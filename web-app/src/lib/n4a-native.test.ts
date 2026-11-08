import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { isArchiveV2Model, type ArchiveV2Model } from '@/engine/archive-v2'
import { loadArchiveV2Native, loadMethodsWasm, openN4aContainer } from '@/engine/nirs4all-core'
import { parseN4aFile } from './n4a'

// Exact accepted frozen Core V1 fixture, never rewritten or fitted here.
// Same directory seam as engine/package2-cohort.test.ts; Root supplies it for the pooled gate.
const fixtures = process.env.NIRS4ALL_WEB_OWNER_FIXTURES
const fixtureSha256 = '631584d0ec1eb332099f8013120de947f06ca5e9b6e89e5ef9f63c343373dc7b'

it.skipIf(!fixtures)('imports the genuine entrypoint-feature Package2 without fitting', async () => {
  const bytes = new Uint8Array(readFileSync(join(fixtures!, 'shared-model.n4a')))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixtureSha256)
  const container = await openN4aContainer(bytes)
  try {
    const manifest = JSON.parse(new TextDecoder().decode(container.manifestBytes()))
    expect(manifest.required_features).toEqual([])
    expect(manifest.entrypoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: 'dag-ml', operation: 'predict-external', root_artifact: 'model', required_features: ['native-methods-package@1'] }),
      expect.objectContaining({ owner: 'dag-ml', operation: 'calibrate-external' }),
    ]))
  } finally {
    container.close()
  }
  const native = await loadArchiveV2Native() as { ValidatedMethodsArchiveV2: {
    with_entrypoint(bytes: Uint8Array, entrypoint: string, memoryBudget: undefined): unknown
  } }
  // Unchanged genuine bytes: Core must reject unknown IDs and the separate calibration operation.
  for (const selected of ['missing-entrypoint', 'calibrate-external']) {
    expect(() => native.ValidatedMethodsArchiveV2.with_entrypoint(bytes, selected, undefined)).toThrow(/selected native entrypoint\/operation is unavailable/)
  }
  const methods = await loadMethodsWasm()
  await methods.loadModule()
  const module = methods.getModule() as { ccall(symbol: string, ...args: unknown[]): unknown }
  const calls = vi.spyOn(module, 'ccall')
  try {
    const loaded = await parseN4aFile(new File([bytes], 'qualified-container.bin'))
    expect(isArchiveV2Model(loaded.model)).toBe(true)
    expect(loaded.model.nFeatures).toBe(7)
    // Core's descriptor for this fixture: N4MM format 3 (writer ABI 2.20) with its native SNV + Savitzky-Golay pipeline.
    const model = loaded.model as ArchiveV2Model
    const descriptor = model.state.nativePredictorDescriptor
    expect(descriptor).toMatchObject({
      owner_controller: 'controller:methods.pls',
      format: 'N4MM',
      format_version: 3,
      writer_abi: { major: 2, minor: 20, patch: 0 },
      capabilities: 11,
      dimensions: { training_samples: 12, n_features: 7, n_targets: 1, n_components: 2 },
      pipeline: { pipeline_type: 'n4m.snv_savgol_smooth.v1', raw_n_features: 7, model_n_features: 7 },
    })
    expect(model.state.targetNames).toEqual(['y'])
    // Format 3 needs writer ABI >= 2.20 and a pipeline exactly when the pipeline capability is set.
    const tamper = (patch: Record<string, unknown>) => ({ ...model, state: { ...model.state, nativePredictorDescriptor: { ...descriptor, ...patch } } })
    expect(isArchiveV2Model(tamper({ writer_abi: { ...descriptor.writer_abi, minor: 19 } }) as typeof model)).toBe(false)
    expect(isArchiveV2Model(tamper({ capabilities: 3 }) as typeof model)).toBe(false)
    const { pipeline: _pipeline, ...withoutPipeline } = descriptor
    expect(isArchiveV2Model({ ...model, state: { ...model.state, nativePredictorDescriptor: withoutPipeline } } as typeof model)).toBe(false)
    expect(isArchiveV2Model(tamper({ format_version: 4 }) as typeof model)).toBe(false)
    expect(calls.mock.calls.some(([symbol]) => symbol === 'n4m_estimators_pls_fit' || symbol === 'n4m_wasm_pls_fit')).toBe(false)
  } finally {
    calls.mockRestore()
  }
})
