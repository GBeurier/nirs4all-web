import { describe, expect, it } from 'vitest'
import { AOM_DEFAULT_BANK } from '@/catalog/types'
import { operatorBank } from './backends'

describe('operatorBank', () => {
  it('filters disabled AOM operator kinds and keeps the rest stable', () => {
    expect(operatorBank([0, 16, 10])).toEqual([0, 10])
  })

  it('falls back to the default bank when only disabled values were selected', () => {
    expect(operatorBank([16])).toEqual(AOM_DEFAULT_BANK)
  })
})
