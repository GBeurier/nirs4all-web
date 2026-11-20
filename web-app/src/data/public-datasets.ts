// Public origin acquisition belongs to nirs4all-datasets; Web transports only the
// declared resource kit and delegates its preparation and assembly to Data + IO.
// No dataset recipe, parser, inference or numerical fallback lives in this host.
import { loadDatasetsWasm, loadDataIoWasm } from '@/engine/nirs4all-core'
import type { MaterializedDataset } from '@/engine/types'
import { mapAssembledToMaterialized, type AssembledFull, type IoProjectionChoice } from './wasm-io'

export const PUBLIC_CATALOG_SCHEMA = 'nirs4all.datasets.public-origin-catalog.v1'
export const PUBLIC_PLAN_SCHEMA = 'nirs4all.datasets.public-origin-plan.v1'

export interface PublicResource {
  id: string
  name: string
  url: string
  /** Only an actual publisher/owner pin; null is never replaced by an observed hash. */
  sha256: string | null
  size_bytes: number | null
}

export interface PublicDatasetSource {
  id: string
  name?: string
  status: 'supported' | 'unsupported'
  reason?: string
  resources: PublicResource[]
}

export interface PublicDatasetEntry {
  id: string
  name: string
  tier: 'public'
  license: string
  description?: string
  sources: PublicDatasetSource[]
}

export interface PublicCatalog {
  schema: typeof PUBLIC_CATALOG_SCHEMA
  datasets: PublicDatasetEntry[]
  withheld: number
  provenance: Record<string, unknown>
}

export interface PublicInputFile { name: string; bytes: Uint8Array }
export interface PublicOriginOwner {
  browserCatalog(): string
  resolveBrowserPlan(datasetId: string, sourceId: string): string
  prepareBrowserDataset(planJson: string, files: PublicInputFile[]): unknown
}

export interface PublicPreparedDataset {
  files: PublicInputFile[]
  record_sets: unknown[]
  spec: Record<string, unknown>
  provenance: Record<string, unknown>
}

export interface PublicOriginPlan {
  schema: typeof PUBLIC_PLAN_SCHEMA
  dataset_id: string
  source_id: string
  resources: PublicResource[]
  descriptor: Record<string, unknown>
  provenance: Record<string, unknown>
}

export type PublicDatasetErrorKind = 'unreachable' | 'http' | 'schema' | 'integrity' | 'choice' | 'unsupported' | 'owner'
export class PublicDatasetError extends Error {
  constructor(message: string, readonly kind: PublicDatasetErrorKind) {
    super(message)
    this.name = 'PublicDatasetError'
  }
}

export const isAbortError = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const SHA256_HEX = /^[0-9a-f]{64}$/i
const schemaError = (message: string) => new PublicDatasetError(`The public dataset owner returned malformed metadata: ${message}`, 'schema')

async function originOwner(): Promise<PublicOriginOwner> {
  const owner = await loadDatasetsWasm() as unknown as Partial<PublicOriginOwner>
  if (typeof owner.browserCatalog !== 'function' || typeof owner.resolveBrowserPlan !== 'function' || typeof owner.prepareBrowserDataset !== 'function') {
    throw new PublicDatasetError('This build cannot import datasets from their original sources. Update the application or choose a local file.', 'owner')
  }
  return owner as PublicOriginOwner
}

function ownerJson(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw schemaError('the document is not JSON.') }
}

function resourcesOf(value: unknown, where: string): PublicResource[] {
  if (!Array.isArray(value)) throw schemaError(`${where} has no resource list.`)
  const resources = value.map((raw): PublicResource => {
    if (!isRecord(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.url)) throw schemaError(`${where} has a resource without an id, name or URL.`)
    let url: URL
    try { url = new URL(raw.url) }
    catch { throw schemaError(`resource "${raw.id}" has an invalid URL.`) }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw schemaError(`resource "${raw.id}" requires an absolute public http(s) URL without credentials.`)
    if (raw.sha256 !== null && (typeof raw.sha256 !== 'string' || !SHA256_HEX.test(raw.sha256))) throw schemaError(`resource "${raw.id}" has an invalid SHA-256 pin.`)
    if (raw.size_bytes !== null && (typeof raw.size_bytes !== 'number' || !Number.isSafeInteger(raw.size_bytes) || raw.size_bytes < 0)) throw schemaError(`resource "${raw.id}" has an invalid size pin.`)
    return { id: raw.id, name: raw.name, url: url.href, sha256: typeof raw.sha256 === 'string' ? raw.sha256.toLowerCase() : null, size_bytes: raw.size_bytes as number | null }
  })
  if (new Set(resources.map((r) => r.id)).size !== resources.length || new Set(resources.map((r) => r.name)).size !== resources.length) throw schemaError(`${where} has duplicate resource identities.`)
  return resources
}

