// Real data stage powered by the vendored nirs4all-formats + nirs4all-io WASM:
// decode ~58 vendor formats, infer dataset structure (DatasetPlan + DatasetSpec),
// list the reader catalog, validate a DatasetSpec, and materialize X/y for the
// engine. Loaded on demand (dynamic import) so the ~8 MB of WASM is fetched only
// when a non-CSV file is uploaded — the CSV fast-path and the bundled sample never
// pull it, keeping the initial bundle and the offline single-file build lean.
import type { MaterializedDataset, Partition } from '@/engine/types'
import { loadDataIoWasm } from '@/engine/nirs4all-lite'
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
    modsPromise = loadDataIoWasm()
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

// --- materialization is a BACKEND capability: nirs4all-io (Rust → WASM) assembles
// X/y from the decoded records + the resolved DatasetSpec, fs-free. The old
// per-row target-alignment heuristics that used to live here moved into
// nirs4all-io-core::materialize::assemble_in_memory (roles, joins, partitions are
// the io layer's job, not the browser's). studio only maps io's AssembledDataset
// onto the engine's MaterializedDataset + applies the shared task-type/encode step.

/** AssembledDataset.to_full_value() as returned by io's `assembleDataset`. */
interface IoMatrix {
  data: number[]
  n_rows: number
  n_cols: number
}
interface IoBlock {
  n_samples: number
  x: IoMatrix[]
  feature_headers: string[][]
  header_units: string[]
  signal_types: (string | null)[]
  y: IoMatrix | null
  y_headers: string[]
  y_categorical?: Record<string, { categories?: string[] }>
  metadata: { n_rows: number; columns: { name: string; values: (number | string | null)[] }[] } | null
  weights: number[] | null
  weights_header: string | null
}
export interface AssembledFull {
  name: string
  task_type: string
  signal_type: string
  n_sources: number
  blocks: Record<string, IoBlock>
  folds: [number[], number[]][]
}

const ID_COL = /^(sample[_ ]?id|sampleid|sample|id|name|code|ref(erence)?|key)$/i
function metaIdColumn(b: IoBlock): (number | string | null)[] | null {
  const col = (b.metadata?.columns ?? []).find((c) => ID_COL.test(c.name))
  return col ? col.values : null
}
const toPartition = (name: string): Partition =>
  /test|valid|holdout/i.test(name) ? 'test' : /predict|infer|unknown/i.test(name) ? 'predict' : 'train'

/**
 * Map io's `AssembledDataset` (per-partition feature/target blocks) onto the
 * engine's `MaterializedDataset`. Pure data shaping — no NIRS/IO logic (that ran
 * in nirs4all-io). Uses the first feature source (studio v1 is single-source);
 * y is the first target column, with class labels recovered from `y_categorical`.
 * Task-type + class encoding stay on the shared `inferTaskType`/`encodeTarget`.
 */
