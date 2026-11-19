import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AssembledFull } from './wasm-io'
import nativeAsset from '../../tests/fixtures/public-dataset-assembled.json'
import {
  PublicDatasetTargetChoiceRequired,
  DEFAULT_PUBLIC_CATALOG_URL,
  PUBLIC_ASSET_SCHEMA,
  PUBLIC_CATALOG_SCHEMA,
  PUBLIC_DATASET_RECORD,
  PublicDatasetError,
  downloadPublicAsset,
  downloadPublicDataset,
  fetchPublicCatalog,
  isAbortError,
  parsePublicCatalog,
  projectPublicDataset,
  publicCatalogUrl,
  publicDatasetOf,
  resolvePublicSource,
  searchPublicDatasets,
  type FetchLike,
  type PublicDatasetEntry,
} from './public-datasets'

// The host side of public imports: catalog trust boundary, one verified asset download, the
// injected IO owner decoder, and the existing projection with explicit source/target choices.
const CATALOG_URL = 'https://datasets.example.org/browser/catalog.json'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

it('imports native wire through the real owner decoder with masks and every target retained', async () => {
  const bytes = json(nativeAsset)
  const source = { id: nativeAsset.source_id, url: 'https://datasets.example.org/native.json', sha256: sha(bytes), size_bytes: bytes.length }
  const entry: PublicDatasetEntry = { id: nativeAsset.dataset_id, name: 'Synthetic native IO dataset', tier: 'public', license: 'CC0-1.0', sources: [source] }
  const retained = await downloadPublicDataset(CATALOG_URL, entry, source.id, {
    fetch: async () => new Response(bytes),
  })
  expect(() => projectPublicDataset(retained)).toThrow(PublicDatasetTargetChoiceRequired)
  const dataset = projectPublicDataset(retained, { target: 'y' })
  expect(Array.from(dataset.X)).toEqual([0.1, 0.25, 0.2, NaN, -0, 0.35])
  expect(Object.is(dataset.X[4], -0)).toBe(true)
  expect(Array.from(dataset.y)).toEqual([1.5, 2.5, NaN])
  expect(dataset.axis).toEqual([1000, 1100])
  expect(retained.record.blocks.train.y_headers).toEqual(['y', 'cls', 'k'])
  expect(retained.record.blocks.train.x[0].validity).toEqual([true, true, true, false, true, true])
  expect(retained.record.blocks.train.metadata).toEqual(nativeAsset.assembled.blocks.train.metadata)
  const classified = projectPublicDataset(retained, { target: 'cls' })
  expect(classified.labelsRaw).toEqual(['a', 'b', 'a'])
  expect(classified.classes).toEqual(['a', 'b', 'a'])
  expect(retained.record.blocks.train.y_categorical?.cls.categories).toEqual(['a', 'b'])
  expect(publicDatasetOf({ ...dataset })).toBe(retained)
})

/** Owner numeric-coordinate packet (little-endian binary64, lowercase hex). */
const packet = (values: number[]) => {
  const view = new DataView(new ArrayBuffer(values.length * 8))
  values.forEach((v, i) => view.setFloat64(i * 8, v, true))
  return { kind: 'numeric' as const, count: values.length, data_bytes_hex: Array.from(new Uint8Array(view.buffer), (b) => b.toString(16).padStart(2, '0')).join('') }
}
/** A decoded record (WASM `assembleDataset` shape) with two targets and a metadata column. */
const decodedRecord = (): AssembledFull => ({
  name: 'corn', task_type: 'regression', signal_type: 'absorbance', n_sources: 1, folds: [],
  blocks: {
    train: {
      n_samples: 3,
      x: [{ data: Float64Array.from([1, 2, 3, 4, 5, 6]), n_rows: 3, n_cols: 2, validity: [true, true, true, true, true, true] }],
      feature_headers: [['1100', '1102']],
      feature_axes: [[{ name: 'wavelength', unit: 'nm', coordinates: packet([1100, 1102]) }]],
      header_units: ['nm'],
      signal_types: ['absorbance'],
      y: {
        columns: ['moisture', 'protein'].map((name) => ({ name, kind: 'numeric' as const, block: { n_rows: 3, n_cols: 1, validity: [true, true, true] } })),
        data: Float64Array.from([10, 1, 11, 2, 12, 3]),
      },
      y_headers: ['moisture', 'protein'],
      metadata: { n_rows: 3, columns: [{ name: 'site', values: ['a', 'b', 'c'] }] },
      weights: null,
      weights_header: null,
    },
  },
} as unknown as AssembledFull)

