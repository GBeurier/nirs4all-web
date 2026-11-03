import { describe, expect, it } from 'vitest'
import { nativePlanForVariant } from './native-plan'

describe('native plan variant transport', () => {
  it('preserves exact u64 seeds while narrowing the native variant list', () => {
    const json = '{"campaign":{"root_seed":18446744073709551615},"variants":[{"variant_id":"a","seed":18446744073709551614},{"variant_id":"b","seed":9007199254740993}]}'
    const narrowed = nativePlanForVariant(json, 'b')
    expect(narrowed).toContain('"root_seed":18446744073709551615')
    expect(narrowed).toContain('"seed":9007199254740993')
    expect(JSON.parse(narrowed).variants.map((v: { variant_id: string }) => v.variant_id)).toEqual(['b'])
    expect(() => nativePlanForVariant(json, 'absent')).toThrow(/not found/)
  })
})