/** Admit owner metadata, retaining unsupported sources with their declared reason. */
export function parsePublicCatalog(value: unknown): PublicCatalog {
  if (!isRecord(value) || value.schema !== PUBLIC_CATALOG_SCHEMA || !Array.isArray(value.datasets) || !isRecord(value.provenance)) throw schemaError(`expected schema "${PUBLIC_CATALOG_SCHEMA}" with datasets and provenance.`)
  const datasets: PublicDatasetEntry[] = []
  const ids = new Set<string>()
  let withheld = 0
  for (const raw of value.datasets) {
    if (!isRecord(raw)) throw schemaError('a dataset entry is not an object.')
    if (raw.tier !== 'public') { withheld += 1; continue }
    if (!isText(raw.id) || !isText(raw.name) || !isText(raw.license) || !Array.isArray(raw.sources) || !raw.sources.length) throw schemaError('a public dataset requires id, name, license and sources.')
    if (ids.has(raw.id)) throw schemaError(`dataset "${raw.id}" is listed twice.`)
    ids.add(raw.id)
    const sources = raw.sources.map((source): PublicDatasetSource => {
      if (!isRecord(source) || !isText(source.id) || (source.status !== 'supported' && source.status !== 'unsupported')) throw schemaError(`dataset "${raw.id}" has an invalid source.`)
      if (source.status === 'unsupported' && !isText(source.reason)) throw schemaError(`source "${source.id}" requires its unsupported reason.`)
      if (source.name !== undefined && typeof source.name !== 'string') throw schemaError(`source "${source.id}" has a non-text name.`)
      const resources = resourcesOf(source.resources, `source "${source.id}"`)
      if (source.status === 'supported' && !resources.length) throw schemaError(`source "${source.id}" has no declared resource.`)
      return { id: source.id, ...(isText(source.name) ? { name: source.name } : {}), status: source.status, ...(isText(source.reason) ? { reason: source.reason } : {}), resources }
    })
    if (new Set(sources.map((s) => s.id)).size !== sources.length) throw schemaError(`dataset "${raw.id}" has duplicate source ids.`)
    if (raw.description !== undefined && typeof raw.description !== 'string') throw schemaError(`dataset "${raw.id}" has a non-text description.`)
    datasets.push({ id: raw.id, name: raw.name, tier: 'public', license: raw.license, ...(isText(raw.description) ? { description: raw.description } : {}), sources })
  }
  return { schema: PUBLIC_CATALOG_SCHEMA, datasets, withheld, provenance: value.provenance }
}

export interface PublicFetchOptions {
  signal?: AbortSignal
  fetch?: FetchLike
  /** Test injection at the same owner boundary; production loads the staged owner. */
  owner?: PublicOriginOwner
}

/** Load the owner's embedded public metadata; browsing downloads no dataset or index. */
export async function loadPublicCatalog(options: PublicFetchOptions = {}): Promise<PublicCatalog> {
  const owner = options.owner ?? await originOwner()
  options.signal?.throwIfAborted()
  const catalog = parsePublicCatalog(ownerJson(owner.browserCatalog()))
  options.signal?.throwIfAborted()
  return catalog
}

export function searchPublicDatasets(datasets: PublicDatasetEntry[], query: string): PublicDatasetEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return datasets.filter((d) => terms.every((term) => [d.name, d.id, d.license, d.description ?? '', ...d.sources.flatMap((s) => [s.id, s.name ?? '', s.reason ?? ''])].join(' ').toLowerCase().includes(term)))
}

export function resolvePublicSource(dataset: PublicDatasetEntry, sourceId?: string): PublicDatasetSource {
  const source = sourceId === undefined
    ? dataset.sources.length === 1 ? dataset.sources[0] : undefined
    : dataset.sources.find((s) => s.id === sourceId)
  if (!source) throw new PublicDatasetError(sourceId === undefined ? `"${dataset.name}" has ${dataset.sources.length} sources; choose one — Web does not take the first.` : `"${dataset.name}" has no source "${sourceId}".`, 'choice')
  if (source.status !== 'supported') throw new PublicDatasetError(source.reason ?? 'This source is not supported by the browser.', 'unsupported')
  return source
}

export const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