function fixture(sources = [{ id: 'nir', name: 'NIR' }], extra: Record<string, unknown>[] = []) {
  const assets = new Map<string, Uint8Array>()
  const catalogSources = sources.map((s) => {
    const bytes = json({ schema: PUBLIC_ASSET_SCHEMA, dataset_id: 'corn', source_id: s.id, provenance: { recipe: 'corn@1' }, assembled: { wire: s.id } })
    assets.set(`https://datasets.example.org/browser/assets/corn-${s.id}.json`, bytes)
    return { ...s, url: `assets/corn-${s.id}.json`, sha256: sha(bytes), size_bytes: bytes.byteLength }
  })
  const catalog = {
    schema: PUBLIC_CATALOG_SCHEMA,
    datasets: [
      { id: 'corn', name: 'Corn', tier: 'public', license: 'CC-BY-4.0', description: 'Corn kernels on three instruments', sources: catalogSources },
      { id: 'secret', name: 'Restricted', tier: 'private', license: 'proprietary', sources: catalogSources },
      ...extra,
    ],
  }
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    if (url === CATALOG_URL) return new Response(JSON.stringify(catalog), { status: 200 })
    const bytes = assets.get(url)
    return bytes ? new Response(bytes, { status: 200 }) : new Response('missing', { status: 404 })
  }
  return { catalog, assets, calls, fetch }
}

describe('public catalog', () => {
  it('uses the configured catalog URL, else the documented default', () => {
    expect(publicCatalogUrl({})).toBe(DEFAULT_PUBLIC_CATALOG_URL)
    expect(publicCatalogUrl({ VITE_PUBLIC_DATASETS_CATALOG_URL: '  ' })).toBe(DEFAULT_PUBLIC_CATALOG_URL)
    expect(publicCatalogUrl({ VITE_PUBLIC_DATASETS_CATALOG_URL: ' https://mirror.example/c.json ' })).toBe('https://mirror.example/c.json')
  })

  it('keeps public entries only, resolves relative source URLs and fetches without credentials', async () => {
    const f = fixture()
    const catalog = await fetchPublicCatalog(CATALOG_URL, { fetch: f.fetch })
    expect(catalog.datasets.map((d) => d.id)).toEqual(['corn'])
    expect(catalog.withheld).toBe(1)
    expect(catalog.datasets[0].license).toBe('CC-BY-4.0')
    expect(catalog.datasets[0].sources[0].url).toBe('https://datasets.example.org/browser/assets/corn-nir.json')
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].init.credentials).toBe('omit')
    expect(f.calls[0].init.method).toBe('GET')
  })

  it('refuses malformed public entries and reports a missing endpoint actionably', async () => {
    const f = fixture()
    expect(() => parsePublicCatalog({ ...f.catalog, schema: 'other' }, CATALOG_URL)).toThrow(/expected schema/)
    const source0 = (f.catalog.datasets[0] as { sources: Record<string, unknown>[] }).sources[0]
    const bad = (patch: Record<string, unknown>) => ({ schema: PUBLIC_CATALOG_SCHEMA, datasets: [{ ...f.catalog.datasets[0], ...patch }] })
    expect(() => parsePublicCatalog(bad({ license: '' }), CATALOG_URL)).toThrow(/no license/)
    expect(() => parsePublicCatalog(bad({ sources: [{ ...source0, sha256: 'abc' }] }), CATALOG_URL)).toThrow(/SHA-256/)
    expect(() => parsePublicCatalog(bad({ sources: [{ ...source0, size_bytes: 1.5 }] }), CATALOG_URL)).toThrow(/size_bytes/)
    expect(() => parsePublicCatalog(bad({ sources: [{ ...source0, url: 'file:///etc/passwd' }] }), CATALOG_URL)).toThrow(/http\(s\)/)

    const missing: FetchLike = async () => new Response('', { status: 404 })
    await expect(fetchPublicCatalog(CATALOG_URL, { fetch: missing })).rejects.toThrow(/public dataset catalog is not available yet at https:\/\/datasets\.example\.org\/browser\/catalog\.json \(HTTP 404\); try again later/)
    const offline: FetchLike = async () => { throw new TypeError('Failed to fetch') }
    const unreachable = await fetchPublicCatalog(CATALOG_URL, { fetch: offline }).catch((e: Error) => e)
    expect(unreachable).toMatchObject({ kind: 'unreachable' })
    // product messages name the URL and the remedy, never build configuration
    expect((unreachable as Error).message).not.toMatch(/VITE_|import\.meta|build/i)
  })

  it('searches name, id, license and description', async () => {
    const { datasets } = await fetchPublicCatalog(CATALOG_URL, { fetch: fixture().fetch })
    expect(searchPublicDatasets(datasets, 'cc-by')).toHaveLength(1)
    expect(searchPublicDatasets(datasets, 'kernels corn')).toHaveLength(1)
    expect(searchPublicDatasets(datasets, 'wheat')).toHaveLength(0)
    expect(searchPublicDatasets(datasets, '  ')).toHaveLength(1)
  })
})

