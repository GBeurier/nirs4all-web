// Real data stage powered by the vendored nirs4all-formats + nirs4all-io WASM:
// decode ~58 vendor formats, infer dataset structure (DatasetPlan + DatasetSpec),
// list the reader catalog, validate a DatasetSpec, and materialize X/y for the
// engine. Loaded on demand (dynamic import) so the ~8 MB of WASM is fetched only
// when a non-CSV file is uploaded — the CSV fast-path and the bundled sample never
// pull it, keeping the initial bundle and the offline single-file build lean.
import type { MaterializedDataset, Partition } from '@/engine/types'
import { encodeTarget, inferTaskType } from './dataset'

export interface DecodedFile {
  ok: boolean
  file: string
  records?: SpectralRecord[]
  error?: string
}
export interface SpectralRecord {
  signals?: Record<string, { axis?: { values?: number[]; unit?: string }; values?: number[] }>
  targets?: Record<string, number | string>
  metadata?: { row_index?: number; sample_id?: string; id?: string; partition?: string }
  provenance?: { format?: string; reader?: string }
}
export interface Analysis {
  decoded: DecodedFile[]
  plan: DatasetPlan | null
  readers: { count: number; features: Record<string, boolean> }
}
export interface DatasetPlan {
  overall_score?: number
  structure?: Decision
  signal_type?: Decision
  task_type?: Decision
  axis?: { n?: number; unit?: string; range?: [number, number] }
  warnings?: string[]
  recommendations?: string[]
  resolved_spec?: DatasetSpec | null
  blocked?: boolean
}
interface Decision {
  value?: string
  score?: number
  evidence?: string[]
}
export interface DatasetSpec {
  schema_version?: number
  name?: string
  task_type?: string
  signal_type?: string
  sources?: { id: string; role: string; input: string | string[]; partition?: string }[]
  [k: string]: unknown
}

type FormatsMod = typeof import('@/engine/wasm/formats/nirs4all_formats_wasm.js')
type IoMod = typeof import('@/engine/wasm/io/nirs4all_io_wasm.js')

let modsPromise: Promise<{ formats: FormatsMod; io: IoMod }> | null = null
async function mods() {
  if (!modsPromise) {
    modsPromise = (async () => {
      const formats = await import('@/engine/wasm/formats/nirs4all_formats_wasm.js')
      const io = await import('@/engine/wasm/io/nirs4all_io_wasm.js')
      await formats.default()
      await io.default()
      return { formats, io }
    })()
  }
  return modsPromise
}

