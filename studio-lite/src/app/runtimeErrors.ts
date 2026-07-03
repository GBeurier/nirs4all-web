import { formatRuntimeTokenLabel, normalizeRuntimeDiagnostics } from 'nirs4all-ui/runtime'
import { isRtErrorException, type RtError } from '@/engine/rt'

/** Render the typed rt_error.v1 envelope through the shared nirs4all-ui
 *  refusal formatter, so Studio and Web present refusals identically. */
function formatRtError(error: RtError): string {
  const diagnostic = normalizeRuntimeDiagnostics({
    diagnostics: [{
      verb: error.verb,
      cause: error.cause,
      message: error.message,
      mitigation: error.mitigation ?? null,
    }],
  })[0]
  const verb = formatRuntimeTokenLabel(diagnostic?.verb ?? error.verb)
  const cause = formatRuntimeTokenLabel(diagnostic?.cause ?? error.cause)
  const lines = [`${verb} refused: ${cause}`, diagnostic?.message ?? error.message]

  const mitigation = diagnostic?.mitigation ?? error.mitigation
  if (mitigation) lines.push(`Mitigation: ${mitigation}`)
  if (error.unsupported_capability) {
    lines.push(`Missing capability: ${formatRuntimeTokenLabel(error.unsupported_capability)}`)
  }

  return lines.join('\n')
}

export function formatRuntimeErrorForUi(error: unknown): string {
  if (isRtErrorException(error)) return formatRtError(error.rtError)
  if (error instanceof Error) return error.message
  return String(error)
}
