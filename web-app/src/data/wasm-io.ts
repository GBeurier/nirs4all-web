import { isRelationColumn, metadataRelations } from '@/engine/relations'
// Real data stage powered by the vendored nirs4all-formats + nirs4all-io WASM:
// decode ~58 vendor formats, infer dataset structure (DatasetPlan + DatasetSpec),
// list the reader catalog, validate a DatasetSpec, and materialize X/y for the
// engine. Loaded on demand (dynamic import) so the ~8 MB of WASM is fetched only
// when a dataset is ingested, keeping the initial bundle and the offline
// single-file build lean. Delimited text (CSV/TSV/TXT) is read by nirs4all-io
// itself: Web keeps no local assembler or parser for it.
import { IO_RECORD, type DatasetTarget, type MaterializedDataset, type Partition } from '@/engine/types'
import { loadDataIoWasm } from '@/engine/nirs4all-core'
import { columnName } from '@/engine/feature-identity'
import { numericCoordinates } from '@/engine/wasm/io/numeric-wire'
import type { AssembledAxis } from '@/engine/wasm/io/types/nirs4all-io'
import { selectDatasetTarget } from './targets'

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
  /** Per-input owner diagnostics, never loading settings. */
  params?: Record<string, { header_ambiguous?: boolean }>
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
  sources?: { id: string; role: string; input: string | string[]; partition?: string; columns?: { role: string; select: unknown }[]; params?: Record<string, unknown>; key?: unknown }[]
  [k: string]: unknown
}

