// Historical coefficient-state recognition only. No execution or conversion route.
import { makeRtError, RtErrorException } from './rt'
import type { FittedPipeline } from './types'

export function isPortableCoreModel(model: FittedPipeline): boolean {
  return (model.state as { backendId?: unknown } | null)?.backendId === 'nirs4all-core-wasm'
}

export function portableCoreRefusal(verb: 'predict' | 'export'): RtErrorException {
  return new RtErrorException(makeRtError({
    verb, cause: 'unsupported_capability',
    unsupported_capability: 'legacy_portable_core_coefficients',
    message: `The Web engine refuses to ${verb} historical portable Core coefficient states. Original bytes remain historical data; no conversion or replay is performed.`,
    mitigation: 'Keep the original download. A new owner execution is a separate operation.',
  }))
}
