// Public dataset catalog: the browser downloads one owner-prepared, static dataset asset
// chosen by the user, verifies it at the trust boundary (HTTP status, schema, dataset/source
// identity, byte size, SHA-256) and hands the published nirs4all-io `assembled_full` record to
// the IO owner decoder. Web neither prepares, filters nor assembles the data: the projection to
// the engine view is the existing `mapAssembledToMaterialized`, with explicit source and target
// choices. Nothing is uploaded; requests carry no credentials.
import type { MaterializedDataset } from '@/engine/types'
import { mapAssembledToMaterialized, type AssembledFull, type IoProjectionChoice } from './wasm-io'

export const PUBLIC_CATALOG_SCHEMA = 'nirs4all.datasets.public-browser.v1'
export const PUBLIC_ASSET_SCHEMA = 'nirs4all.datasets.browser-dataset.v1'
export const DEFAULT_PUBLIC_CATALOG_URL = 'https://datasets.nirs4all.org/browser/catalog.json'

/** The catalog URL of this build: `VITE_PUBLIC_DATASETS_CATALOG_URL` when set, else the default
 *  (developer documentation: docs/PUBLIC_DATASETS.md). */
export function publicCatalogUrl(env: Record<string, unknown> = import.meta.env): string {
  const configured = env.VITE_PUBLIC_DATASETS_CATALOG_URL
  return typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_PUBLIC_CATALOG_URL
}

export interface PublicDatasetSource {
  id: string
  name?: string
  /** absolute URL, resolved against the fetched catalog URL */
  url: string
  /** lowercase hex SHA-256 of the asset bytes */
  sha256: string
  size_bytes: number
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
  /** the URL the catalog was finally served from (relative source URLs resolve against it) */
  url: string
  /** public entries only, in catalog order */
  datasets: PublicDatasetEntry[]
  /** entries withheld because their tier is not `public` */
  withheld: number
}

export type PublicDatasetErrorKind = 'unreachable' | 'http' | 'schema' | 'integrity' | 'choice'

/** A refusal at the public-catalog trust boundary; `kind` drives the user-facing remedy. */
export class PublicDatasetError extends Error {
  constructor(message: string, readonly kind: PublicDatasetErrorKind) {
    super(message)
    this.name = 'PublicDatasetError'
  }
}

export const isAbortError = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/** Every request is a credential-less, cancellable GET; the browser sends no cookies or auth. */
const requestInit = (signal: AbortSignal | undefined, accept: string): RequestInit => ({
  method: 'GET',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
  headers: { Accept: accept },
  signal,
})

async function request(url: string, what: string, signal: AbortSignal | undefined, accept: string, fetchImpl: FetchLike | undefined): Promise<Response> {
  let response: Response
  try {
    // The one network read of the app shell: a credential-less public GET (allowed by name in
    // src/app/client-side-only.test.ts). Nothing is ever sent but the request itself.
    response = fetchImpl ? await fetchImpl(url, requestInit(signal, accept)) : await fetch(url, requestInit(signal, accept))
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new PublicDatasetError(`Could not reach the ${what} at ${url}. It may not be available yet, or the connection failed; try again later.`, 'unreachable')
  }
  if (!response.ok) {
    const missing = response.status === 404 || response.status === 410
    throw new PublicDatasetError(
      missing
        ? `The ${what} is not available yet at ${url} (HTTP ${response.status}); try again later.`
        : `The ${what} at ${url} answered HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}; try again later.`,
      missing ? 'unreachable' : 'http',
    )
  }
  return response
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const SHA256_HEX = /^[0-9a-f]{64}$/i
const schemaError = (message: string) => new PublicDatasetError(`The public dataset catalog is malformed: ${message}`, 'schema')

function parseSource(raw: unknown, datasetId: string, baseUrl: string): PublicDatasetSource {
  if (!isRecord(raw)) throw schemaError(`dataset "${datasetId}" has a source that is not an object.`)
  const { id, name, url, sha256, size_bytes: size } = raw
  if (!isText(id)) throw schemaError(`dataset "${datasetId}" has a source without an id.`)
  const where = `source "${id}" of dataset "${datasetId}"`
  if (name !== undefined && typeof name !== 'string') throw schemaError(`${where} has a non-text name.`)
  if (!isText(url)) throw schemaError(`${where} has no url.`)
  if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) throw schemaError(`${where} has no hex SHA-256.`)
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) throw schemaError(`${where} has no positive integer size_bytes.`)
  let resolved: URL
  try {
    resolved = new URL(url, baseUrl)
  } catch {
    throw schemaError(`${where} has an invalid url "${url}".`)
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') throw schemaError(`${where} url must be http(s), got "${resolved.protocol}".`)
  return { id, ...(isText(name) ? { name } : {}), url: resolved.href, sha256: sha256.toLowerCase(), size_bytes: size }
}

