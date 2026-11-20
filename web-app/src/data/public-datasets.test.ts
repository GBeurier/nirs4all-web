import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { AssembledFull } from './wasm-io'
import { decodeAssembledFull } from '@/engine/wasm/io/assembled-wire'
import nativeAsset from '../../tests/fixtures/public-dataset-assembled.json'
import {
  PUBLIC_CATALOG_SCHEMA, PUBLIC_PLAN_SCHEMA, PUBLIC_DATASET_RECORD,
  PublicDatasetError, PublicDatasetTargetChoiceRequired,
  downloadPublicDataset, downloadPublicResource, loadPublicCatalog, isAbortError,
  parsePublicCatalog, projectPublicDataset, publicDatasetOf, resolvePublicSource, searchPublicDatasets,
  type FetchLike, type PublicDatasetEntry, type PublicOriginOwner, type PublicResource,
} from './public-datasets'

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const bytes = (text: string) => new TextEncoder().encode(text)

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

function fixture(sourceIds = ['nir'], pinned = true) {
  const payloads = new Map<string, Uint8Array>()
  const sources = sourceIds.map((id) => {
    const data = bytes(`original resource ${id}`)
    const resource: PublicResource = { id: `${id}-raw`, name: `${id}.csv`, url: `https://original.example/${id}.csv`, sha256: pinned ? sha(data) : null, size_bytes: pinned ? data.length : null }
    payloads.set(resource.url, data)
    return { id, name: id.toUpperCase(), status: 'supported' as const, resources: [resource] }
  })
  const entry: PublicDatasetEntry = { id: 'corn', name: 'Corn', tier: 'public', license: 'CC-BY-4.0', description: 'Corn kernels', sources }
  const catalog = {
    schema: PUBLIC_CATALOG_SCHEMA,
    provenance: { owner_version: 'candidate', index_sha256: '1'.repeat(64), recipes_sha256: '2'.repeat(64) },
    datasets: [
      entry,
      { id: 'private-metadata', tier: 'private' },
    ],
  }
  const prepared = { files: [{ name: 'canonical.csv', bytes: bytes('canonical bytes prepared by owner') }], record_sets: [],
    spec: { schema_version: 1, name: 'owner-spec', params: { na: { policy: 'ignore' } }, sample_index: { repetition_id: 'scan' } },
    provenance: { preparation: 'owner' } }
  const owner: PublicOriginOwner = {
    browserCatalog: vi.fn(() => JSON.stringify(catalog)),
    resolveBrowserPlan: vi.fn((datasetId, sourceId) => JSON.stringify({ schema: PUBLIC_PLAN_SCHEMA, dataset_id: datasetId, source_id: sourceId,
      resources: sources.find((s) => s.id === sourceId)!.resources, descriptor: { id: datasetId, tier: 'public' }, provenance: { recipe: 'corn@1' },
      opaque_owner_extension: { preserve: 'verbatim' } })),
    prepareBrowserDataset: vi.fn(() => prepared),
  }
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    const data = payloads.get(url)
    return data ? new Response(data) : new Response('', { status: 404 })
  }
  const assemble = vi.fn(() => decodedRecord())
  return { catalog, entry, owner, payloads, calls, fetch, prepared, assemble }
}
const loaded = (f: ReturnType<typeof fixture>) => loadPublicCatalog({ owner: f.owner, fetch: f.fetch })
const imported = async (f: ReturnType<typeof fixture>, sourceId?: string) => {
  const catalog = await loaded(f)
  return downloadPublicDataset(catalog, catalog.datasets[0], sourceId, f)
}