export async function analyzeFiles(files: { name: string; bytes: Uint8Array }[]): Promise<Analysis> {
  const { formats, io } = await mods()
  const decoded: DecodedFile[] = []
  const recordSets: { source: string; format: string; records: SpectralRecord[] }[] = []
  for (const f of files) {
    try {
      const records = formats.openBytes(f.name, f.bytes) as SpectralRecord[]
      if (Array.isArray(records) && records.length) {
        decoded.push({ ok: true, file: f.name, records })
        recordSets.push({ source: f.name, format: records[0]?.provenance?.format ?? '', records })
      } else {
        decoded.push({ ok: false, file: f.name, error: 'no records decoded' })
      }
    } catch (e) {
      decoded.push({ ok: false, file: f.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  let plan: DatasetPlan | null = null
  try {
    plan = io.inferDataset(files.map((f) => ({ name: f.name, bytes: f.bytes })), recordSets, {}) as DatasetPlan
  } catch (e) {
    plan = { warnings: [`io inference failed: ${e instanceof Error ? e.message : String(e)}`], resolved_spec: null }
  }
  let readers = { count: 0, features: {} as Record<string, boolean> }
  try {
    const cat = formats.readerCatalog() as unknown[]
    readers = { count: Array.isArray(cat) ? cat.length : 0, features: (formats.features() as Record<string, boolean>) ?? {} }
  } catch {
    /* optional */
  }
  return { decoded, plan, readers }
}

export async function validateSpec(spec: DatasetSpec): Promise<{ ok: boolean; error?: string }> {
  try {
    const { io } = await mods()
    io.validate(JSON.stringify(spec))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// --- materialization (format-agnostic) ---
interface Row {
  file: string
  idx: number
  partition: Partition
  sampleId: string
  realId: boolean // sampleId came from record metadata (not a synthetic file#idx)
  values: number[]
  axis: number[]
  axisUnit: string
  embeddedTarget?: number | string
}

const firstSignal = (r: SpectralRecord) => (r.signals ? Object.values(r.signals)[0] : undefined)
const isTestName = (n: string) => /test|valid|holdout/i.test(n)
const isMetaName = (n: string) => /meta/i.test(n)
const asArray = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])
const baseFile = (n: string) => n.replace(/\.[^.]+$/, '')
const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
const isNumericCell = (v: string) => v != null && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')))
const isIdColumn = (n: string) => /^(sample[_ ]?id|sampleid|sample|id|name|code|ref(erence)?|key|index|.*_id|id_.*)$/i.test(n)

// --- targets read straight from the resolved DatasetSpec (the nirs4all-io path) ---
// Target (y) files are scalar tables, not spectra, so nirs4all-formats refuses to
// decode them. We instead read them as raw CSV with the spec's per-source delimiter
// and align each target value to its X row by sampleId → (joined X file, rowIndex) →
// (partition, rowIndex) — mirroring single-page-WASM's targetPreview().
interface TargetItem {
  key: string
  value: number | string
  partition: string
  sampleId: string
}
interface TargetResolver {
  hasTargets: boolean
  find(sampleId: string, file: string, rowIndex: number, partition: string): TargetItem | null
}

function previewDelimiter(firstLine: string, declared?: string): string {
  if (declared && firstLine.includes(declared)) return declared
  const scored = [';', '\t', ','].map((d) => [d, firstLine.split(d).length - 1] as const).sort((a, b) => b[1] - a[1])
  return scored[0][1] > 0 ? scored[0][0] : ''
}

function parseTargetTable(bytes: Uint8Array, params: { delimiter?: string; has_header?: boolean } = {}): { headers: string[]; rows: Record<string, string>[] } {
  const text = new TextDecoder().decode(bytes)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }
  const delimiter = previewDelimiter(lines[0], params.delimiter)
  const split = (l: string) => (delimiter ? l.split(delimiter).map((s) => unquote(s.trim())) : [unquote(l.trim())])
  const first = split(lines[0])
  const second = lines[1] ? split(lines[1]) : []
  const hasHeader = params.has_header !== false && first.some((c, i) => !isNumericCell(c) && isNumericCell(second[i] ?? ''))
  const headers = hasHeader ? first : first.map((_, i) => (i === 0 ? 'target' : `col_${i + 1}`))
  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows = dataLines.map((l) => {
    const cells = split(l)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h || `col_${i + 1}`] = cells[i] ?? ''))
    return row
  })
  return { headers, rows }
}

function chooseTargetColumns(table: { headers: string[]; rows: Record<string, string>[] }): string[] {
  const named = table.headers.filter((h) => h && !isIdColumn(h))
  const cols = named.length ? named : table.headers.filter(Boolean)
  const numeric = cols.filter((h) => table.rows.some((r) => isNumericCell(r[h])))
  return [...numeric, ...cols.filter((h) => !numeric.includes(h))]
}