export type PublicImportPhase = 'downloading' | 'verifying' | 'decoding'
export interface PublicImportProgress { phase: PublicImportPhase; receivedBytes: number; totalBytes: number | null }
export interface PublicResourceReceipt {
  resource: PublicResource
  finalUrl: string
  observed_size_bytes: number
  observed_sha256: string
  sha256_verified: boolean
  size_verified: boolean
}

async function request(resource: PublicResource, options: PublicFetchOptions): Promise<Response> {
  let response: Response
  try {
    const init: RequestInit = { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/octet-stream' }, signal: options.signal }
    response = options.fetch ? await options.fetch(resource.url, init) : await fetch(resource.url, init)
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new PublicDatasetError(`Could not reach the original source at ${resource.url}. The publisher may not allow this browser request (CORS), or the network failed; try again later.`, 'unreachable')
  }
  if (!response.ok) throw new PublicDatasetError(`The original source at ${resource.url} answered HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}; try again later.`, response.status === 404 || response.status === 410 ? 'unreachable' : 'http')
  return response
}

/** Transport bytes, enforce only genuine pins, and retain observed integrity separately. */
export async function downloadPublicResource(resource: PublicResource, options: PublicFetchOptions & { onProgress?: (p: PublicImportProgress) => void } = {}): Promise<{ bytes: Uint8Array; receipt: PublicResourceReceipt }> {
  options.signal?.throwIfAborted()
  const response = await request(resource, options)
  const total = resource.size_bytes
  const fixed = total === null ? null : new Uint8Array(total)
  const chunks: Uint8Array[] = []
  let received = 0
  const progress = (phase: PublicImportPhase) => options.onProgress?.({ phase, receivedBytes: received, totalBytes: total })
  const append = (chunk: Uint8Array) => {
    if (total !== null && received + chunk.byteLength > total) throw new PublicDatasetError(`Resource "${resource.id}" is larger than its declared ${total} bytes.`, 'integrity')
    if (fixed) fixed.set(chunk, received)
    else chunks.push(chunk)
    received += chunk.byteLength
    progress('downloading')
  }
  progress('downloading')
  const reader = response.body?.getReader()
  if (reader) {
    try {
      for (;;) {
        options.signal?.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        append(value)
      }
    } catch (e) { void reader.cancel().catch(() => undefined); throw e }
  } else append(new Uint8Array(await response.arrayBuffer()))
  options.signal?.throwIfAborted()
  if (total !== null && received !== total) throw new PublicDatasetError(`Resource "${resource.id}" has ${received} bytes, but its source declares ${total}.`, 'integrity')
  const bytes = fixed ?? new Uint8Array(received)
  if (!fixed) { let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length } }
  progress('verifying')
  const observed = await sha256Hex(bytes)
  options.signal?.throwIfAborted()
  if (resource.sha256 !== null && observed !== resource.sha256) throw new PublicDatasetError(`Resource "${resource.id}" does not match its declared SHA-256 (expected ${resource.sha256}, got ${observed}); it was refused.`, 'integrity')
  return { bytes, receipt: { resource, finalUrl: response.url || resource.url, observed_size_bytes: received, observed_sha256: observed, sha256_verified: resource.sha256 !== null, size_verified: total !== null } }
}

function parsePlan(value: unknown, dataset: PublicDatasetEntry, source: PublicDatasetSource): PublicOriginPlan {
  if (!isRecord(value) || value.schema !== PUBLIC_PLAN_SCHEMA || value.dataset_id !== dataset.id || value.source_id !== source.id || !isRecord(value.descriptor) || !isRecord(value.provenance)) throw schemaError('the acquisition plan does not identify the selected dataset/source.')
  const resources = resourcesOf(value.resources, 'the acquisition plan')
  if (JSON.stringify(resources) !== JSON.stringify(source.resources)) throw schemaError('the acquisition plan differs from its catalog resource kit.')
  return { schema: PUBLIC_PLAN_SCHEMA, dataset_id: dataset.id, source_id: source.id, resources, descriptor: value.descriptor, provenance: value.provenance }
}

function parsePrepared(value: unknown): PublicPreparedDataset {
  if (!isRecord(value) || !Array.isArray(value.files) || !Array.isArray(value.record_sets) || !isRecord(value.spec) || !isRecord(value.provenance)) throw schemaError('the preparation result requires files, record_sets, spec and provenance.')
  const files = value.files.map((file): PublicInputFile => {
    if (!isRecord(file) || !isText(file.name) || !(file.bytes instanceof Uint8Array)) throw schemaError('a prepared file requires its name and Uint8Array bytes.')
    return { name: file.name, bytes: file.bytes }
  })
  return { files, record_sets: value.record_sets, spec: value.spec, provenance: value.provenance }
}