/**
 * Validate a catalog document and keep its public entries. Entries of another tier are withheld
 * (counted, never shown or fetched); a malformed public entry refuses the whole catalog.
 */
export function parsePublicCatalog(value: unknown, baseUrl: string): PublicCatalog {
  if (!isRecord(value) || value.schema !== PUBLIC_CATALOG_SCHEMA) throw schemaError(`expected schema "${PUBLIC_CATALOG_SCHEMA}".`)
  if (!Array.isArray(value.datasets)) throw schemaError('"datasets" must be an array.')
  const datasets: PublicDatasetEntry[] = []
  const seen = new Set<string>()
  let withheld = 0
  for (const raw of value.datasets) {
    if (!isRecord(raw)) throw schemaError('a dataset entry is not an object.')
    if (raw.tier !== 'public') {
      withheld += 1
      continue
    }
    const { id, name, license, description, sources } = raw
    if (!isText(id)) throw schemaError('a public dataset has no id.')
    if (seen.has(id)) throw schemaError(`dataset id "${id}" is listed twice.`)
    seen.add(id)
    if (!isText(name)) throw schemaError(`dataset "${id}" has no name.`)
    if (!isText(license)) throw schemaError(`dataset "${id}" has no license.`)
    if (description !== undefined && typeof description !== 'string') throw schemaError(`dataset "${id}" has a non-text description.`)
    if (!Array.isArray(sources) || sources.length === 0) throw schemaError(`dataset "${id}" lists no source.`)
    const parsed = sources.map((s) => parseSource(s, id, baseUrl))
    if (new Set(parsed.map((s) => s.id)).size !== parsed.length) throw schemaError(`dataset "${id}" lists a source id twice.`)
    datasets.push({ id, name, tier: 'public', license, ...(isText(description) ? { description } : {}), sources: parsed })
  }
  return { url: baseUrl, datasets, withheld }
}

export interface PublicFetchOptions {
  signal?: AbortSignal
  /** injected for tests; defaults to the browser fetch */
  fetch?: FetchLike
}

/** Fetch and validate the public catalog (metadata only: no dataset bytes are downloaded). */
export async function fetchPublicCatalog(url: string = publicCatalogUrl(), options: PublicFetchOptions = {}): Promise<PublicCatalog> {
  const response = await request(url, 'public dataset catalog', options.signal, 'application/json', options.fetch)
  let value: unknown
  try {
    value = await response.json()
  } catch (e) {
    if (isAbortError(e)) throw e
    throw schemaError('the response is not JSON.')
  }
  return parsePublicCatalog(value, response.url || url)
}

/** Free-text search over the visible catalog fields (name, id, license, description, sources). */
export function searchPublicDatasets(datasets: PublicDatasetEntry[], query: string): PublicDatasetEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return datasets
  return datasets.filter((d) => {
    const text = [d.name, d.id, d.license, d.description ?? '', ...d.sources.flatMap((s) => [s.id, s.name ?? ''])].join(' ').toLowerCase()
    return terms.every((t) => text.includes(t))
  })
}

/** The source the user selected. A dataset with several sources needs an explicit choice. */
export function resolvePublicSource(dataset: PublicDatasetEntry, sourceId?: string): PublicDatasetSource {
  if (sourceId === undefined) {
    if (dataset.sources.length === 1) return dataset.sources[0]
    throw new PublicDatasetError(`"${dataset.name}" publishes ${dataset.sources.length} sources (${dataset.sources.map((s) => s.id).join(', ')}); choose one — Web does not take the first.`, 'choice')
  }
  const source = dataset.sources.find((s) => s.id === sourceId)
  if (!source) throw new PublicDatasetError(`"${dataset.name}" has no source "${sourceId}".`, 'choice')
  return source
}

