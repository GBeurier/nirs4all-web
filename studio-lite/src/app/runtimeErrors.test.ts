import { describe, expect, it } from 'vitest'
import { makeRtError, RtErrorException } from '@/engine/rt'
import { formatRuntimeErrorForUi } from './runtimeErrors'

describe('runtime error presentation', () => {
  it('renders RtErrorException cause and mitigation for the UI', () => {
    const err = new RtErrorException(makeRtError({
      verb: 'run',
      cause: 'runtime_error',
      message: 'forced scheduler failure for runtime UX test',
      mitigation: 'Ran the libn4m chain only when fallback is explicitly allowed.',
      unsupported_capability: 'cancellable_background_compute',
      detail: 'internal worker stack trace',
    }))

    const text = formatRuntimeErrorForUi(err)

    expect(text).toContain('Run refused: Runtime Error')
    expect(text).toContain('forced scheduler failure for runtime UX test')
    expect(text).toContain('Mitigation: Ran the libn4m chain only when fallback is explicitly allowed.')
    expect(text).toContain('Missing capability: Cancellable Background Compute')
    expect(text).not.toContain('internal worker stack trace')
  })

  it('keeps ordinary worker failures as plain messages', () => {
    expect(formatRuntimeErrorForUi(new Error('worker crashed'))).toBe('worker crashed')
    expect(formatRuntimeErrorForUi('raw failure')).toBe('raw failure')
  })
})