/** Name the feature source declared by io, regardless of uploaded file order. */
export function datasetSpecInputName(plan: DatasetPlan | null | undefined): string | undefined {
  const input = plan?.resolved_spec?.sources?.find((source) => source.role === 'features')?.input
  return Array.isArray(input) ? input[0] : input
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

/** Delimited text is read by nirs4all-io itself (as bytes); only other files go through Formats. */
const TABULAR_TEXT = /\.(csv|tsv|txt)$/i

export async function analyzeFiles(files: { name: string; bytes: Uint8Array }[], options: { file_params?: Record<string, { has_header: boolean }> } = {}): Promise<Analysis> {
  const { formats, io } = await mods()
  const decoded: DecodedFile[] = []
  const recordSets: { source: string; format: string; records: SpectralRecord[] }[] = []
  for (const f of files) {
    if (TABULAR_TEXT.test(f.name)) continue
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
    plan = io.inferDataset(files.map((f) => ({ name: f.name, bytes: f.bytes })), recordSets, options) as DatasetPlan
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
// X/y from the decoded records + the resolved DatasetSpec, fs-free. Roles, joins,
// partitions and identity are the io layer's job, not the browser's. Web maps io's
// AssembledDataset onto the engine's MaterializedDataset (pure data shaping),
// refuses what it cannot represent faithfully, retains the complete original record
// at the host boundary, and applies the shared task-type/encode step.

/** `AssembledDataset.to_full_value()` as returned by io's `assembleDataset`. The WASM
 *  binding replaces the hex `data_bytes_hex` of every matrix by `data`, a Float64Array of
 *  the logical values (row-major), next to the owner `validity` mask: a `false` cell is
 *  missing and its `data` value is a placeholder. */
interface IoMatrix {
  data: Float64Array
  n_rows: number
  n_cols: number
  validity: boolean[]
}
interface IoTargetColumn {
  name: string
  kind: 'numeric' | 'classification_integer' | 'classification_string'
  /** per-column owner matrix; `validity` is the column's mask (`data` is not carried here) */
  block: { n_rows: number; n_cols: number; validity: boolean[] }
}
/** Target table: `columns` in header order, `data` the row-major (n_rows × columns.length) logical values. */
interface IoTargets {
  columns: IoTargetColumn[]
  data: Float64Array
}
/** One owner feature axis: exact numeric coordinates travel as a `numeric` packet (decode with
 *  the owner `numericCoordinates`), text labels as a `string` packet, none as null. */
type IoAxis = AssembledAxis
interface IoBlock {
  n_samples: number
  source_ids?: string[]
  representation_ids?: string[]
  x: IoMatrix[]
  feature_headers: string[][]
  feature_axes?: IoAxis[][]
  header_units: string[]
  signal_types: (string | null)[]
  y: IoTargets | null
  y_headers: string[]
  y_categorical?: Record<string, { categories?: string[] }>
  metadata: { n_rows: number; columns: { name: string; values: (number | string | null)[] }[] } | null
  weights: Float64Array | null
  weights_header: string | null
}
/** Scientific identity columns declared by `sample_index` (null: not declared). */
interface IoIdentityProvenance {
  source_ids?: string[]
  sample_id?: string | null
  observation_id?: string | null
  repetition_id?: string | null
  group_id?: string | null
}
export interface AssembledFull {
  name: string
  task_type: string
  signal_type: string
  n_sources: number
  partition_order?: string[]
  blocks: Record<string, IoBlock>
  folds: [number[], number[]][]
  identity?: { provenance?: IoIdentityProvenance }
}

/** The complete original io evidence of a dataset, kept by reference at the host boundary:
 *  the owner record (all sources and targets, masks, identity, axes), the spec it was
 *  assembled with, the io analysis and the input bytes. */
export interface IoRetained {
  inputs: { name: string; bytes: Uint8Array }[]
  analysis: Analysis
  spec: DatasetSpec
  record: AssembledFull
}

/** The retained io evidence of a dataset ingested through io (undefined for any other dataset). */
export const ioRetainedOf = (dataset: MaterializedDataset): IoRetained | undefined => dataset[IO_RECORD] as IoRetained | undefined
/** Reattach already decoded host IO evidence after a lossless workspace restore.
 * This does not assemble, infer or change the owner's record or the dataset view. */
export function rehydrateIoRetained(dataset: MaterializedDataset, retained?: IoRetained): MaterializedDataset {
  if (retained) dataset[IO_RECORD] = retained
  return dataset
}
function retain(dataset: MaterializedDataset, retained: IoRetained): MaterializedDataset {
  dataset[IO_RECORD] = retained
  return dataset
}

/** How the owner record is projected for the views. */
export interface IoProjectionChoice {
  /** target column projected onto `y` (default: the first owner target). Every target stays in
   *  `MaterializedDataset.targets`; the target to model is chosen when a run is launched. */
  target?: string
}

/**
 * Closed mapping of io partition names onto the engine's roles. `val`/`validation` is a
 * held-out evaluation set (kept with its io name, never used for selection). Anything else
 * is refused: Web does not guess whether an unknown partition may be trained on.
 */
export function classifyIoPartition(name: string): Partition {
  switch (name.trim().toLowerCase()) {
    case 'train': case 'cal': case 'calibration':
      return 'train'
    case 'test': case 'holdout': case 'val': case 'validation':
      return 'test'
    case 'predict': case 'pred': case 'infer': case 'unknown':
      return 'predict'
    default:
      throw new Error(`nirs4all-io partition "${name}" has no known role (train/cal, test/holdout, val/validation, predict). Rename it in the dataset spec; Web does not guess a role for it.`)
  }
}

const valuesOf = (b: IoBlock, name: string) => b.metadata?.columns.find((c) => c.name === name)?.values
const cellId = (value: number | string | null | undefined): string | null => (value === null || value === undefined || value === '' ? null : String(value))

/**
 * The owner feature axis of the first source. Numeric coordinates are decoded with the owner
 * `numericCoordinates` against the owner column count (never parsed from header text); text
 * labels stay logical labels on an index axis. The unit is the owner's: an unset unit is shown
 * as `unspecified`, never as an invented nm/cm-1.
 */
function featureAxis(block: IoBlock, nFeatures: number): { axis: number[]; axisUnit: string; labels?: string[]; names?: string[] } {
  const owner = block.feature_axes?.[0]?.[0]
  const headers = block.feature_headers?.[0] ?? []
  const headerUnit = block.header_units?.[0] ?? ''
  if (owner?.coordinates?.kind === 'numeric') {
    const axis = Array.from(numericCoordinates(owner.coordinates, nFeatures))
    const axisUnit = typeof owner.unit === 'string' && owner.unit ? owner.unit : headerUnit === 'text' || headerUnit === '' ? 'unspecified' : headerUnit
    // io reports a header row unless its header unit is `index`: the owner coordinates then name the columns
    return { axis, axisUnit, ...(headerUnit === 'index' ? {} : { names: axis.map(String) }) }
  }
  // text labels (or none): a logical index axis; the headers name the columns unless io reports no header row
  const labels = headers.length === nFeatures && headerUnit !== 'index' ? headers.map((h) => columnName(String(h))) : undefined
  return { axis: Array.from({ length: nFeatures }, (_, i) => i), axisUnit: 'index', ...(labels ? { labels, names: labels } : {}) }
}

/**
 * Map io's `AssembledDataset` (per-partition feature/target blocks) onto the engine's
 * `MaterializedDataset`. X and the targets come from the owner's logical `data` with its
 * `validity` mask (missing cells become NaN, never 0, and are counted). EVERY column of the
 * row-major target table is kept (`targets`, with its owner kind and missing count); `y` is the
 * projection of one of them — `choice.target`, else the first owner target — and the target to
 * model is chosen when a run is launched. Refuses several feature sources, unknown partition
 * names and more than one held-out partition (no pooled score).
 *
 * Identity is io's declared `sample_index`: a declared sample key must be aligned in every
 * partition (else refusal, never a downgrade to positions); rows that repeat a sample id within
 * a partition need declared, unique observation ids (else refusal, nothing is synthesised);
 * with no declared key each row is its own sample, labelled positional. Task type and class
 * encoding follow the owner column kind (`data/targets.ts`). The caller keeps the original
 * record; this function only reads it.
 */
export function mapAssembledToMaterialized(full: AssembledFull, choice: IoProjectionChoice = {}): MaterializedDataset {
  const blockNames = Object.keys(full.blocks ?? {})
  const parts = full.partition_order ?? blockNames
  if (!parts.length) throw new Error('nirs4all-io returned no partitions to assemble.')
  if (parts.length !== blockNames.length || new Set(parts).size !== parts.length || parts.some((p) => !Object.hasOwn(full.blocks, p))) {
    throw new Error('nirs4all-io partition_order must name every assembled partition exactly once.')
  }
  // n_sources inventories feature tables across all partitions. train_x/test_x
  // are separate owner sources, but each partition can still have one view.
  for (const p of parts) {
    const count = full.blocks[p].x?.length ?? 0
    if (count > 1) throw new Error(`nirs4all-io assembled ${count} feature sources in partition "${p}"; Web models one source and has no source selection, so it refuses instead of keeping the first. Declare a single feature source in the dataset spec.`)
    if (full.blocks[p].n_samples > 0 && count !== 1) throw new Error(`No spectra found — nirs4all-io partition "${p}" requires exactly one feature matrix.`)
  }
  const used = parts.filter((p) => (full.blocks[p].x?.[0]?.n_rows ?? 0) > 0)
  if (!used.length) throw new Error('No spectra found — every assembled partition was empty.')
  const first = full.blocks[used[0]]
  const x0 = first.x[0]
  if (!x0.n_cols) throw new Error('No spectra found — nirs4all-io assembled no feature columns.')
  const nFeatures = x0.n_cols
  const { axis, axisUnit, labels: featureNames } = featureAxis(full.blocks[used[0]], nFeatures)
  const featureLayout = (b: IoBlock) => JSON.stringify([
    b.feature_headers[0] ?? [], b.header_units[0] ?? null, b.representation_ids?.[0] ?? null,
    b.feature_axes?.[0]?.map((a) => {
      const c = a.coordinates
      return [a.name, a.unit, c?.kind ?? null, c?.kind === 'numeric' ? [c.count, c.data_bytes_hex] : c?.values ?? null]
    }) ?? null,
  ])
  const layout = featureLayout(first)
  for (const p of used) {
    const b = full.blocks[p]
    if (b.x[0].n_cols !== nFeatures) throw new Error(`nirs4all-io partition "${p}" has ${b.x[0].n_cols} features, expected ${nFeatures}.`)
    if (featureLayout(b) !== layout) throw new Error(`nirs4all-io partition "${p}" has incompatible ordered feature headers, axes, units or representation; Web refuses to realign columns.`)
  }

  // partitions: closed role mapping, one held-out set only
  const roles = new Map(used.map((p) => [p, classifyIoPartition(p)]))
  const heldOut = used.filter((p) => roles.get(p) === 'test')
  if (heldOut.length > 1) {
    throw new Error(`nirs4all-io assembled ${heldOut.length} held-out partitions (${heldOut.map((p) => `"${p}"`).join(', ')}); Web would pool them into one score, so it refuses. Keep a single held-out partition in the dataset spec.`)
  }

  // targets: every column of the owner target table, the same columns in every partition that has one
  const targetBlocks = used.filter((p) => full.blocks[p].y)
  const columns = targetBlocks.length ? full.blocks[targetBlocks[0]].y!.columns : []
  const names = columns.map((c) => c.name)
  const signature = (b: IoBlock) => b.y!.columns.map((c) => c.name).join('\u0001')
  const differing = targetBlocks.find((p) => signature(full.blocks[p]) !== signature(full.blocks[targetBlocks[0]]))
  if (differing !== undefined) {
    throw new Error(`nirs4all-io assembled different target columns in partitions "${targetBlocks[0]}" (${names.join(', ')}) and "${differing}" (${full.blocks[differing].y!.columns.map((c) => c.name).join(', ')}); the target files must carry the same columns in the same order`)
  }
  // A column io read as numbers in one partition and as text labels in another (a stray text cell)
  // is one inconsistent target, not a reason to refuse the dataset: it is kept, flagged, without values.
  const kindLabel = (kind: IoTargetColumn['kind']) => (kind === 'classification_string' ? 'text labels' : 'numbers')
  const issues = columns.map((c, t) => {
    const other = targetBlocks.find((p) => kindLabel(full.blocks[p].y!.columns[t].kind) !== kindLabel(c.kind))
    return other === undefined ? undefined
      : `nirs4all-io read it as ${kindLabel(c.kind)} in partition "${targetBlocks[0]}" and as ${kindLabel(full.blocks[other].y!.columns[t].kind)} in "${other}"`
  })
  if (new Set(names).size !== names.length) throw new Error(`nirs4all-io assembled target columns with a repeated name (${names.join(', ')}); Web cannot tell them apart.`)
  if (choice.target !== undefined && !names.includes(choice.target)) {
    throw new Error(`"${choice.target}" is not a target nirs4all-io assembled (${names.join(', ') || 'no target'}).`)
  }

  // identity: io's declared sample_index columns; a declared key must be aligned everywhere
  const provenance = full.identity?.provenance
  const sampleColumn = provenance?.sample_id ?? undefined
  const observationColumn = provenance?.observation_id ?? undefined
  for (const [kind, column] of [['sample-id key', sampleColumn], ['observation-id', observationColumn]] as const) {
    if (column === undefined) continue
    const bad = used.find((p) => valuesOf(full.blocks[p], column)?.length !== full.blocks[p].x[0].n_rows)
    if (bad !== undefined) {
      throw new Error(`nirs4all-io declared the ${kind} "${column}" but partition "${bad}" does not carry it aligned with its ${full.blocks[bad].x[0].n_rows} rows; Web refuses to fall back to row positions for a declared identity.`)
    }
  }
  const declaredSample = sampleColumn !== undefined
  const declaredObservation = observationColumn !== undefined

  let nSamples = 0
  for (const p of used) nSamples += full.blocks[p].x[0].n_rows
  const X = new Float64Array(nSamples * nFeatures)
  const targets: DatasetTarget[] = columns.map((c, t) => ({
    // numbers everywhere but classes in one partition only: plain numbers (the task type is inferred from the values)
    name: c.name, kind: issues[t] || targetBlocks.some((p) => full.blocks[p].y!.columns[t].kind !== c.kind) ? 'numeric' : c.kind,
    values: new Float64Array(nSamples).fill(NaN), missing: 0,
    ...(c.kind === 'classification_string' && !issues[t] ? { labels: new Array<string>(nSamples).fill('') } : {}),
    ...(issues[t] ? { issue: issues[t] } : {}),
  }))
  const missingRows = new Array<boolean>(nSamples).fill(false)
  const missingColumns = new Array<boolean>(nFeatures).fill(false)
  let missingCells = 0
  const partitions: Partition[] = []
  const partitionNames: string[] = []
  const sampleIds: string[] = []
  const observationIds: (string | null)[] = []
  let off = 0
  for (const p of used) {
    const b = full.blocks[p]
    const xm = b.x[0]
    const rows = xm.n_rows
    const cells = rows * nFeatures
    if (xm.data.length !== cells || xm.validity?.length !== cells) {
      throw new Error(`nirs4all-io partition "${p}" returned a feature matrix without its logical data and validity mask (${xm.data.length} values, ${xm.validity?.length ?? 'no'} mask entries for ${cells} cells).`)
    }
    for (let i = 0; i < cells; i++) {
      // a cell the owner masks is a missing value: kept as NaN (never 0) and counted
      if (xm.validity[i]) X[off * nFeatures + i] = xm.data[i]
      else {
        X[off * nFeatures + i] = NaN
        missingCells++
        missingRows[off + Math.floor(i / nFeatures)] = true
        missingColumns[i % nFeatures] = true
      }
    }

    // every owner target column, under its own validity mask; a partition without targets stays missing
    const width = b.y?.columns.length ?? 0
    b.y?.columns.forEach((column, t) => {
      if (b.y!.data.length !== rows * width || column.block.validity.length !== rows) {
        throw new Error(`nirs4all-io partition "${p}" returned a target table that does not match its ${rows} rows.`)
      }
      if (issues[t]) return // inconsistent across partitions: no value is read from either reading
      const categories = column.kind === 'classification_string' ? b.y_categorical?.[column.name]?.categories : undefined
      for (let r = 0; r < rows; r++) {
        if (!column.block.validity[r]) continue
        const v = b.y!.data[r * width + t]
        if (column.kind === 'classification_string') {
          const label = categories?.[Math.round(v)]
          if (label === undefined) throw new Error(`nirs4all-io returned class code ${v} for target "${column.name}" without its label.`)
          targets[t].labels![off + r] = label
        } else targets[t].values[off + r] = v
      }
    })
    const ids = declaredSample ? valuesOf(b, sampleColumn!)! : undefined
    const observations = declaredObservation ? valuesOf(b, observationColumn!)! : undefined
    for (let r = 0; r < rows; r++) {
      partitions.push(roles.get(p)!)
      partitionNames.push(p)
      if (ids) {
        const id = cellId(ids[r])
        if (id === null) throw new Error(`Sample id column "${sampleColumn}" is empty at row ${r + 1} of partition "${p}".`)
        sampleIds.push(id)
      } else sampleIds.push(`${p}#${r}`)
      if (observations) observationIds.push(cellId(observations[r]))
    }
    off += rows
  }
  for (const target of targets) {
    target.missing = target.labels ? target.labels.filter((label) => label === '').length : Array.from(target.values).filter((v) => !Number.isFinite(v)).length
  }

  // A physical sample scanned several times is one sample id in one partition: the scans are
  // distinguished only by io's declared observation id, which must be present and unique.
  const seen = new Set<string>()
  const repeated: string[] = []
  sampleIds.forEach((id, i) => {
    const key = JSON.stringify([partitionNames[i], id])
    if (seen.has(key)) repeated.push(`"${id}" in "${partitionNames[i]}"`)
    seen.add(key)
  })
  if (declaredSample && repeated.length) {
    if (!declaredObservation || observationIds.some((id) => id === null)) {
      throw new Error(`Sample id "${sampleColumn}" repeats (${[...new Set(repeated)].slice(0, 3).join(', ')}) but nirs4all-io declares ${declaredObservation ? `an empty observation id in "${observationColumn}"` : 'no observation id'} (sample_index.observation_id). Every repeated scan needs its own declared observation id; Web will not invent one from row positions. Declare the observation column in the dataset spec.`)
    }
    const pairs = new Set<string>()
    for (let i = 0; i < sampleIds.length; i++) {
      const pair = JSON.stringify([partitionNames[i], sampleIds[i], observationIds[i]])
      if (pairs.has(pair)) throw new Error(`Observation id "${observationIds[i]}" is declared twice for sample "${sampleIds[i]}" in partition "${partitionNames[i]}"; the observation ids of one sample must be distinct.`)
      pairs.add(pair)
    }
  }

  // per-sample metadata (including declared relation roles): non-key columns nirs4all-io already parsed,
  // aligned to X's row order (same partition iteration, same empty-block skip).
  const metaSchema: string[] = []
  for (const p of used) {
    for (const c of full.blocks[p].metadata?.columns ?? []) {
      if (!(declaredSample && c.name === sampleColumn) && !metaSchema.includes(c.name)) metaSchema.push(c.name)
    }
  }
  const metadata = metaSchema.length
    ? metaSchema.map((nameCol) => {
        const vals: (number | string | null)[] = []
        for (const p of used) {
          const col = (full.blocks[p].metadata?.columns ?? []).find((c) => c.name === nameCol)
          for (let r = 0; r < full.blocks[p].x[0].n_rows; r++) vals.push(col ? col.values[r] ?? null : null)
        }
        const nonNull = vals.filter((v): v is number | string => v !== null)
        const numeric = !isRelationColumn(nameCol) && nonNull.length > 0 && nonNull.every((v) => Number.isFinite(Number(v)))
        return numeric
          ? { name: nameCol, kind: 'numeric' as const, values: vals.map((v) => (v === null ? null : Number(v))) }
          : { name: nameCol, kind: 'categorical' as const, values: vals.map((v) => (v === null ? null : String(v))) }
      })
    : undefined
  const relations = metadataRelations(metadata)
  const groupColumn = provenance?.group_id ?? undefined
  const declaredGroups = groupColumn !== undefined && !relations.groupIds
    ? metadata?.find((c) => c.name === groupColumn)?.values.map((v) => cellId(v))
    : undefined

  // targetless spectra are allowed (explore / predict-only); the engine refuses
  // to train without targets, so an all-NaN y never silently produces a model.
  const dataset: MaterializedDataset = {
    X, nSamples, nFeatures, axis, axisUnit, ...(featureNames ? { featureNames } : {}),
    y: new Float64Array(nSamples).fill(NaN), yRaw: new Float64Array(nSamples).fill(NaN), labelsRaw: new Array<string>(nSamples).fill(''),
    targetName: 'target', taskType: 'regression', classes: undefined,
    ...(targets.length ? { targets } : {}),
    ...(missingCells ? { missingFeatures: { cells: missingCells, rows: missingRows.filter(Boolean).length, columns: missingColumns.filter(Boolean).length } } : {}),
    sampleIds, ...(declaredSample ? { sampleIdColumn: sampleColumn } : {}), partitions, partitionNames,
    ...(heldOut.length ? { heldOutName: heldOut[0] } : {}),
    ...(declaredObservation ? { observationIds } : {}),
    identity: {
      basis: declaredSample ? 'declared' : 'positional',
      ...(declaredSample ? { sampleIdColumn: sampleColumn } : { reason: 'nirs4all-io declared no sample-id key (sample_index): each row is its own sample, identified by partition and row position' }),
      ...(declaredObservation ? { observationIdColumn: observationColumn } : {}),
      ...(groupColumn !== undefined ? { groupColumn } : {}),
    },
    metadata, ...relations, ...(declaredGroups ? { groupIds: declaredGroups } : {}),
  }
  // the view target: the requested column, else the first usable owner target (visible and changeable in every view)
  return targets.length ? selectDatasetTarget(dataset, choice.target ?? (targets.find((target) => !target.issue) ?? targets[0]).name) : dataset
}

/** The spec io assembles: its inferred per-scan repetition never reaches assembly. Repetition is
 *  the physical-sample column (nirs4all `repetition`) and only the user declares it, in the dataset
 *  configuration; rows that repeat a declared sample id are grouped by that id by default
 *  (engine/relations.ts). The observation id io declares is kept. */
function assemblySpecOf(spec: DatasetSpec): DatasetSpec {
  const { repetition: _inferred, ...assemblySpec } = spec
  if (assemblySpec.sample_index && typeof assemblySpec.sample_index === 'object') {
    const { repetition_id: _scan, ...sampleIndex } = assemblySpec.sample_index as Record<string, unknown>
    assemblySpec.sample_index = sampleIndex
  }
  if (assemblySpec.params !== undefined) assemblySpec.params = keepMissingValues(assemblySpec.params as Record<string, unknown>)
  if (assemblySpec.sources) assemblySpec.sources = assemblySpec.sources.map((source) => (source.params ? { ...source, params: keepMissingValues(source.params) } : source))
  return assemblySpec
}

/** Loading is lossless: io's undecided NA policy (`auto`, which aborts on a missing feature value) is
 *  asked as io's `ignore`, so missing cells are kept under the owner validity mask and counted, and no
 *  row or column is dropped at load. A policy the spec declares explicitly is left as declared. What a
 *  run does with missing values is the user's launch choice (`data/targets.ts`). */
function keepMissingValues(params: Record<string, unknown>): Record<string, unknown> {
  const na = params.na
  if (!na || typeof na !== 'object' || (na as { policy?: unknown }).policy !== 'auto') return params
  return { ...params, na: { ...na, policy: 'ignore' } }
}

/** Run io's `assembleDataset` for a spec over the decoded records and the table bytes io reads itself. */
async function assembleSpec(spec: DatasetSpec, decoded: DecodedFile[], files: { name: string; bytes: Uint8Array }[]): Promise<AssembledFull> {
  const { io } = await mods()
  const okNames = new Set(decoded.filter((d) => d.ok && d.records?.length).map((d) => d.file))
  const recordSets = decoded.filter((d) => d.ok && d.records?.length).map((d) => ({ source: d.file, records: d.records! }))
  const byteFiles = files.filter((f) => !okNames.has(f.name)).map((f) => ({ name: f.name, bytes: f.bytes }))
  return io.assembleDataset(byteFiles, recordSets, JSON.stringify(spec)) as unknown as AssembledFull
}

function resolvedSpecOf(plan: DatasetPlan | null | undefined): DatasetSpec {
  const spec = plan?.resolved_spec
  if (!spec) throw new Error(`nirs4all-io produced no DatasetSpec to assemble${plan?.warnings?.length ? ` (${plan.warnings.join('; ')})` : ''} — check the uploaded files.`)
  if (plan?.blocked) throw new Error(`nirs4all-io blocked the inferred DatasetSpec${plan.warnings?.length ? ` (${plan.warnings.join('; ')})` : ''}; resolve it before assembling.`)
  return spec
}

/**
 * Assemble decoded records + uploaded tables into a `MaterializedDataset` via
 * nirs4all-io's fs-free `assembleDataset` (Rust → WASM). Decoded vendor records
 * are passed as record sets; files io reads itself (delimited text, y / metadata
 * tables) are passed as bytes. The resolved DatasetSpec (`plan.resolved_spec`)
 * drives roles/joins/partitions inside io. The original io record stays attached to the
 * dataset by reference (`ioRetainedOf`).
 */
export async function assembleDataset(
  decoded: DecodedFile[],
  plan: DatasetPlan | null | undefined,
  files: { name: string; bytes: Uint8Array }[],
  choice: IoProjectionChoice = {},
): Promise<MaterializedDataset> {
  const spec = assemblySpecOf(resolvedSpecOf(plan))
  const record = await assembleSpec(spec, decoded, files)
  const analysis: Analysis = { decoded, plan: plan ?? null, readers: { count: 0, features: {} } }
  return retain(mapAssembledToMaterialized(record, choice), { inputs: files, analysis, spec, record })
}

/** io could not assemble these inputs, or Web cannot represent the record io assembled.
 *  The complete input bytes, the io analysis and — when io did assemble — the original record and
 *  spec are kept here unchanged for the host; Web never assembles delimited text locally instead. */
export class IoIngestionRefusal extends Error {
  constructor(
    message: string,
    readonly inputs: { name: string; bytes: Uint8Array }[],
    readonly analysis: Analysis | null,
    readonly retained?: IoRetained,
  ) {
    super(message)
    this.name = 'IoIngestionRefusal'
  }
}

/** The cause of a refusal as one clause: no trailing period (the sentence around it supplies one). */
const cause = (e: unknown): string => (e instanceof Error ? e.message : String(e)).trim().replace(/\.+$/, '')

/** Ingest uploaded or bundled files through Formats + IO: the one active dataset entry. */
export async function ingestFiles(
  files: { name: string; bytes: Uint8Array }[],
  name: string,
  choice: IoProjectionChoice = {},
): Promise<{ dataset: MaterializedDataset; name: string; analysis: Analysis; retained: IoRetained }> {
  const analysis = await analyzeFiles(files)
  const failed = analysis.decoded.filter((d) => !d.ok).map((d) => `${d.file}: ${d.error}`)
  const unchanged = `The ${files.length} input file${files.length === 1 ? ' is' : 's are'} kept unchanged`
  // two different refusals: io could not assemble the inputs, or io did and Web cannot represent its record
  const notAssembled = (e: unknown, retained?: IoRetained) => new IoIngestionRefusal(
    retained
      ? `Web cannot load the dataset nirs4all-io assembled: ${cause(e)}. ${unchanged}.`
      : `nirs4all-io could not assemble this dataset: ${cause(e)}${failed.length ? ` (not decoded: ${failed.join('; ')})` : ''}. ${unchanged}; Web does not assemble them locally.`,
    files,
    analysis,
    retained,
  )
  let spec: DatasetSpec
  let record: AssembledFull
  try {
    spec = assemblySpecOf(resolvedSpecOf(analysis.plan))
    record = await assembleSpec(spec, analysis.decoded, files)
  } catch (e) {
    throw notAssembled(e)
  }
  const retained: IoRetained = { inputs: files, analysis, spec, record }
  try {
    return { dataset: retain(mapAssembledToMaterialized(record, choice), retained), name: datasetSpecInputName(analysis.plan) ?? name, analysis, retained }
  } catch (e) {
    throw notAssembled(e, retained)
  }
}

// --- prediction matrices ----------------------------------------------------
// A new-spectra file for Predict is read by nirs4all-io like any table: io decides delimiter,
// header row, numeric axis and the roles of the columns; Web only checks the owner's output against
// the model contract (its feature count) and reports the owner's header/positional outcome.

/** Predict input read from the owner record. `featureNames` are present only when io reports a
 *  header row (numeric headers as the owner axis coordinates, text headers as labels); a header-less
 *  file is positional. `autoY` is the single reference column io (or the explicit trailing-column
 *  contract below) assigned, as strings. */
export interface PredictionMatrix {
  X: Float64Array
  nSamples: number
  nFeatures: number
  featureNames?: string[]
  autoY: string[] | null
  /** the complete original evidence (record, spec, analysis, input bytes) */
  retained: IoRetained
}

function referenceLabels(block: IoBlock, rows: number): string[] | null {
  const y = block.y
  if (!y || !y.columns.length) return null
  if (y.columns.length > 1) {
    throw new Error(`The file carries ${y.columns.length} reference columns (${y.columns.map((c) => c.name).join(', ')}); Predict scores one target. Keep a single reference column.`)
  }
  const [column] = y.columns
  if (y.data.length !== rows || column.block.validity.length !== rows) throw new Error('nirs4all-io returned a reference column that does not match the prediction rows.')
  const categories = column.kind === 'classification_string' ? block.y_categorical?.[column.name]?.categories : undefined
  return Array.from({ length: rows }, (_, r) => {
    if (!column.block.validity[r]) return ''
    if (column.kind !== 'classification_string') return String(y.data[r])
    const label = categories?.[Math.round(y.data[r])]
    if (label === undefined) throw new Error(`nirs4all-io returned class code ${y.data[r]} without its label.`)
    return label
  })
}

function predictionBlock(record: AssembledFull): IoBlock {
  const used = Object.keys(record.blocks ?? {}).filter((p) => (record.blocks[p].x?.[0]?.n_rows ?? 0) > 0)
  if (used.length !== 1 || record.n_sources > 1 || (record.blocks[used[0]].x?.length ?? 0) !== 1) {
    throw new Error(`nirs4all-io assembled ${used.length} partition(s) and ${record.n_sources} feature source(s) from the prediction file; Predict takes exactly one matrix.`)
  }
  return record.blocks[used[0]]
}

/** Read one prediction matrix through IO with the model's declared feature width.
 *  All columns are features, except an optional trailing reference column. Configure these
 *  roles before assembly; dataset-inference target guesses are not the prediction contract. */
export async function readPredictionMatrix(file: { name: string; bytes: Uint8Array }, nFeatures: number, hasHeader?: boolean): Promise<PredictionMatrix> {
  const inputs = [file]
  const loadingParams = hasHeader === undefined ? {} : { has_header: hasHeader }
  const analysis = await analyzeFiles(inputs, hasHeader === undefined ? {} : { file_params: { [file.name]: { has_header: hasHeader } } })
  const refuse = (e: unknown, retained?: IoRetained) => new IoIngestionRefusal(
    retained
      ? `Web cannot use the prediction file nirs4all-io read: ${cause(e)}. The input file is kept unchanged.`
      : `nirs4all-io could not read the prediction file: ${cause(e)}. The input file is kept unchanged; Web does not parse it locally.`, inputs, analysis, retained)
  let spec: DatasetSpec
  let record: AssembledFull
  let block: IoBlock
  try {
    if (hasHeader === undefined && analysis.plan?.params?.[file.name]?.header_ambiguous === true) {
      throw new Error(analysis.plan.warnings?.find((warning) => warning.includes('header_ambiguous') && warning.includes(file.name)))
    }
    spec = assemblySpecOf(resolvedSpecOf(analysis.plan))
    if (TABULAR_TEXT.test(file.name)) {
      const [source, ...others] = spec.sources ?? []
      if (!source || others.length) throw new Error('Predict requires one declared feature matrix source.')
      const { io } = await mods()
      const params = source.params ?? {}
      const [table] = io.describeTables(inputs, { params: { [file.name]: { ...params, ...loadingParams } } })
      if (!table?.readable || table.refusal) throw new Error(table?.refusal ?? 'IO could not inspect the prediction table.')
      const width = table.n_cols
      if (width !== nFeatures && width !== nFeatures + 1) {
        throw new Error(`Column count mismatch: the file has ${width} columns but the model expects ${nFeatures} features (or ${nFeatures + 1} with a trailing reference column).`)
      }
      // Inspection always uses NA=ignore; retain the assembly's original NA policy.
      const { na: _inspectionNa, ...readerParams } = table.params
      spec = {
        ...spec,
        sources: [{ ...source, role: width === nFeatures ? 'features' : 'mixed', params: { ...params, ...readerParams }, columns: [
          { role: 'features', select: Array.from({ length: nFeatures }, (_, i) => i) },
          ...(width === nFeatures + 1 ? [{ role: 'targets', select: nFeatures }] : []),
        ] }],
      }
    }
    record = await assembleSpec(spec, analysis.decoded, inputs)
    block = predictionBlock(record)
  } catch (e) {
    throw refuse(e)
  }
  const retained: IoRetained = { inputs, analysis, spec, record }
  try {
    const xm = block.x[0]
    const rows = xm.n_rows
    if (xm.n_cols !== nFeatures) {
      throw new Error(`Column count mismatch: the file has ${xm.n_cols} feature columns but the model expects ${nFeatures} features (or ${nFeatures + 1} with a trailing reference column).`)
    }
    const cells = rows * nFeatures
    if (xm.data.length !== cells || xm.validity?.length !== cells) throw new Error('nirs4all-io returned a prediction matrix without its logical data and validity mask.')
    for (let i = 0; i < cells; i++) {
      if (!xm.validity[i]) throw new Error(`Missing value at row ${Math.floor(i / nFeatures) + 1}, column ${(i % nFeatures) + 1}.`)
    }
    const { names } = featureAxis(block, nFeatures)
    return { X: Float64Array.from(xm.data), nSamples: rows, nFeatures, ...(names ? { featureNames: names } : {}), autoY: referenceLabels(block, rows), retained }
  } catch (e) {
    throw refuse(e, retained)
  }
}

/** Read a separate reference file (one value per prediction row) as the target of the SAME prediction
 *  matrix: the retained spec is re-assembled with the reference file as a second, positionally joined
 *  targets source. The reference file's own delimiter/header/decimal are io's inference for that file. */
export async function readReferenceColumn(matrix: PredictionMatrix, file: { name: string; bytes: Uint8Array }): Promise<string[]> {
  const { retained } = matrix
  const own = await analyzeFiles([file])
  const params = own.plan?.resolved_spec?.sources?.[0]?.params
  const [source, ...others] = retained.spec.sources ?? []
  if (!source || others.length) throw new Error('The prediction file was assembled from several sources; a separate reference file cannot be joined to it.')
  const { sample_index: _index, ...spec } = retained.spec
  const { key: _key, ...featuresSource } = source
  const joined: DatasetSpec = {
    ...spec,
    sources: [
      // io's own target column of the prediction file, if any, is not the reference now
      { ...featuresSource, ...(featuresSource.columns ? { columns: featuresSource.columns.map((c) => (c.role === 'targets' ? { ...c, role: 'metadata' } : c)) } : {}) },
      { id: 'reference', role: 'targets', input: file.name, ...(params ? { params } : {}) },
    ],
  }
  let record: AssembledFull
  try {
    record = await assembleSpec(joined, retained.analysis.decoded, [...retained.inputs, file])
  } catch (e) {
    throw new IoIngestionRefusal(`nirs4all-io could not join the reference file to the ${matrix.nSamples} prediction rows: ${cause(e)}. Both files are kept unchanged.`, [...retained.inputs, file], retained.analysis, { ...retained, spec: joined })
  }
  const labels = referenceLabels(predictionBlock(record), matrix.nSamples)
  if (!labels) throw new Error('nirs4all-io found no reference values in the file.')
  return labels
}
