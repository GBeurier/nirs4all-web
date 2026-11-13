import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerClient, WorkspaceRecord } from '@nirs4all/server-client'
import type { IoRetained } from '@/data/wasm-io'
import { ioRetainedOf, rehydrateIoRetained } from '@/data/wasm-io'
import type { MaterializedDataset, RunResult } from '@/engine/types'
import type { LoadedModel } from './n4a'
import {
  createWebWorkspaceArchive, loadWebWorkspace, readWebWorkspaceArchive,
  WEB_WORKSPACE, webWorkspaceSnapshot, workspaceArchiveSha, type WebWorkspaceInput,
} from './serverWorkspace'

const core = vi.hoisted(() => ({
  manifest: {} as Record<string, unknown>,
  members: new Map<string, Uint8Array>(),
  closed: false,
  sha: 'a'.repeat(64),
  readMember: vi.fn(),
  close: vi.fn(),
  exportModel: vi.fn(),
  exportN4a: vi.fn(async () => new Uint8Array([78, 52, 65])),
  importN4a: vi.fn(),
}))
vi.mock('@/engine/nirs4all-core', () => ({
  writeN4aContainer: vi.fn(async (manifest: Record<string, unknown>, members: { path: string; bytes: Uint8Array }[]) => {
    core.manifest = manifest
    core.members = new Map(members.map((member) => [member.path, member.bytes.slice()]))
    const inventory = await Promise.all(members.map(async (member) => ({
      path: member.path, byte_length: member.bytes.length,
      sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', member.bytes as BufferSource)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    })))
    core.manifest.members = inventory
    return { archiveBytes: new Uint8Array([1, 2, 3]), receipt: { members: inventory } }
  }),
  openN4aContainer: vi.fn(async () => {
    core.closed = false
    return {
      view: () => ({ readability: { container_sha256: core.sha } }),
      manifestBytes: () => new TextEncoder().encode(JSON.stringify(core.manifest)),
      readMember: async (path: string) => {
        core.readMember(path)
        await Promise.resolve()
        if (core.closed) throw new Error('Core handle closed before async read completed')
        return core.members.get(path)?.slice()
      },
      close: () => { core.closed = true; core.close() },
    }
  }),
}))
vi.mock('./n4a', () => ({ exportN4aContainer: core.exportN4a, parseN4aFile: core.importN4a }))

const input = (): WebWorkspaceInput => ({
  pipeline: {
    name: 'Exact editor recipe', steps: [],
    containers: [{ id: 'search', container: 'generator', mode: 'or', branches: [{ id: 'choice', steps: [{ id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {}, sweeps: { epsilon: { type: 'or', choices: [1e-9, 1e-8] } } }] }] }],
  },
  editor: { step: 'pipeline', theme: 'dark' }, dataset: null, selectedRun: null, loadedModel: null, loadedModelArchive: null,
})
const noPrivateContent = { includeDataset: false, includeModel: false, allowTrainingRows: false }
const engine = { exportModel: core.exportModel }
const model: LoadedModel = { name: 'Owner model', taskType: 'regression', targetName: 'concentration', model: { dsl: { name: 'Fitted recipe', steps: [] }, nFeatures: 2, taskType: 'regression', state: { owner: 'opaque' } } }

beforeEach(() => {
  vi.clearAllMocks()
  core.members = new Map()
  core.sha = 'a'.repeat(64)
  core.importN4a.mockResolvedValue(model)
})

describe('Web workspace host boundary', () => {
  it('keeps the complete editor tree and only transfers pipeline/editor state by default', async () => {
    const source = input()
    const archive = await createWebWorkspaceArchive(source, noPrivateContent, engine)
    const restored = await readWebWorkspaceArchive(archive, core.sha)
    expect(restored.pipeline).toEqual(source.pipeline)
    expect(restored.editor).toEqual(source.editor)
    expect(restored.dataset).toBeNull()
    expect(restored.loadedModel).toBeNull()
    expect(core.exportModel).not.toHaveBeenCalled()
    expect(core.importN4a).not.toHaveBeenCalled()
    expect(core.close).toHaveBeenCalledOnce()
    expect(core.closed).toBe(true)
  })

  it('preserves NaN, signed zero, identities, axes and complete typed IO evidence on explicit consent', async () => {
    const dataset: MaterializedDataset = {
      X: new Float64Array([NaN, -0, 3, 4]), y: new Float64Array([1, NaN]),
      nSamples: 2, nFeatures: 2, axis: [1000, 1010], axisUnit: 'cm-1',
      targetName: 'concentration', taskType: 'regression', sampleIds: ['sample-a', 'sample-a'],
      observationIds: ['scan-1', 'scan-2'], groupIds: ['group-a', 'group-a'], originIds: ['source-a', 'source-a'],
      partitions: ['train', 'test'], partitionNames: ['cal', 'val'], heldOutName: 'val',
      identity: { basis: 'declared', sampleIdColumn: 'Sample_ID', observationIdColumn: 'Scan_ID', groupColumn: 'Group' },
    }
    const retained = {
      inputs: [{ name: 'source.csv', bytes: new Uint8Array([0, 255, 10]) }],
      analysis: { decoded: [], plan: null, readers: { count: 1, features: {} } }, spec: {},
      record: { blocks: { cal: { x: [{ data: new Float32Array([1, NaN]), validity: new Uint8Array([1, 0]), dtype: 'float32', unit: 'absorbance' }] } } },
    } as unknown as IoRetained
    rehydrateIoRetained(dataset, retained)
    const source = { ...input(), dataset, datasetName: 'Exact private source' }
    const archive = await createWebWorkspaceArchive(source, { ...noPrivateContent, includeDataset: true }, engine)
    const restored = await readWebWorkspaceArchive(archive, core.sha)
    expect(restored.dataset).toEqual(dataset)
    expect(Object.is(restored.dataset?.X[1], -0)).toBe(true)
    expect(Number.isNaN(restored.dataset!.X[0])).toBe(true)
    expect(ioRetainedOf(restored.dataset!)).toEqual(retained)
    expect(ioRetainedOf(restored.dataset!)?.inputs[0].bytes).toBeInstanceOf(Uint8Array)
    expect(restored.datasetName).toBe('Exact private source')
    expect(core.closed).toBe(true)
  })

  it('delegates fitted export to the existing engine with the exact training-row decision', async () => {
    const run = { model: model.model } as RunResult
    core.exportModel.mockResolvedValueOnce(model.model)
    const archive = await createWebWorkspaceArchive({ ...input(), selectedRun: run }, { ...noPrivateContent, includeModel: true }, engine)
    expect(core.exportModel).toHaveBeenCalledWith(model.model, { allowTrainingRows: false })
    expect(core.exportN4a).toHaveBeenCalledWith(run, model.model)
    const restored = await readWebWorkspaceArchive(archive, core.sha)
    expect(core.importN4a).toHaveBeenCalledOnce()
    expect(Array.from(new Uint8Array(await restored.modelArchive!.arrayBuffer()))).toEqual([78, 52, 65])
    expect(restored.loadedModel).toBe(model)
  })

  it('reuses exact owner-imported bytes after reopen with explicit original-archive consent', async () => {
    const original = new Blob([new Uint8Array([4, 8, 15, 16, 23, 42])])
    const source = { ...input(), loadedModel: model, loadedModelArchive: { model, archive: original } }
    await expect(createWebWorkspaceArchive(source, { ...noPrivateContent, includeModel: true }, engine)).rejects.toThrow(/Explicit consent/)
    const archive = await createWebWorkspaceArchive(source, { ...noPrivateContent, includeModel: true, allowTrainingRows: true }, engine)
    const restored = await readWebWorkspaceArchive(archive, core.sha)
    expect(new Uint8Array(await restored.modelArchive!.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()))
    expect(core.exportModel).not.toHaveBeenCalled()
    expect(core.importN4a).toHaveBeenCalledOnce()
  })

  it('refuses stale raw bytes bound to another imported model before upload', async () => {
    const source = { ...input(), loadedModel: model, loadedModelArchive: { model: { ...model }, archive: new Blob(['other']) } }
    await expect(createWebWorkspaceArchive(source, { ...noPrivateContent, includeModel: true, allowTrainingRows: true }, engine)).rejects.toThrow(/original model archive is unavailable/)
  })

  it('refuses unknown profiles and closes the Core handle on refusal', async () => {
    await createWebWorkspaceArchive(input(), noPrivateContent, engine)
    core.manifest.required_features = ['nirs4all-web-workspace@2']
    await expect(readWebWorkspaceArchive(new Blob(['ignored mock bytes']), core.sha)).rejects.toThrow(/Unsupported or invalid/)
    expect(core.close).toHaveBeenCalledOnce()
    expect(core.importN4a).not.toHaveBeenCalled()
  })

  it('closes the Core handle after a missing binary member, without returning partial state', async () => {
    const source = { ...input(), loadedModel: model, loadedModelArchive: { model, archive: new Blob(['model']) } }
    await createWebWorkspaceArchive(source, { ...noPrivateContent, includeModel: true, allowTrainingRows: true }, engine)
    const binaryPath = [...core.members.keys()].find((path) => path !== WEB_WORKSPACE.path)!
    core.members.delete(binaryPath)
    await expect(readWebWorkspaceArchive(new Blob(['ignored mock bytes']), core.sha)).rejects.toThrow()
    expect(core.close).toHaveBeenCalledOnce()
    expect(core.importN4a).not.toHaveBeenCalled()
  })
})

describe('project-scoped server references', () => {
  const sha = 'a'.repeat(64)
  const record = (): WorkspaceRecord => ({ workspace_id: 'workspace-1', revision: 7, snapshot: webWorkspaceSnapshot('Name', sha) })

  it('keeps server metadata small and refuses unknown/mismatched archive references', () => {
    expect(webWorkspaceSnapshot('Name', sha)).toEqual({ name: 'Name', artifacts: [sha], resources: [], metadata: { app: 'nirs4all.web', schema: 'nirs4all.web.workspace', schema_version: 1, archive: sha } })
    expect(workspaceArchiveSha(record())).toBe(sha)
    const wrong = record()
    wrong.snapshot.metadata.archive = 'b'.repeat(64)
    expect(() => workspaceArchiveSha(wrong)).toThrow(/Unsupported or invalid/)
    const future = record()
    future.snapshot.metadata.schema_version = 2
    expect(() => workspaceArchiveSha(future)).toThrow(/Unsupported or invalid/)
  })

  it('uses one immutable client and refuses foreign artifact access before downloading state', async () => {
    const getWorkspace = vi.fn(async () => record())
    const getArtifact = vi.fn(async () => { throw new Error('project scoped 404') })
    const downloadArtifact = vi.fn()
    const client = { getWorkspace, getArtifact, downloadArtifact } as unknown as ServerClient
    await expect(loadWebWorkspace(client, 'workspace-1')).rejects.toThrow(/project scoped 404/)
    expect(getArtifact).toHaveBeenCalledWith(sha)
    expect(downloadArtifact).not.toHaveBeenCalled()
  })

  it('refuses a same-size valid archive with another Core digest before member reads or restoration', async () => {
    const archive = await createWebWorkspaceArchive(input(), noPrivateContent, engine)
    // A valid alternative archive can have exactly the same length. Internal integrity
    // is represented by the Core receipt, which names a different container digest.
    core.sha = 'b'.repeat(64)
    const client = {
      getWorkspace: vi.fn(async () => record()),
      getArtifact: vi.fn(async () => ({ sha256: sha, size_bytes: archive.size })),
      downloadArtifact: vi.fn(async () => archive),
    } as unknown as ServerClient
    const onRestore = vi.fn()
    await expect(loadWebWorkspace(client, 'workspace-1').then(({ state }) => onRestore(state))).rejects.toThrow(/server artifact SHA-256/)
    expect(core.readMember).not.toHaveBeenCalled()
    expect(core.importN4a).not.toHaveBeenCalled()
    expect(onRestore).not.toHaveBeenCalled()
    expect(core.close).toHaveBeenCalledOnce()
  })
})