/** Build a target resolver from the resolved DatasetSpec + the raw uploaded files. */
function buildTargetResolver(plan: DatasetPlan | null | undefined, rawFiles: { name: string; bytes: Uint8Array }[]): TargetResolver {
  const sources = plan?.resolved_spec?.sources ?? []
  const empty: TargetResolver = { hasTargets: false, find: () => null }
  if (!sources.length || !rawFiles.length) return empty
  const byId = new Map(sources.map((s) => [s.id, s]))
  const fileByName = new Map(rawFiles.map((f) => [f.name, f]))
  const byFileRow = new Map<string, TargetItem>()
  const byPartRow = new Map<string, TargetItem>()
  const bySampleId = new Map<string, TargetItem>()
  const rowKey = (n: string, i: number) => `${n} ${i}`
  let any = false
  for (const src of sources) {
    if (src.role !== 'targets') continue
    for (const input of asArray(src.input)) {
      const file = fileByName.get(input) ?? rawFiles.find((f) => baseFile(f.name) === input)
      if (!file) continue
      const params = (src as { params?: { delimiter?: string; has_header?: boolean } }).params ?? {}
      const table = parseTargetTable(file.bytes, params)
      if (!table.rows.length) continue
      const targetCols = chooseTargetColumns(table)
      if (!targetCols.length) continue
      const idCol = table.headers.find(isIdColumn) ?? ''
      const join = (src as { join?: { right?: string } }).join
      const linked = join?.right ? byId.get(join.right) : undefined
      const linkedInputs = linked ? asArray(linked.input) : []
      const partition = src.partition || linked?.partition || ''
      table.rows.forEach((row, ri) => {
        // first target column wins (one y per sample for v1)
        const col = targetCols[0]
        const raw = row[col]
        if (raw == null || raw.trim() === '') return
        const num = Number(raw.replace(',', '.'))
        const item: TargetItem = { key: col, value: Number.isFinite(num) ? num : raw, partition, sampleId: idCol ? String(row[idCol] ?? '') : '' }
        any = true
        if (item.sampleId) bySampleId.set(item.sampleId, item)
        for (const li of linkedInputs) byFileRow.set(rowKey(li, ri), item)
        if (partition) byPartRow.set(rowKey(partition, ri), item)
      })
    }
  }
  return {
    hasTargets: any,
    find(sampleId, file, rowIndex, partition) {
      if (sampleId && bySampleId.has(sampleId)) return bySampleId.get(sampleId)!
      return (
        byFileRow.get(rowKey(file, rowIndex)) ??
        byFileRow.get(rowKey(baseFile(file), rowIndex)) ??
        byPartRow.get(rowKey(partition, rowIndex)) ??
        null
      )
    },
  }
}

function rowsFrom(
  decoded: DecodedFile[],
  targetFiles: Set<string> | null,
  metaFiles: Set<string>,
): { x: Row[]; yByKey: Map<string, number | string> } {
  const all: Row[] = []
  const widths: number[] = []
  for (const d of decoded) {
    if (!d.ok || !d.records) continue
    for (let i = 0; i < d.records.length; i++) {
      const r = d.records[i]
      const sig = firstSignal(r)
      const values = (sig?.values ?? []).map(Number).filter(Number.isFinite)
      const axis = (sig?.axis?.values ?? []).map(Number).filter(Number.isFinite)
      const idx = Number(r.metadata?.row_index ?? i)
      const partition: Partition = (r.metadata?.partition as Partition) || (isTestName(d.file) ? 'test' : 'train')
      const metaId = r.metadata?.sample_id || r.metadata?.id
      const targets = r.targets ? Object.values(r.targets) : []
      all.push({
        file: d.file,
        idx,
        partition,
        sampleId: metaId || `${d.file}#${idx}`,
        realId: !!metaId,
        values,
        axis,
        axisUnit: sig?.axis?.unit ?? 'index',
        embeddedTarget: targets[0],
      })
      widths.push(values.length)
    }
  }
  // mode spectrum width identifies X; scalar (width 1) rows are target candidates
  const counts = new Map<number, number>()
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1)
  let modeW = 1
  let best = -1
  for (const [w, c] of counts) if (w > 1 && c > best) (best = c), (modeW = w)

  const x = all.filter((r) => r.values.length === modeW && modeW > 1 && !metaFiles.has(r.file) && !(targetFiles?.has(r.file)))
  const yByKey = new Map<string, number | string>()
  for (const r of all) {
    // a row is a target if the spec marks its file as targets, else if it is a
    // lone scalar from a non-metadata file
    const isTarget = targetFiles ? targetFiles.has(r.file) : r.values.length === 1 && !metaFiles.has(r.file)
    if (!isTarget) continue
    const val = r.values.length >= 1 ? r.values[0] : r.embeddedTarget
    if (val == null) continue
    yByKey.set(`${r.partition}#${r.idx}`, val)
    if (r.realId) yByKey.set(r.sampleId, val) // only real ids can match across files
  }
  return { x, yByKey }
}