export const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

export type PublicImportPhase = 'downloading' | 'verifying' | 'decoding'
export interface PublicImportProgress {
  phase: PublicImportPhase
  receivedBytes: number
  totalBytes: number
}

/**
 * Download one asset and verify it against its catalog entry: the body may not exceed the
 * declared size (the read stops as soon as it does), must match it exactly, and its SHA-256 must
 * equal the declared digest. Cancellation goes through `signal`.
 */
export async function downloadPublicAsset(
  source: PublicDatasetSource,
  options: PublicFetchOptions & { onProgress?: (p: PublicImportProgress) => void } = {},
): Promise<Uint8Array> {
  const { signal, onProgress } = options
  const total = source.size_bytes
  const response = await request(source.url, `dataset asset "${source.id}"`, signal, 'application/json', options.fetch)
  const tooLarge = () => new PublicDatasetError(`Dataset asset "${source.id}" is larger than the ${total} bytes declared by the catalog; it was not read further.`, 'integrity')
  const bytes = new Uint8Array(total)
  let received = 0
  onProgress?.({ phase: 'downloading', receivedBytes: 0, totalBytes: total })
  const reader = response.body?.getReader()
  if (reader) {
    try {
      for (;;) {
        signal?.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        if (received + value.byteLength > total) throw tooLarge()
        bytes.set(value, received)
        received += value.byteLength
        onProgress?.({ phase: 'downloading', receivedBytes: received, totalBytes: total })
      }
    } catch (e) {
      void reader.cancel().catch(() => undefined)
      throw e
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > total) throw tooLarge()
    bytes.set(buffer)
    received = buffer.byteLength
    onProgress?.({ phase: 'downloading', receivedBytes: received, totalBytes: total })
  }
  signal?.throwIfAborted()
  if (received !== total) throw new PublicDatasetError(`Dataset asset "${source.id}" has ${received} bytes, but the catalog declares ${total}.`, 'integrity')
  onProgress?.({ phase: 'verifying', receivedBytes: received, totalBytes: total })
  const digest = await sha256Hex(bytes)
  signal?.throwIfAborted()
  if (digest !== source.sha256) throw new PublicDatasetError(`Dataset asset "${source.id}" does not match its catalog SHA-256 (expected ${source.sha256}, got ${digest}); it was refused.`, 'integrity')
  return bytes
}

/** The verified asset document: owner provenance and the published nirs4all-io `assembled_full`. */
export interface PublicAsset {
  provenance: Record<string, unknown>
  assembled: Record<string, unknown>
}

/** Validate the asset envelope and that it is the asset of the selected dataset and source. */
export function parsePublicAsset(bytes: Uint8Array, dataset: PublicDatasetEntry, source: PublicDatasetSource): PublicAsset {
  const refuse = (why: string) => new PublicDatasetError(`Dataset asset "${source.id}" of "${dataset.id}" was refused: ${why}`, 'schema')
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw refuse('it is not UTF-8 JSON.')
  }
  if (!isRecord(value) || value.schema !== PUBLIC_ASSET_SCHEMA) throw refuse(`expected schema "${PUBLIC_ASSET_SCHEMA}".`)
  if (value.dataset_id !== dataset.id) throw refuse(`it declares dataset "${String(value.dataset_id)}".`)
  if (value.source_id !== source.id) throw refuse(`it declares source "${String(value.source_id)}".`)
  if (!isRecord(value.provenance)) throw refuse('it carries no provenance object.')
  if (!isRecord(value.assembled)) throw refuse('it carries no assembled object.')
  return { provenance: value.provenance, assembled: value.assembled }
}

/** The IO owner adapter from the native `assembled_full` JSON to the WASM `assembleDataset` shape. */
export type AssembledDecoder = (value: unknown) => unknown

const loadOwnerDecoder = async (): Promise<AssembledDecoder> => (await import('@/engine/wasm/io/assembled-wire')).decodeAssembledFull