describe('public asset download', () => {
  const entryOf = async (f: ReturnType<typeof fixture>): Promise<PublicDatasetEntry> => (await fetchPublicCatalog(CATALOG_URL, { fetch: f.fetch })).datasets[0]

  it('requires an explicit source when a dataset publishes several, and downloads only that one', async () => {
    const f = fixture([{ id: 'nir', name: 'NIR' }, { id: 'mir', name: 'MIR' }])
    const entry = await entryOf(f)
    expect(() => resolvePublicSource(entry)).toThrow(/2 sources.*choose one/)
    expect(() => resolvePublicSource(entry, 'raman')).toThrow(/no source "raman"/)
    const decode = vi.fn(() => decodedRecord())
    await downloadPublicDataset(CATALOG_URL, entry, 'mir', { fetch: f.fetch, decode })
    expect(f.calls.map((c) => c.url)).toEqual([CATALOG_URL, 'https://datasets.example.org/browser/assets/corn-mir.json'])
    expect(decode).toHaveBeenCalledWith({ wire: 'mir' })
  })

  it('verifies size and SHA-256 at the trust boundary', async () => {
    const f = fixture()
    const entry = await entryOf(f)
    const source = entry.sources[0]
    const progress: number[] = []
    const ok = await downloadPublicAsset(source, { fetch: f.fetch, onProgress: (p) => p.phase === 'downloading' && progress.push(p.receivedBytes) })
    expect(ok.byteLength).toBe(source.size_bytes)
    expect(progress.at(-1)).toBe(source.size_bytes)

    const tampered = new Uint8Array(f.assets.get(source.url)!)
    tampered[tampered.length - 2] ^= 1
    const swap: FetchLike = async () => new Response(tampered, { status: 200 })
    await expect(downloadPublicAsset(source, { fetch: swap })).rejects.toThrow(/does not match its catalog SHA-256/)
    const longer: FetchLike = async () => new Response(new Uint8Array(source.size_bytes + 1), { status: 200 })
    await expect(downloadPublicAsset(source, { fetch: longer })).rejects.toThrow(/larger than/)
    const shorter: FetchLike = async () => new Response(new Uint8Array(source.size_bytes - 1), { status: 200 })
    await expect(downloadPublicAsset(source, { fetch: shorter })).rejects.toThrow(/catalog declares/)
    const failing: FetchLike = async () => new Response('', { status: 503, statusText: 'Service Unavailable' })
    await expect(downloadPublicAsset(source, { fetch: failing })).rejects.toMatchObject({ kind: 'http' })
  })

  it('refuses an asset that names another dataset or source', async () => {
    const f = fixture()
    const entry = await entryOf(f)
    const other = json({ schema: PUBLIC_ASSET_SCHEMA, dataset_id: 'wheat', source_id: 'nir', provenance: {}, assembled: {} })
    const source = { ...entry.sources[0], sha256: sha(other), size_bytes: other.byteLength }
    const swap: FetchLike = async () => new Response(other, { status: 200 })
    await expect(downloadPublicDataset(CATALOG_URL, { ...entry, sources: [source] }, undefined, { fetch: swap, decode: decodedRecord })).rejects.toThrow(/declares dataset "wheat"/)
  })

  it('cancels through the abort signal', async () => {
    const f = fixture()
    const entry = await entryOf(f)
    const controller = new AbortController()
    const stalled: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
    const pending = downloadPublicDataset(CATALOG_URL, entry, undefined, { fetch: stalled, signal: controller.signal, decode: decodedRecord })
    controller.abort()
    const error = await pending.catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
    expect(error).not.toBeInstanceOf(PublicDatasetError)

    // aborted after download: decoding never starts
    const late = new AbortController()
    const decode = vi.fn(() => decodedRecord())
    const result = downloadPublicDataset(CATALOG_URL, entry, undefined, { fetch: f.fetch, signal: late.signal, decode, onProgress: (p) => p.phase === 'verifying' && late.abort() })
    expect(isAbortError(await result.catch((e: unknown) => e))).toBe(true)
    expect(decode).not.toHaveBeenCalled()
  })
})

