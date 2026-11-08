import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseN4aFile } from '@/lib/n4a'
import { isArchiveV2Model, predictArchiveV2 } from './archive-v2'
import { MainEngine } from './main-engine'
import { loadMethodsWasm } from './nirs4all-core'
import type { FittedPipeline } from './types'

// The accepted genuine Core V1 Package2 scenario (SNV + Savitzky-Golay + PLS, width 7) opened
// through the Core container route and replayed by the one staged Methods build. Nothing is fitted
// or generated here: the recorded owner predictions are the reference, within the existing
// CPU-to-WASM tolerance. Root points NIRS4ALL_WEB_OWNER_FIXTURES at the directory holding
// shared-model.n4a, independent.json (.x 12x7, .sample_ids) and shared-prediction.json
// (.point_prediction.values / .target_names); without it the cohort is not run (explicit skip).
const dir = process.env.NIRS4ALL_WEB_OWNER_FIXTURES
const TOLERANCE = 1e-10 // Core conformal-native.test.js CPU-to-WASM tolerance
const WIDTH = 7

describe.skipIf(!dir)('genuine Core V1 Package2 cohort (Web host route)', () => {
  const read = (name: string) => readFileSync(join(dir!, name))
  const rows: number[][] = dir ? JSON.parse(read('independent.json').toString()).x : []
  const expected: number[] = dir ? JSON.parse(read('shared-prediction.json').toString()).point_prediction.values.map((row: number[]) => row[0]) : []
  const flatten = (order: number[]) => Float64Array.from(order.flatMap((i) => rows[i]))
  const open = async () => {
    const loaded = await parseN4aFile(new File([new Uint8Array(read('shared-model.n4a'))], 'shared-model.n4a'))
    if (!isArchiveV2Model(loaded.model)) throw new Error('the cohort archive was not opened as a native Package2 model')
    return loaded.model
  }
  const engine = new MainEngine({ profile: 'strict-wasm' })

  it('opens through the Core container route as a native Package2 of the recorded width', async () => {
    const model = await open()
    expect(model.nFeatures).toBe(WIDTH)
    expect(rows).toHaveLength(12)
    expect(rows.every((row) => row.length === WIDTH)).toBe(true)
  })

  it('predicts every recorded owner output within the Methods tolerance, without a fallback', async () => {
    const model = await open()
    const result = await engine.predict(model, flatten(rows.map((_, i) => i)), rows.length, WIDTH)
    expect(result.fallback).toBe(false)
    expect(result.engine).toBe('nirs4all-methods-wasm')
    expect(result.rows).toBe(rows.length)
    result.values.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThan(TOLERANCE))
  })

  it('is row-order independent: a reversed and repeated batch reproduces each row of the recorded output', async () => {
    const model = await open()
    const order = [...rows.keys()].reverse().concat([3, 3, 0])
    const result = await engine.predict(model, flatten(order), order.length, WIDTH)
    order.forEach((source, i) => expect(Math.abs(result.values[i] - expected[source])).toBeLessThan(TOLERANCE))
  })

  it('refuses a width mismatch instead of padding or truncating', async () => {
    const model = await open()
    await expect(engine.predict(model, Float64Array.from(rows[0].slice(0, WIDTH - 1)), 1, WIDTH - 1)).rejects.toThrow(/expects 7 features; received 6/)
  })

  it('replays from raw features in Methods WASM: the stored N4MM owns the preprocessing and nothing is fitted', async () => {
    const model = await open()
    const descriptor = model.state.nativePredictorDescriptor
    expect(descriptor).toMatchObject({ descriptor_type: 'dagml.native_predictor_descriptor.v1', format: 'N4MM', dimensions: { n_features: WIDTH, n_targets: 1 } })
    expect(descriptor.capabilities & 1).toBe(1)
    const methods = await loadMethodsWasm()
    await methods.loadModule()
    const module = methods.getModule() as { ccall(symbol: string, ...args: unknown[]): unknown }
    const original = module.ccall.bind(module)
    const calls = new Map<string, number>()
    module.ccall = (symbol: string, ...args: unknown[]) => {
      calls.set(symbol, (calls.get(symbol) ?? 0) + 1)
      return original(symbol, ...args)
    }
    try {
      await engine.predict(model, flatten(rows.map((_, i) => i)), rows.length, WIDTH)
    } finally {
      module.ccall = original
    }
    expect(calls.get('n4m_model_predict_alloc')).toBe(1)
    expect(calls.get('n4m_estimators_pls_fit') ?? 0).toBe(0)
    expect(calls.get('n4m_wasm_pls_fit') ?? 0).toBe(0)
    expect(calls.get('n4m_transform_snv_transform') ?? 0).toBe(0) // preprocessing is inside the stored model
  })

  it('refuses a persisted descriptor without the native predict capability', async () => {
    const model = await open()
    const tampered = {
      ...model,
      state: { ...model.state, nativePredictorDescriptor: { ...model.state.nativePredictorDescriptor, capabilities: 0 } },
    } as FittedPipeline
    expect(isArchiveV2Model(tampered)).toBe(false)
    await expect(predictArchiveV2(tampered as typeof model, flatten([0]), 1, WIDTH)).rejects.toThrow(/invalid native predictor descriptor contract/)
  })

  it('refuses a persisted pipeline descriptor whose semantic profile is changed', async () => {
    const model = await open()
    const { pipeline } = model.state.nativePredictorDescriptor
    expect(pipeline).toBeDefined() // the cohort model carries its native SNV + Savitzky-Golay pipeline
    const tampered = {
      ...model,
      state: { ...model.state, nativePredictorDescriptor: { ...model.state.nativePredictorDescriptor, pipeline: { ...pipeline, pipeline_type: 'n4m.snv_savgol_smooth.v2' } } },
    } as FittedPipeline
    expect(isArchiveV2Model(tampered)).toBe(false)
    await expect(predictArchiveV2(tampered as typeof model, flatten([0]), 1, WIDTH)).rejects.toThrow(/invalid native preprocessing pipeline descriptor/)
  })

  it('refuses a data length that disagrees with a large declared shape before constructing host sample IDs', async () => {
    // Core imposes no intrinsic row ceiling: only the declared shape against the supplied data decides.
    const model = await open()
    const originalArrayFrom = Array.from
    const largeRows = new Set([4097, 500_000_000])
    let prematureAllocations = 0
    Array.from = function guardedArrayFrom(arrayLike: ArrayLike<unknown> | Iterable<unknown>, ...args: unknown[]) {
      const length = !Array.isArray(arrayLike) && typeof arrayLike === 'object' && arrayLike !== null
        ? (arrayLike as ArrayLike<unknown>).length
        : undefined
      if (length !== undefined && largeRows.has(length)) {
        prematureAllocations += 1
        throw new Error('sample IDs allocated before canonical shape validation')
      }
      return Reflect.apply(originalArrayFrom, Array, [arrayLike, ...args])
    } as typeof Array.from
    try {
      for (const count of largeRows) {
        await expect(predictArchiveV2(model, new Float64Array(0), count, WIDTH)).rejects.toThrow()
      }
      expect(prematureAllocations).toBe(0)
    } finally {
      Array.from = originalArrayFrom
    }
  })
})