/**
 * The complete published evidence of an imported public dataset, kept beside the engine view:
 * the catalog entry and selected source, the verified digest, the owner provenance and the
 * IO-decoded record with every partition, target, metadata column, identity, axis and mask.
 */
export interface PublicDatasetRetained {
  catalogUrl: string
  dataset: PublicDatasetEntry
  source: PublicDatasetSource
  sha256: string
  provenance: Record<string, unknown>
  record: AssembledFull
}

/** Download, verify and IO-decode the selected source of a public dataset (one asset, nothing else). */
export async function downloadPublicDataset(
  catalogUrl: string,
  dataset: PublicDatasetEntry,
  sourceId: string | undefined,
  options: PublicFetchOptions & { onProgress?: (p: PublicImportProgress) => void; decode?: AssembledDecoder } = {},
): Promise<PublicDatasetRetained> {
  if (dataset.tier !== 'public') throw new PublicDatasetError(`"${dataset.id}" is not a public dataset.`, 'choice')
  const source = resolvePublicSource(dataset, sourceId)
  const bytes = await downloadPublicAsset(source, options)
  const asset = parsePublicAsset(bytes, dataset, source)
  options.onProgress?.({ phase: 'decoding', receivedBytes: source.size_bytes, totalBytes: source.size_bytes })
  const decode = options.decode ?? (await loadOwnerDecoder())
  options.signal?.throwIfAborted()
  const record = decode(asset.assembled)
  if (!isRecord(record) || !isRecord(record.blocks)) throw new PublicDatasetError(`nirs4all-io did not decode dataset asset "${source.id}" into an assembled record.`, 'schema')
  return { catalogUrl, dataset, source, sha256: source.sha256, provenance: asset.provenance, record: record as unknown as AssembledFull }
}

/** Host-boundary key of the retained public evidence. An enumerable symbol property, like
 *  `IO_RECORD`: the `{ ...ds }` patches of the app keep the reference, while the structured clone
 *  sent to the engine worker drops symbol keys (no copy, nothing leaves the host). */
export const PUBLIC_DATASET_RECORD: unique symbol = Symbol.for('nirs4all.web.public-dataset-record')

/** A dataset view that may carry its retained public evidence. */
export type PublicMaterializedDataset = MaterializedDataset & { [PUBLIC_DATASET_RECORD]?: PublicDatasetRetained }

/** The retained public evidence of a dataset imported from the catalog (undefined otherwise). */
export const publicDatasetOf = (dataset: MaterializedDataset): PublicDatasetRetained | undefined =>
  (dataset as PublicMaterializedDataset)[PUBLIC_DATASET_RECORD]

/** A public import needs an explicit displayed target when several are available. */
export class PublicDatasetTargetChoiceRequired extends Error {
  constructor(message: string, readonly options: string[]) {
    super(message)
    this.name = 'PublicDatasetTargetChoiceRequired'
  }
}

/**
 * Project a downloaded public dataset to the engine view through `mapAssembledToMaterialized`.
 * Several assembled targets throw `PublicDatasetTargetChoiceRequired` until `choice.target` names one; the
 * record is only read, so another choice reprojects it without downloading again.
 */
export function projectPublicDataset(retained: PublicDatasetRetained, choice: IoProjectionChoice = {}): PublicMaterializedDataset {
  const dataset: PublicMaterializedDataset = mapAssembledToMaterialized(retained.record, choice)
  const names = dataset.targets?.map((target) => target.name) ?? []
  if (choice.target === undefined && names.length > 1) {
    throw new PublicDatasetTargetChoiceRequired(`This dataset carries ${names.length} targets (${names.join(', ')}); choose one to display. All targets remain available when launching a run.`, names)
  }
  dataset[PUBLIC_DATASET_RECORD] = retained
  return dataset
}

/** Display name of an imported dataset: the catalog name, plus the source when there are several. */
export const publicDatasetName = (dataset: PublicDatasetEntry, source: PublicDatasetSource): string =>
  dataset.sources.length > 1 ? `${dataset.name} — ${source.name ?? source.id}` : dataset.name

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