describe('owner public origin catalog', () => {
  it('loads embedded metadata without an index/catalog HTTP request and keeps only public entries', async () => {
    const f = fixture()
    const catalog = await loaded(f)
    expect(catalog.datasets.map((d) => d.id)).toEqual(['corn'])
    expect(catalog.withheld).toBe(1)
    expect(catalog.provenance).toEqual(f.catalog.provenance)
    expect(f.calls).toEqual([])
    expect(searchPublicDatasets(catalog.datasets, 'CC-BY kernels')).toHaveLength(1)
    expect(searchPublicDatasets(catalog.datasets, 'wheat')).toHaveLength(0)
  })

  it('lists unsupported sources explicitly and refuses them before resolution, fetch or preparation', async () => {
    const f = fixture()
    const raw = { ...f.catalog, datasets: [{ ...f.entry, sources: [{ id: 'matrix', name: 'MATRIX', status: 'unsupported', reason: 'This recipe requires an unsupported matrix reader.', resources: [] }] }] }
    f.owner.browserCatalog = () => JSON.stringify(raw)
    const catalog = await loaded(f)
    expect(catalog.datasets[0].sources[0].reason).toMatch(/matrix reader/)
    await expect(downloadPublicDataset(catalog, catalog.datasets[0], undefined, f)).rejects.toMatchObject({ kind: 'unsupported' })
    expect(f.calls).toEqual([])
    expect(f.owner.resolveBrowserPlan).not.toHaveBeenCalled()
    expect(f.owner.prepareBrowserDataset).not.toHaveBeenCalled()
    expect(f.assemble).not.toHaveBeenCalled()
  })

  it('refuses malformed resources, duplicate identities, unsupported-without-reason and credential URLs', () => {
    const f = fixture()
    const bad = (patch: Record<string, unknown>) => ({ ...f.catalog, datasets: [{ ...f.entry, sources: [{ ...f.entry.sources[0], ...patch }] }] })
    expect(() => parsePublicCatalog({ ...f.catalog, schema: 'unknown' })).toThrow(/expected schema/)
    expect(() => parsePublicCatalog(bad({ status: 'unsupported', reason: '' }))).toThrow(/unsupported reason/)
    const resource = f.entry.sources[0].resources[0]
    for (const change of [{ sha256: 'abc' }, { size_bytes: -1 }, { size_bytes: 1.5 }, { url: 'file:///etc/passwd' }, { url: 'https://user:secret@origin.example/a' }]) {
      expect(() => parsePublicCatalog(bad({ resources: [{ ...resource, ...change }] }))).toThrow(PublicDatasetError)
    }
    expect(() => parsePublicCatalog(bad({ resources: [resource, resource] }))).toThrow(/duplicate resource/)
    expect(parsePublicCatalog(bad({ resources: [{ ...resource, sha256: null, size_bytes: null }] })).datasets).toHaveLength(1)
  })
})