/**
 * Build a MaterializedDataset from decoded records (vendor formats or CSV via formats).
 * `rawFiles` are the original uploaded bytes — needed because target (y) files are
 * scalar tables that nirs4all-formats won't decode, so their values are read from the
 * resolved DatasetSpec instead (see buildTargetResolver).
 */
export function materialize(
  decoded: DecodedFile[],
  name = 'Uploaded dataset',
  plan?: DatasetPlan | null,
  rawFiles: { name: string; bytes: Uint8Array }[] = [],
): MaterializedDataset {
  const sources = plan?.resolved_spec?.sources ?? []
  const targetFiles = new Set(sources.filter((s) => s.role === 'targets').flatMap((s) => asArray(s.input)))
  const metaFiles = new Set([
    ...sources.filter((s) => s.role === 'metadata').flatMap((s) => asArray(s.input)),
    ...decoded.filter((d) => isMetaName(d.file)).map((d) => d.file),
  ])
  const { x, yByKey } = rowsFrom(decoded, targetFiles.size ? targetFiles : null, metaFiles)
  if (x.length === 0) throw new Error('No spectra found — every decoded file looked like scalar/target data.')
  const targets = buildTargetResolver(plan, rawFiles)
  const nFeatures = x[0].values.length
  const axis = x[0].axis.length === nFeatures ? x[0].axis : x[0].axis.length ? x[0].axis : Array.from({ length: nFeatures }, (_, i) => i)
  const axisUnit = x[0].axisUnit

  const X = new Float64Array(x.length * nFeatures)
  const yRaw = new Float64Array(x.length)
  const labelsRaw: string[] = []
  const partitions: Partition[] = []
  const sampleIds: string[] = []
  for (let i = 0; i < x.length; i++) {
    const r = x[i]
    for (let j = 0; j < nFeatures; j++) X[i * nFeatures + j] = r.values[j] ?? 0
    // prefer an embedded target, then a real shared sample id, then position within
    // partition (decoded scalar rows), then the spec-driven target files (y CSVs that
    // didn't decode as spectra — the common nirs4all X*/Y* folder case)
    const t =
      r.embeddedTarget ??
      (r.realId ? yByKey.get(r.sampleId) : undefined) ??
      yByKey.get(`${r.partition}#${r.idx}`) ??
      targets.find(r.realId ? r.sampleId : '', r.file, r.idx, r.partition)?.value
    const num = t == null || t === '' ? NaN : typeof t === 'number' ? t : Number(String(t).replace(',', '.'))
    yRaw[i] = Number.isFinite(num) ? num : NaN
    labelsRaw.push(t == null ? '' : String(t))
    partitions.push(r.partition)
    sampleIds.push(r.sampleId)
  }

  // targetless spectra are allowed (explore / predict-only); the engine refuses
  // to *train* without targets, so an all-NaN y never silently produces a model.
  const taskType = inferTaskType(Array.from(yRaw), labelsRaw)
  const { y, classes } = encodeTarget(yRaw, labelsRaw, taskType)
  return { X, nSamples: x.length, nFeatures, axis, axisUnit, y, yRaw, labelsRaw, targetName: 'target', taskType, classes, sampleIds, partitions }
}
