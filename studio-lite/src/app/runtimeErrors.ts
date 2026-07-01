import { isRtErrorException, type RtError } from '@/engine/rt'

function formatToken(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatRtError(error: RtError): string {
  const title = `${formatToken(error.verb)} refused: ${formatToken(error.cause)}`
  const lines = [title, error.message]
  if (error.mitigation) lines.push(`Mitigation: ${error.mitigation}`)
  if (error.unsupported_capability) lines.push(`Missing capability: ${formatToken(error.unsupported_capability)}`)
  return lines.join('\n')
}

export function formatRuntimeErrorForUi(error: unknown): string {
  if (isRtErrorException(error)) return formatRtError(error.rtError)
  if (error instanceof Error) return error.message
  return String(error)
}
