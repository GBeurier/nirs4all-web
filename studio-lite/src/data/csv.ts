// Lightweight delimited-text parsing with delimiter/decimal detection. This is
// the CSV fast-path; arbitrary vendor formats go through the nirs4all-formats +
// nirs4all-io WASM hooks (see src/data/wasm-io.ts, wired separately).

export interface ParsedCsv {
  header: string[]
  /** numeric cells (NaN where non-numeric) */
  rows: number[][]
  /** raw string cells (for id/label columns) */
  raw: string[][]
  delimiter: string
  hasHeader: boolean
}

const CANDIDATES = [';', ',', '\t', /\s+/] as const

export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  let best = ','
  let bestCount = 0
  for (const d of [';', ',', '\t']) {
    const count = line.split(d).length
    if (count > bestCount) (bestCount = count), (best = d)
  }
  // fall back to whitespace-delimited if no common delimiter found
  if (bestCount <= 1 && line.trim().split(/\s+/).length > 1) return ' '
  return best
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/)
  return line.split(delimiter).map((c) => c.trim())
}

/** Parse a number, tolerating comma decimals when not used as the delimiter. */
function toNum(cell: string, commaDecimal: boolean): number {
  if (cell === '' || cell == null) return NaN
  const s = commaDecimal ? cell.replace(',', '.') : cell
  const v = Number(s)
  return Number.isNaN(v) ? NaN : v
}

export function parseCsv(text: string, opts: { delimiter?: string } = {}): ParsedCsv {
  const delimiter = opts.delimiter ?? detectDelimiter(text)
  const commaDecimal = delimiter !== ','
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { header: [], rows: [], raw: [], delimiter, hasHeader: false }

  const first = splitLine(lines[0], delimiter)
  // header if the first row has any non-numeric cell while a later row is numeric
  const firstNumeric = first.every((c) => !Number.isNaN(toNum(c, commaDecimal)))
  const secondNumeric =
    lines.length > 1 && splitLine(lines[1], delimiter).some((c) => !Number.isNaN(toNum(c, commaDecimal)))
  const hasHeader = !firstNumeric && secondNumeric

  const header = hasHeader ? first : first.map((_, i) => String(i))
  const body = hasHeader ? lines.slice(1) : lines
  const raw: string[][] = []
  const rows: number[][] = []
  for (const line of body) {
    const cells = splitLine(line, delimiter)
    raw.push(cells)
    rows.push(cells.map((c) => toNum(c, commaDecimal)))
  }
  return { header, rows, raw, delimiter, hasHeader }
}
