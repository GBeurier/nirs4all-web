import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { importArchiveV2Model, isArchiveV2Model, predictArchiveV2 } from './archive-v2'
import { MainEngine } from './main-engine'
import { loadArchiveV2Native, loadMethodsWasm, replayMethodsArchiveV2 } from './nirs4all-core'

const fixtureUrl = new URL('./fixtures/archive-v2/multitarget-pls.n4a', import.meta.url)
const X = Float64Array.from([1.5, 0.5, 3.5, 1.5])
const EXPECTED = [
  1.6363636363636365,
  13.272727272727273,
  2.4999999999999996,
  15,
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
      expect(isArchiveV2Model(imported.model)).toBe(true)
      expect(imported.model.state.archiveSha256).toBe(
        '994252030ff80129d0431995bae53eb473082f05825b65714379262b72af13fa',
      )

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

      expect(calls.get('n4m_serialization_inspect')).toBe(2)
      expect(calls.get('n4m_model_import_from_buffer')).toBe(2)
      expect(calls.get('n4m_model_predict_alloc')).toBe(2)
      expect(calls.get('n4m_estimators_pls_fit') ?? 0).toBe(0)
      expect(calls.get('n4m_wasm_pls_fit') ?? 0).toBe(0)
      expect(calls.get('n4m_model_destroy')).toBe(2)
      expect(calls.get('n4m_array_free')).toBe(2)
      expect(calls.get('n4m_context_create')).toBe(2)
      expect(calls.get('n4m_context_destroy')).toBe(2)
      expect(archiveFreeCalls).toBe(3)
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
          predictArchiveV2(imported.model, new Float64Array(0), rows, 1),
        ).rejects.toThrow(/bounded WASM matrix contract/)
      }
      expect(prematureAllocations).toBe(0)
    } finally {
      Array.from = originalArrayFrom
    }
  })
})
