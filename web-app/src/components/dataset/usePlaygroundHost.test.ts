import { describe, expect, it } from 'vitest'
import { createPreviewGate } from './usePlaygroundHost'

describe('preview response identity', () => {
  it('drops a late result after a dataset/config revision switch, even if request IDs repeat', () => {
    const gate = createPreviewGate()
    gate.start('dataset-a', 'request-1')
    expect(gate.accepts('dataset-a', 'request-1')).toBe(true)
    gate.invalidate()
    expect(gate.accepts('dataset-a', 'request-1')).toBe(false)
    gate.start('dataset-b', 'request-1')
    expect(gate.accepts('dataset-a', 'request-1')).toBe(false)
    expect(gate.accepts('dataset-b', 'request-1')).toBe(true)
  })

  it('drops an older pipeline request and all responses after cancellation', () => {
    const gate = createPreviewGate()
    gate.start('dataset', 'old')
    gate.start('dataset', 'new')
    expect(gate.accepts('dataset', 'old')).toBe(false)
    expect(gate.accepts('dataset', 'new')).toBe(true)
    gate.invalidate()
    expect(gate.accepts('dataset', 'new')).toBe(false)
  })
})
