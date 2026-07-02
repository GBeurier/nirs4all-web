import { formatRuntimeRefusalText } from 'nirs4all-ui/runtime'
import { isRtErrorException, type RtError } from '@/engine/rt'

/** Render the typed rt_error.v1 envelope through the shared nirs4all-ui
 *  refusal formatter, so Studio and Web present refusals identically. */
function formatRtError(error: RtError): string {
  return formatRuntimeRefusalText({
    verb: error.verb,
    cause: error.cause,
    message: error.message,
    mitigation: error.mitigation ?? null,
    unsupportedCapability: error.unsupported_capability ?? null,
  })
}

export function formatRuntimeErrorForUi(error: unknown): string {
  if (isRtErrorException(error)) return formatRtError(error.rtError)
  if (error instanceof Error) return error.message
  return String(error)
}