export interface PublicDatasetRetained {
  catalog: PublicCatalog
  dataset: PublicDatasetEntry
  source: PublicDatasetSource
  plan: PublicOriginPlan
  planJson: string
  resources: PublicResourceReceipt[]
  inputs: PublicInputFile[]
  prepared: PublicPreparedDataset
  provenance: Record<string, unknown>
  record: AssembledFull
}
export type PublicAssembler = (files: PublicInputFile[], recordSets: unknown[], specJson: string) => AssembledFull | Promise<AssembledFull>
const assembleOwner: PublicAssembler = async (files, records, spec) => (await loadDataIoWasm()).io.assembleDataset(files, records, spec) as unknown as AssembledFull

/** Resolve the owner's source plan, fetch its kit, then prepare and assemble it with owners. */
export async function downloadPublicDataset(catalog: PublicCatalog, dataset: PublicDatasetEntry, sourceId: string | undefined, options: PublicFetchOptions & { onProgress?: (p: PublicImportProgress) => void; assemble?: PublicAssembler } = {}): Promise<PublicDatasetRetained> {
  if (dataset.tier !== 'public') throw new PublicDatasetError(`"${dataset.id}" is not a public dataset.`, 'choice')
  const source = resolvePublicSource(dataset, sourceId)
  const owner = options.owner ?? await originOwner()
  options.signal?.throwIfAborted()
  const planJson = owner.resolveBrowserPlan(dataset.id, source.id)
  const plan = parsePlan(ownerJson(planJson), dataset, source)
  const inputs: PublicInputFile[] = []
  const receipts: PublicResourceReceipt[] = []
  const total = plan.resources.every((r) => r.size_bytes !== null) ? plan.resources.reduce((sum, r) => sum + r.size_bytes!, 0) : null
  let received = 0
  for (const resource of plan.resources) {
    const downloaded = await downloadPublicResource(resource, { ...options, onProgress: (p) => options.onProgress?.({ phase: p.phase, receivedBytes: received + p.receivedBytes, totalBytes: total }) })
    inputs.push({ name: resource.name, bytes: downloaded.bytes })
    receipts.push(downloaded.receipt)
    received += downloaded.bytes.byteLength
  }
  options.signal?.throwIfAborted()
  options.onProgress?.({ phase: 'decoding', receivedBytes: received, totalBytes: total })
  const prepared = parsePrepared(owner.prepareBrowserDataset(planJson, inputs))
  options.signal?.throwIfAborted()
  const record = await (options.assemble ?? assembleOwner)(prepared.files, prepared.record_sets, JSON.stringify(prepared.spec))
  options.signal?.throwIfAborted()
  if (!isRecord(record) || !isRecord(record.blocks)) throw schemaError('nirs4all-io did not return an assembled record.')
  return { catalog, dataset, source, plan, planJson, resources: receipts, inputs, prepared, provenance: { catalog: catalog.provenance, plan: plan.provenance, preparation: prepared.provenance }, record: record as unknown as AssembledFull }
}

/** Retained by host object patches; deliberately absent from worker structured clones. */
export const PUBLIC_DATASET_RECORD: unique symbol = Symbol.for('nirs4all.web.public-dataset-record')
export type PublicMaterializedDataset = MaterializedDataset & { [PUBLIC_DATASET_RECORD]?: PublicDatasetRetained }
export const publicDatasetOf = (dataset: MaterializedDataset): PublicDatasetRetained | undefined => (dataset as PublicMaterializedDataset)[PUBLIC_DATASET_RECORD]

export class PublicDatasetTargetChoiceRequired extends Error {
  constructor(message: string, readonly options: string[]) { super(message); this.name = 'PublicDatasetTargetChoiceRequired' }
}

/** Keep the full owner record; display-target selection never downloads or drops another target. */
export function projectPublicDataset(retained: PublicDatasetRetained, choice: IoProjectionChoice = {}): PublicMaterializedDataset {
  const dataset: PublicMaterializedDataset = mapAssembledToMaterialized(retained.record, choice)
  const names = dataset.targets?.map((target) => target.name) ?? []
  if (choice.target === undefined && names.length > 1) throw new PublicDatasetTargetChoiceRequired(`This dataset carries ${names.length} targets (${names.join(', ')}); choose one to display. All targets remain available when launching a run.`, names)
  dataset[PUBLIC_DATASET_RECORD] = retained
  return dataset
}

export const publicDatasetName = (dataset: PublicDatasetEntry, source: PublicDatasetSource): string => dataset.sources.length > 1 ? `${dataset.name} — ${source.name ?? source.id}` : dataset.name
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
