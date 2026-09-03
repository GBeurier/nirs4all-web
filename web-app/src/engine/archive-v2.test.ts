import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { importArchiveV2Model, isArchiveV2Model, predictArchiveV2 } from './archive-v2'
import { MainEngine } from './main-engine'
import {
  inspectMethodsArchiveV2Predictors,
  loadArchiveV2Native,
  loadMethodsWasm,
  replayMethodsArchiveV2,
} from './nirs4all-core'
import type { FittedPipeline } from './types'

const fixtureUrl = new URL('./fixtures/archive-v2/multitarget-pls.n4a', import.meta.url)
const pipelineFixtureUrl = new URL('./fixtures/archive-v2/snv-savgol-pls.n4a', import.meta.url)
const X = Float64Array.from([1.5, 0.5, 3.5, 1.5])
const EXPECTED = [
  1.6363636363636365,
  13.272727272727273,
  2.4999999999999996,
  15,
]
const PIPELINE_X = Float64Array.from([2, 3, 5, 7, 11, 16])
const PIPELINE_EXPECTED = [
  1.352456259978931,
  11.528684389968399,
  5.764743613179501,
  18.14711541976925,
]

describe('canonical Archive V2 Web consumer', () => {
  it('replays one native multi-target model in strict and transitional profiles with exact ownership', async () => {
    const bytes = readFileSync(fixtureUrl)
    const native = await loadArchiveV2Native() as {
      ValidatedMethodsArchiveV2: { prototype: { free(): void } }
    }
    const originalArchiveFree = native.ValidatedMethodsArchiveV2.prototype.free
    let archiveFreeCalls = 0
    native.ValidatedMethodsArchiveV2.prototype.free = function countedArchiveFree() {
      archiveFreeCalls += 1
      return originalArchiveFree.call(this)
    }

    const methods = await loadMethodsWasm()
    await methods.loadModule()
    const module = methods.getModule() as {
      ccall(symbol: string, ...args: unknown[]): unknown
    }
    const originalCcall = module.ccall.bind(module)
    const calls = new Map<string, number>()
    module.ccall = (symbol: string, ...args: unknown[]) => {
      calls.set(symbol, (calls.get(symbol) ?? 0) + 1)
      return originalCcall(symbol, ...args)
    }

    try {
      const imported = await importArchiveV2Model(bytes, 'portable-multitarget.n4a')
      expect(imported.name).toBe('portable-multitarget')
      expect(imported.targetName).toBe('protein, moisture')
      expect(imported.model.nFeatures).toBe(2)
      expect(isArchiveV2Model(imported.model)).toBe(true)
      expect(imported.model.state.archiveSha256).toBe(
        '994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa',
      )
      expect(imported.model.state.nativePredictorDescriptor).toMatchObject({
        descriptor_type: 'dagml.native_predictor_descriptor.v1',
        schema_version: 1,
        owner_controller: 'controller:methods.pls',
        format: 'N4MM',
        format_version: 1,
        storage_algorithm: 0,
        dimensions: {
          training_samples: 6,
          n_features: 2,
          n_targets: 2,
          n_components: 1,
        },
      })
      expect(imported.model.state.nativePredictorDescriptor.capabilities & 1).toBe(1)
      expect(imported.model.state.nativePredictorDescriptor.descriptor_fingerprint).toMatch(/^[0-9a-f]{64}$/)
      await expect(inspectMethodsArchiveV2Predictors(bytes)).resolves.toEqual([
        imported.model.state.nativePredictorDescriptor,
      ])

      for (const profile of ['strict-wasm', 'transitional'] as const) {
        const result = await new MainEngine({ profile }).predict(imported.model, X, 2, 2)
        expect(result).toEqual({
          values: Float64Array.from(EXPECTED),
          rows: 2,
          cols: 2,
          sampleIds: ['sample.0', 'sample.1'],
          targetNames: ['protein', 'moisture'],
          engine: 'nirs4all-methods-wasm',
          fallback: false,
          archiveSha256: '994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa',
        })
      }

      const tampered = new Uint8Array(bytes)
      tampered[100] ^= 0x01
      await expect(replayMethodsArchiveV2(tampered, {
        X,
        rows: 2,
        cols: 2,
        sampleIds: ['sample.0', 'sample.1'],
      })).rejects.toThrow(/Core Archive V2 refusal/)

      expect(calls.get('n4m_serialization_inspect_model_v1')).toBe(4)
      expect(calls.get('n4m_model_import_from_buffer')).toBe(2)
      expect(calls.get('n4m_model_predict_alloc')).toBe(2)
      expect(calls.get('n4m_estimators_pls_fit') ?? 0).toBe(0)
      expect(calls.get('n4m_wasm_pls_fit') ?? 0).toBe(0)
      expect(calls.get('n4m_model_destroy')).toBe(2)
      expect(calls.get('n4m_array_free')).toBe(2)
      expect(calls.get('n4m_context_create')).toBe(2)
      expect(calls.get('n4m_context_destroy')).toBe(2)
      expect(archiveFreeCalls).toBe(5)
    } finally {
      module.ccall = originalCcall
      native.ValidatedMethodsArchiveV2.prototype.free = originalArchiveFree
    }
  })

  it('refuses feature mismatch without fallback or mono-target substitution', async () => {
    const imported = await importArchiveV2Model(readFileSync(fixtureUrl))
    await expect(
      new MainEngine({ profile: 'strict-wasm' }).predict(imported.model, Float64Array.from([1, 2, 3]), 1, 3),
    ).rejects.toThrow(/expects 2 features; received 3/)
  })

  it('replays content-bound SNV -> Savitzky-Golay -> PLS from raw features in Methods WASM', async () => {
    const bytes = readFileSync(pipelineFixtureUrl)
    const methods = await loadMethodsWasm()
    await methods.loadModule()
    const module = methods.getModule() as {
      ccall(symbol: string, ...args: unknown[]): unknown
    }
    const originalCcall = module.ccall.bind(module)
    const calls = new Map<string, number>()
    module.ccall = (symbol: string, ...args: unknown[]) => {
      calls.set(symbol, (calls.get(symbol) ?? 0) + 1)
      return originalCcall(symbol, ...args)
    }

    try {
      const native = await loadArchiveV2Native() as {
        ValidatedMethodsArchiveV2: new (payload: Uint8Array) => {
          model_bytes(): Uint8Array
          free(): void
        }
      }
      const validated = new native.ValidatedMethodsArchiveV2(bytes)
      try {
        expect(methods.inspectN4mm(validated.model_bytes()).pipeline).toEqual({
          schemaVersion: 1,
          operatorCount: 2,
          operators: [4, 8],
          savgolWindow: 3,
          savgolPolyDegree: 2,
          savgolDerivative: 0,
          semanticProfile: 1,
          savgolDelta: 1,
          rawNFeatures: 3,
          modelNFeatures: 3,
          fingerprintAlgorithm: 1,
          fingerprint: 0x0293f3863dfaa292n,
          snvAxis: 1,
          snvWithMean: true,
          snvWithStd: true,
          snvDdof: 0,
          savgolMode: 4,
          savgolCval: 0,
        })
      } finally {
        validated.free()
      }

      const imported = await importArchiveV2Model(bytes, 'snv-savgol-pls.n4a')
      expect(imported.model.nFeatures).toBe(3)
      expect(isArchiveV2Model(imported.model)).toBe(true)
      expect(imported.model.state.nativePredictorDescriptor).toMatchObject({
        format_version: 2,
        writer_abi: { major: 2, minor: 5, patch: 0 },
        storage_algorithm: 0,
        capabilities: 11,
        dimensions: {
          training_samples: 6,
          n_features: 3,
          n_targets: 2,
          n_components: 1,
        },
        pipeline: {
          pipeline_type: 'n4m.snv_savgol_smooth.v1',
          schema_version: 1,
          operator_count: 2,
          raw_n_features: 3,
          model_n_features: 3,
          fingerprint_algorithm: 'fnv1a64.v1',
          native_fingerprint: '0293f3863dfaa292',
          savgol_window: 3,
          savgol_poly_degree: 2,
        },
        descriptor_fingerprint: '921ece572b0a508ae172ee48fbd04824c1fdc22c5cad314caf41a1b76a7cb70a',
      })
      await expect(inspectMethodsArchiveV2Predictors(bytes)).resolves.toEqual([
        imported.model.state.nativePredictorDescriptor,
      ])

      const result = await new MainEngine({ profile: 'strict-wasm' })
        .predict(imported.model, PIPELINE_X, 2, 3)
      expect(result).toEqual({
        values: Float64Array.from(PIPELINE_EXPECTED),
        rows: 2,
        cols: 2,
        sampleIds: ['sample.0', 'sample.1'],
        targetNames: ['protein', 'moisture'],
        engine: 'nirs4all-methods-wasm',
        fallback: false,
        archiveSha256: 'ccac47faeeca1d8de493245182bc4a4375d3c487f60f2bfb2b108bddd2339498',
      })
      expect(calls.get('n4m_serialization_inspect_pipeline_v1')).toBe(4)
      expect(calls.get('n4m_model_predict_alloc')).toBe(1)
      expect(calls.get('n4m_transform_snv_transform') ?? 0).toBe(0)
      expect(calls.get('n4m_transform_savitzky_golay_transform') ?? 0).toBe(0)
    } finally {
      module.ccall = originalCcall
    }
  })

  it('refuses a persisted v2 pipeline descriptor whose semantic profile is changed', async () => {
    const imported = await importArchiveV2Model(readFileSync(pipelineFixtureUrl))
    const model = {
      ...imported.model,
      state: {
        ...imported.model.state,
        nativePredictorDescriptor: {
          ...imported.model.state.nativePredictorDescriptor,
          pipeline: {
            ...imported.model.state.nativePredictorDescriptor.pipeline,
            pipeline_type: 'n4m.snv_savgol_smooth.v2',
          },
        },
      },
    } as FittedPipeline

    expect(isArchiveV2Model(model)).toBe(false)
    await expect(
      predictArchiveV2(model as typeof imported.model, PIPELINE_X, 2, 3),
    ).rejects.toThrow(/invalid native preprocessing pipeline descriptor/)
  })

  it('refuses a persisted descriptor without the native predict capability', async () => {
    const imported = await importArchiveV2Model(readFileSync(fixtureUrl))
    const model = {
      ...imported.model,
      state: {
        ...imported.model.state,
        nativePredictorDescriptor: {
          ...imported.model.state.nativePredictorDescriptor,
          capabilities: 0,
        },
      },
    } as FittedPipeline

    expect(isArchiveV2Model(model)).toBe(false)
    await expect(
      predictArchiveV2(model as typeof imported.model, X, 2, 2),
    ).rejects.toThrow(/invalid native predictor descriptor contract/)
  })

  it('validates oversized rows before constructing host sample IDs', async () => {
    const imported = await importArchiveV2Model(readFileSync(fixtureUrl))
    const originalArrayFrom = Array.from
    const oversizedRows = new Set([4097, 500_000_000])
    let prematureAllocations = 0
    Array.from = function guardedArrayFrom(arrayLike: ArrayLike<unknown> | Iterable<unknown>, ...args: unknown[]) {
      const length = !Array.isArray(arrayLike) && typeof arrayLike === 'object' && arrayLike !== null
        ? (arrayLike as ArrayLike<unknown>).length
        : undefined
      if (length !== undefined && oversizedRows.has(length)) {
        prematureAllocations += 1
        throw new Error('sample IDs allocated before canonical shape validation')
      }
      return Reflect.apply(originalArrayFrom, Array, [arrayLike, ...args])
    } as typeof Array.from

    try {
      for (const rows of oversizedRows) {
        await expect(
          predictArchiveV2(imported.model, new Float64Array(0), rows, 2),
        ).rejects.toThrow(/bounded WASM matrix contract/)
      }
      expect(prematureAllocations).toBe(0)
    } finally {
      Array.from = originalArrayFrom
    }
  })
})