describe('declared original-source transport', () => {
  it('requires explicit spectral-source choice and fetches only that source kit without credentials', async () => {
    const f = fixture(['nir', 'mir'])
    const catalog = await loaded(f)
    expect(() => resolvePublicSource(catalog.datasets[0])).toThrow(/choose one/)
    const retained = await downloadPublicDataset(catalog, catalog.datasets[0], 'mir', f)
    expect(f.calls.map((c) => c.url)).toEqual(['https://original.example/mir.csv'])
    expect(f.calls[0].init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: '*/*' } })
    expect(retained.inputs[0].name).toBe('mir.csv')
    expect(f.owner.prepareBrowserDataset).toHaveBeenCalledWith(retained.planJson, retained.inputs)
    expect(JSON.parse(retained.planJson).opaque_owner_extension).toEqual({ preserve: 'verbatim' })
    expect(f.assemble).toHaveBeenCalledWith(f.prepared.files, f.prepared.record_sets, JSON.stringify(f.prepared.spec))
    expect(retained.prepared.spec).toBe(f.prepared.spec)
  })

  it('downloads a multi-file kit in declared order before owner preparation, without guessing roles', async () => {
    const f = fixture()
    const aux = bytes('reference metadata')
    const resource = { id: 'targets', name: 'targets.csv', url: 'https://original.example/targets.csv', sha256: sha(aux), size_bytes: aux.length }
    f.entry.sources[0].resources.push(resource)
    f.payloads.set(resource.url, aux)
    const retained = await imported(f)
    expect(f.calls.map((c) => c.url)).toEqual(['https://original.example/nir.csv', resource.url])
    expect(retained.inputs.map((file) => file.name)).toEqual(['nir.csv', 'targets.csv'])
    expect(retained.resources.map((r) => r.sha256_verified)).toEqual([true, true])
    expect(f.owner.prepareBrowserDataset).toHaveBeenCalledTimes(1)
    expect(f.assemble).toHaveBeenCalledTimes(1)
  })

  it('retains observed hashes/sizes without inventing pins when the original owner has none', async () => {
    const f = fixture(['nir'], false)
    const progress: (number | null)[] = []
    const catalog = await loaded(f)
    const retained = await downloadPublicDataset(catalog, catalog.datasets[0], undefined, { ...f, onProgress: (p) => progress.push(p.totalBytes) })
    const receipt = retained.resources[0]
    expect(receipt.resource.sha256).toBeNull()
    expect(receipt.resource.size_bytes).toBeNull()
    expect(receipt.observed_sha256).toBe(sha(f.payloads.get(receipt.resource.url)!))
    expect(receipt.observed_size_bytes).toBe(f.payloads.get(receipt.resource.url)!.length)
    expect(receipt.sha256_verified).toBe(false)
    expect(receipt.size_verified).toBe(false)
    expect(progress.every((n) => n === null)).toBe(true)
  })

  it('fails closed on real pin/size/HTTP errors before preparation or assembly', async () => {
    const f = fixture()
    const resource = f.entry.sources[0].resources[0]
    await expect(downloadPublicResource({ ...resource, sha256: '0'.repeat(64) }, f)).rejects.toThrow(/declared SHA-256/)
    await expect(downloadPublicResource({ ...resource, size_bytes: resource.size_bytes! - 1 }, f)).rejects.toThrow(/larger than/)
    await expect(downloadPublicResource({ ...resource, size_bytes: resource.size_bytes! + 1 }, f)).rejects.toThrow(/source declares/)
    const failing: FetchLike = async () => new Response('', { status: 503 })
    const catalog = await loaded(f)
    await expect(downloadPublicDataset(catalog, catalog.datasets[0], undefined, { ...f, fetch: failing })).rejects.toMatchObject({ kind: 'http' })
    expect(f.owner.prepareBrowserDataset).not.toHaveBeenCalled()
    expect(f.assemble).not.toHaveBeenCalled()
  })

  it('refuses a changed plan identity/resource kit before any network access', async () => {
    const f = fixture()
    const original = f.owner.resolveBrowserPlan
    f.owner.resolveBrowserPlan = (id, source) => JSON.stringify({ ...JSON.parse(original(id, source)), source_id: 'other' })
    await expect(imported(f)).rejects.toThrow(/selected dataset\/source/)
    expect(f.calls).toEqual([])
    f.owner.resolveBrowserPlan = (id, source) => JSON.stringify({ ...JSON.parse(original(id, source)), resources: [] })
    await expect(imported(f)).rejects.toThrow(/resource kit/)
    expect(f.calls).toEqual([])
  })

  it('cancels during network read or checking without starting preparation or assembly', async () => {
    const f = fixture()
    const catalog = await loaded(f)
    const controller = new AbortController()
    const stalled: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
    const pending = downloadPublicDataset(catalog, catalog.datasets[0], undefined, { ...f, fetch: stalled, signal: controller.signal })
    controller.abort()
    expect(isAbortError(await pending.catch((e: unknown) => e))).toBe(true)
    const late = new AbortController()
    const later = downloadPublicDataset(catalog, catalog.datasets[0], undefined, { ...f, signal: late.signal, onProgress: (p) => p.phase === 'verifying' && late.abort() })
    expect(isAbortError(await later.catch((e: unknown) => e))).toBe(true)
    expect(f.owner.prepareBrowserDataset).not.toHaveBeenCalled()
    expect(f.assemble).not.toHaveBeenCalled()
  })
})

it('projects the native owner record with masks, every target, signed zero and metadata unchanged', async () => {
  const f = fixture()
  const record = decodeAssembledFull(nativeAsset.assembled) as unknown as AssembledFull
  f.assemble = vi.fn(() => record)
  const retained = await imported(f)
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

it('keeps explicit target choices and retained provenance out of worker clones', async () => {
  const f = fixture()
  const retained = await imported(f)
  expect(() => projectPublicDataset(retained)).toThrow(PublicDatasetTargetChoiceRequired)
  const ds = projectPublicDataset(retained, { target: 'protein' })
  expect(Array.from(ds.yRaw ?? [])).toEqual([1, 2, 3])
  expect(retained.record.blocks.train.y_headers).toEqual(['moisture', 'protein'])
  expect(retained.record.blocks.train.metadata?.columns[0].values).toEqual(['a', 'b', 'c'])
  const patched = { ...ds, targetName: 'protein (%)' }
  expect(publicDatasetOf(patched)).toBe(retained)
  expect(Object.getOwnPropertySymbols(patched)).toContain(PUBLIC_DATASET_RECORD)
  expect(publicDatasetOf(structuredClone(patched))).toBeUndefined()
  expect(retained.provenance).toEqual({ catalog: f.catalog.provenance, plan: { recipe: 'corn@1' }, preparation: f.prepared.provenance })
})