describe('public dataset projection', () => {
  it('asks for an explicit target and keeps the complete record and provenance', async () => {
    const f = fixture()
    const entry = (await fetchPublicCatalog(CATALOG_URL, { fetch: f.fetch })).datasets[0]
    const retained = await downloadPublicDataset(CATALOG_URL, entry, undefined, { fetch: f.fetch, decode: decodedRecord })
    let choice: unknown
    try {
      projectPublicDataset(retained)
    } catch (e) {
      choice = e
    }
    expect(choice).toBeInstanceOf(PublicDatasetTargetChoiceRequired)
    expect((choice as PublicDatasetTargetChoiceRequired).options).toEqual(['moisture', 'protein'])

    const ds = projectPublicDataset(retained, { target: 'protein' })
    expect(Array.from(ds.yRaw ?? [])).toEqual([1, 2, 3])
    const kept = publicDatasetOf(ds)!
    expect(kept.provenance).toEqual({ recipe: 'corn@1' })
    expect(kept.sha256).toBe(entry.sources[0].sha256)
    expect(kept.record.blocks.train.y_headers).toEqual(['moisture', 'protein'])
    expect(kept.record.blocks.train.metadata?.columns[0].values).toEqual(['a', 'b', 'c'])
  })

  it('keeps the evidence by reference through app patches and out of worker clones', async () => {
    const f = fixture()
    const entry = (await fetchPublicCatalog(CATALOG_URL, { fetch: f.fetch })).datasets[0]
    const retained = await downloadPublicDataset(CATALOG_URL, entry, undefined, { fetch: f.fetch, decode: decodedRecord })
    const ds = projectPublicDataset(retained, { target: 'moisture' })
    // a config patch such as `{ ...ds, targetName }` keeps the same evidence object, not a copy
    const patched = { ...ds, targetName: 'moisture (%)' }
    expect(publicDatasetOf(patched)).toBe(retained)
    expect(publicDatasetOf(patched)!.record.blocks.train.y_headers).toEqual(['moisture', 'protein'])
    expect(Object.getOwnPropertySymbols(ds)).toContain(PUBLIC_DATASET_RECORD)
    // the structured clone posted to the engine worker carries none of it
    const cloned = structuredClone(patched)
    expect(publicDatasetOf(cloned)).toBeUndefined()
    expect(Object.getOwnPropertySymbols(cloned)).toEqual([])
    expect(JSON.stringify(Object.keys(cloned))).not.toMatch(/provenance|record/)
    expect(Array.from(cloned.yRaw ?? [])).toEqual([10, 11, 12])
  })
})