export function mapAssembledToMaterialized(full: AssembledFull): MaterializedDataset {
  const parts = Object.keys(full.blocks ?? {})
  if (!parts.length) throw new Error('nirs4all-io returned no partitions to assemble.')
  const first = full.blocks[parts[0]]
  const x0 = first.x?.[0]
  if (!x0 || !x0.n_cols) throw new Error('No spectra found — nirs4all-io assembled no feature matrix.')
  const nFeatures = x0.n_cols
  const headers = first.feature_headers?.[0] ?? []
  const axisNums = headers.map(Number)
  const axis = axisNums.length === nFeatures && axisNums.every((v) => Number.isFinite(v)) ? axisNums : Array.from({ length: nFeatures }, (_, i) => i)
  const axisUnit = first.header_units?.[0] || 'index'
  const targetName = first.y_headers?.[0] ?? 'target'

  let nSamples = 0
  for (const p of parts) nSamples += full.blocks[p].x?.[0]?.n_rows ?? 0
  if (nSamples === 0) throw new Error('No spectra found — every assembled partition was empty.')

  const X = new Float64Array(nSamples * nFeatures)
  const yRaw = new Float64Array(nSamples)
  const labelsRaw: string[] = []
  const partitions: Partition[] = []
  const sampleIds: string[] = []
  let off = 0
  for (const p of parts) {
    const b = full.blocks[p]
    const xm = b.x?.[0]
    if (!xm || xm.n_rows === 0) continue
    if (xm.n_cols !== nFeatures) throw new Error(`nirs4all-io partition "${p}" has ${xm.n_cols} features, expected ${nFeatures}.`)
    const rows = xm.n_rows
    X.set(Float64Array.from(xm.data.slice(0, rows * nFeatures)), off * nFeatures)
    const part = toPartition(p)
    const idCol = metaIdColumn(b)
    const cats = b.y_categorical && Object.keys(b.y_categorical).length ? Object.values(b.y_categorical)[0]?.categories ?? null : null
    const yCols = b.y?.n_cols ?? 0
    for (let r = 0; r < rows; r++) {
      partitions.push(part)
      sampleIds.push(idCol && idCol[r] != null ? String(idCol[r]) : `${p}#${r}`)
      if (b.y && yCols > 0) {
        const v = b.y.data[r * yCols] // first target column
        yRaw[off + r] = v
        labelsRaw.push(cats ? cats[Math.round(v)] ?? String(v) : Number.isFinite(v) ? String(v) : '')
      } else {
        yRaw[off + r] = NaN
        labelsRaw.push('')
      }
    }
    off += rows
  }

  // per-sample metadata (explore-only): non-id columns nirs4all-io already parsed,
  // aligned to X's row order (same partition iteration, same empty-block skip).
  const metaSchema: string[] = []
  for (const p of parts) {
    for (const c of full.blocks[p].metadata?.columns ?? []) {
      if (!ID_COL.test(c.name) && !metaSchema.includes(c.name)) metaSchema.push(c.name)
    }
  }
  const metadata = metaSchema.length
    ? metaSchema.map((nameCol) => {
        const vals: (number | string | null)[] = []
        for (const p of parts) {
          const b = full.blocks[p]
          const xm = b.x?.[0]
          if (!xm || xm.n_rows === 0) continue
          const col = (b.metadata?.columns ?? []).find((c) => c.name === nameCol)
          for (let r = 0; r < xm.n_rows; r++) vals.push(col ? col.values[r] ?? null : null)
        }
        const nonNull = vals.filter((v): v is number | string => v !== null)
        const numeric = nonNull.length > 0 && nonNull.every((v) => Number.isFinite(Number(v)))
        return numeric
          ? { name: nameCol, kind: 'numeric' as const, values: vals.map((v) => (v === null ? null : Number(v))) }
          : { name: nameCol, kind: 'categorical' as const, values: vals.map((v) => (v === null ? null : String(v))) }
      })
    : undefined

  // targetless spectra are allowed (explore / predict-only); the engine refuses
  // to train without targets, so an all-NaN y never silently produces a model.
  const taskType = inferTaskType(Array.from(yRaw), labelsRaw)
  const { y, classes } = encodeTarget(yRaw, labelsRaw, taskType)
  return { X, nSamples, nFeatures, axis, axisUnit, y, yRaw, labelsRaw, targetName, taskType, classes, sampleIds, partitions, metadata }
}

/**
 * Assemble decoded records + uploaded tables into a `MaterializedDataset` via
 * nirs4all-io's fs-free `assembleDataset` (Rust → WASM). Decoded vendor records
 * are passed as record sets; files io reads itself (CSV y/metadata tables that
 * didn't decode as spectra) are passed as bytes. The resolved DatasetSpec
 * (`plan.resolved_spec`) drives roles/joins/partitions inside io.
 */
export async function assembleDataset(
  decoded: DecodedFile[],
  plan: DatasetPlan | null | undefined,
  files: { name: string; bytes: Uint8Array }[],
): Promise<MaterializedDataset> {
  const spec = plan?.resolved_spec
  if (!spec) throw new Error('nirs4all-io produced no DatasetSpec to assemble — check the uploaded files.')
  const { io } = await mods()
  const okNames = new Set(decoded.filter((d) => d.ok && d.records?.length).map((d) => d.file))
  const recordSets = decoded.filter((d) => d.ok && d.records?.length).map((d) => ({ source: d.file, records: d.records! }))
  const byteFiles = files.filter((f) => !okNames.has(f.name)).map((f) => ({ name: f.name, bytes: f.bytes }))
  const full = io.assembleDataset(byteFiles, recordSets, JSON.stringify(spec)) as AssembledFull
  return mapAssembledToMaterialized(full)
}
