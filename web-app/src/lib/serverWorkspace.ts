import type { ServerClient, WorkspaceRecord, WorkspaceSnapshot } from '@nirs4all/server-client'
import { packState, unpackState } from '@nirs4all/server-client/state'
import { ioRetainedOf, rehydrateIoRetained, type IoRetained } from '@/data/wasm-io'
import { IO_RECORD, type Engine, type MaterializedDataset, type PipelineDSL, type RunResult } from '@/engine/types'
import { openN4aContainer, writeN4aContainer } from '@/engine/nirs4all-core'
import { exportN4aContainer, parseN4aFile, type LoadedModel } from './n4a'
import type { Theme } from './persist'

/** Presentation state only; no execution or portability claim. */
export const WEB_WORKSPACE = {
  app: 'nirs4all.web',
  schema: 'nirs4all.web.workspace',
  version: 1,
  owner: 'nirs4all.web.workspace',
  feature: 'nirs4all-web-workspace@1',
  path: 'workspace/state.json',
} as const

export type WorkspaceStep = 'dataset' | 'explore' | 'pipeline' | 'results' | 'predict'
export interface WorkspaceEditor { step: WorkspaceStep; theme: Theme }
export interface WebWorkspaceInput {
  pipeline: PipelineDSL
  editor: WorkspaceEditor
  dataset: MaterializedDataset | null
  datasetName?: string
  selectedRun: RunResult | null
  loadedModel: LoadedModel | null
  /** Original bytes are reusable only while bound to this exact owner-imported model. */
  loadedModelArchive: { model: LoadedModel; archive: Blob } | null
}
export interface WorkspaceConsent {
  /** Includes the complete retained IO record, provenance and original source bytes. */
  includeDataset: boolean
  includeModel: boolean
  allowTrainingRows: boolean
}
interface WorkspaceEnvelope {
  app: typeof WEB_WORKSPACE.app
  schema: typeof WEB_WORKSPACE.schema
  schema_version: typeof WEB_WORKSPACE.version
  pipeline: PipelineDSL
  editor: WorkspaceEditor
  dataset?: { view: MaterializedDataset; name: string; retained?: IoRetained }
  modelArchive?: Uint8Array
}
export interface RestoredWebWorkspace {
  pipeline: PipelineDSL
  editor: WorkspaceEditor
  dataset: MaterializedDataset | null
  datasetName?: string
  loadedModel: LoadedModel | null
  modelArchive: Blob | null
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown, count?: number): value is string[] => Array.isArray(value) && (count === undefined || value.length === count) && value.every((item) => typeof item === 'string')
function refuse(): never { throw new Error('Unsupported or invalid Web workspace state. Local work was kept.') }

/** Validate the Web presentation boundary; execution still belongs to the engine. */
function validatePipeline(value: unknown): asserts value is PipelineDSL {
  if (!object(value) || typeof value.name !== 'string' || !Array.isArray(value.steps)) refuse()
  const step = (item: unknown) => object(item) && typeof item.id === 'string' && typeof item.type === 'string' && object(item.params)
  if (!value.steps.every(step) || (value.model !== undefined && !step(value.model)) || (value.split !== undefined && !step(value.split))) refuse()
  if (value.cv !== undefined && (!object(value.cv) || !Number.isSafeInteger(value.cv.folds) || !Number.isSafeInteger(value.cv.seed))) refuse()
  const container = (item: unknown): boolean => {
    if (!object(item) || typeof item.id !== 'string' || !['branch', 'concat_transform', 'merge', 'generator'].includes(String(item.container)) || !Array.isArray(item.branches)) return false
    return item.branches.every((branch) => object(branch) && typeof branch.id === 'string' && Array.isArray(branch.steps) && branch.steps.every((child) => object(child) && ('container' in child ? container(child) : step(child))))
  }
  if (value.containers !== undefined && (!Array.isArray(value.containers) || !value.containers.every(container))) refuse()
  // This profile writes the current tree unchanged and refuses the retired display encoding.
  if (value.branch !== undefined) refuse()
}

function validateDataset(value: unknown): asserts value is MaterializedDataset {
  if (!object(value)) refuse()
  const n = value.nSamples as number
  const p = value.nFeatures as number
  if (!Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(n * p)) refuse()
  if (!(value.X instanceof Float64Array) || value.X.length !== n * p || !(value.y instanceof Float64Array) || value.y.length !== n) refuse()
  if (!Array.isArray(value.axis) || value.axis.length !== p || !value.axis.every((item) => typeof item === 'number') || typeof value.axisUnit !== 'string') refuse()
  if (!strings(value.sampleIds, n) || !strings(value.partitions, n) || !value.partitions.every((item) => ['train', 'test', 'predict'].includes(item))) refuse()
  if (typeof value.targetName !== 'string' || !['regression', 'binary', 'multiclass'].includes(String(value.taskType))) refuse()
  for (const field of ['groupIds', 'originIds', 'repetitionIds', 'observationIds']) {
    const items = value[field]
    if (items !== undefined && (!Array.isArray(items) || items.length !== n || !items.every((item) => item === null || typeof item === 'string'))) refuse()
  }
  for (const field of ['labelsRaw', 'partitionNames']) if (value[field] !== undefined && !strings(value[field], n)) refuse()
  if (value.featureNames !== undefined && !strings(value.featureNames, p)) refuse()
  if (value.yRaw !== undefined && (!(value.yRaw instanceof Float64Array) || value.yRaw.length !== n)) refuse()
  if (value.classes !== undefined && !strings(value.classes)) refuse()
  if (value.metadata !== undefined && (!Array.isArray(value.metadata) || !value.metadata.every((column) => object(column) && typeof column.name === 'string' && ['numeric', 'categorical'].includes(String(column.kind)) && Array.isArray(column.values) && column.values.length === n))) refuse()
  if (value.folds !== undefined && (!Array.isArray(value.folds) || !value.folds.every((fold) => object(fold) && Number.isSafeInteger(fold.foldId) && strings(fold.valSampleIds)))) refuse()
}

function validateEnvelope(value: unknown): asserts value is WorkspaceEnvelope {
  if (!object(value) || value.app !== WEB_WORKSPACE.app || value.schema !== WEB_WORKSPACE.schema || value.schema_version !== WEB_WORKSPACE.version) refuse()
  validatePipeline(value.pipeline)
  if (!object(value.editor) || !['dataset', 'explore', 'pipeline', 'results', 'predict'].includes(String(value.editor.step)) || !['light', 'dark'].includes(String(value.editor.theme))) refuse()
  if (value.dataset !== undefined) {
    if (!object(value.dataset) || typeof value.dataset.name !== 'string') refuse()
    validateDataset(value.dataset.view)
    const retained = value.dataset.retained
    if (retained !== undefined && (!object(retained) || !Array.isArray(retained.inputs) || !retained.inputs.every((input) => object(input) && typeof input.name === 'string' && input.bytes instanceof Uint8Array) || !object(retained.analysis) || !object(retained.spec) || !object(retained.record) || !object(retained.record.blocks))) refuse()
  }
  if (value.modelArchive !== undefined && !(value.modelArchive instanceof Uint8Array)) refuse()
}

/** Build a Core-written attachment. Only the explicit consent branches read private data. */
export async function createWebWorkspaceArchive(input: WebWorkspaceInput, consent: WorkspaceConsent, engine: Pick<Engine, 'exportModel'>): Promise<Blob> {
  const state: WorkspaceEnvelope = {
    app: WEB_WORKSPACE.app,
    schema: WEB_WORKSPACE.schema,
    schema_version: WEB_WORKSPACE.version,
    pipeline: input.pipeline,
    editor: input.editor,
  }
  if (consent.includeDataset) {
    if (!input.dataset) throw new Error('There is no dataset to include.')
    const view = { ...input.dataset }
    delete view[IO_RECORD]
    state.dataset = { view, name: input.datasetName ?? 'Dataset', retained: ioRetainedOf(input.dataset) }
  }
  if (consent.includeModel) {
    if (input.selectedRun) {
      const model = await engine.exportModel(input.selectedRun.model, { allowTrainingRows: consent.allowTrainingRows })
      state.modelArchive = await exportN4aContainer(input.selectedRun, model)
    } else if (input.loadedModel && input.loadedModelArchive?.model === input.loadedModel) {
      // Reuse owner-verified bytes, never manufacture a run or serialize an opaque model.
      // Original archives can embed training/source data beyond the imported prediction view.
      if (!consent.allowTrainingRows) throw new Error('Explicit consent is required to include the original model archive and any training/source data it contains.')
      state.modelArchive = new Uint8Array(await input.loadedModelArchive.archive.arrayBuffer())
    } else {
      throw new Error('The original model archive is unavailable. Import its .n4a file again before saving fitted state.')
    }
  }
  validateEnvelope(state)
  const { document, members } = await packState(state)
  const bytes = [{ path: WEB_WORKSPACE.path, bytes: document }, ...members]
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', document as BufferSource)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const manifest = {
    schema: 'nirs4all.n4a.container.v1', schema_version: 1, minimum_reader_version: 1,
    container_id: `container:nirs4all.web.workspace.${crypto.randomUUID()}`,
    required_features: [WEB_WORKSPACE.feature], physical_profile: 'zip-stored.v1',
    members: bytes.map(({ path }) => ({ path, byte_length: 0, sha256: '0'.repeat(64) })),
    artifacts: [{
      id: WEB_WORKSPACE.path, kind: 'attachment', owner: WEB_WORKSPACE.owner,
      content_type: { id: WEB_WORKSPACE.schema, version: WEB_WORKSPACE.version },
      identity: { owner: WEB_WORKSPACE.owner, schema: WEB_WORKSPACE.schema, schema_version: WEB_WORKSPACE.version, fingerprint_profile: 'sha256.raw.v1', fingerprint },
      storage: { kind: 'embedded', root_member: WEB_WORKSPACE.path, member_paths: bytes.map(({ path }) => path) }, requirements: null,
    }],
    links: [],
    entrypoints: [{ id: 'workspace-open', owner: WEB_WORKSPACE.owner, operation: 'host.workspace.open', root_artifact: WEB_WORKSPACE.path, input_artifacts: [], required_features: [WEB_WORKSPACE.feature], requirements: null }],
  }
  const result = await writeN4aContainer(manifest, bytes)
  if (result.receipt.members.find((member) => member.path === WEB_WORKSPACE.path)?.sha256 !== fingerprint) throw new Error('Core workspace fingerprint verification failed.')
  return new Blob([result.archiveBytes as BlobPart], { type: 'application/octet-stream' })
}

/** Core verifies every read; keep its handle alive until the asynchronous codec has finished. */
export async function readWebWorkspaceArchive(blob: Blob, expectedSha256: string): Promise<RestoredWebWorkspace> {
  const container = await openN4aContainer(blob)
  try {
    // Internal validity is insufficient: bind this exact container to the server reference.
    // Core exposes the digest for Blob/external sources without another scan or byte copy.
    if (!/^[a-f0-9]{64}$/.test(expectedSha256) || container.view().readability.container_sha256 !== expectedSha256) {
      throw new Error('The downloaded workspace does not match its server artifact SHA-256. Local work was kept.')
    }
    const manifest = JSON.parse(new TextDecoder().decode(container.manifestBytes())) as Record<string, unknown>
    if (!Array.isArray(manifest.required_features) || manifest.required_features.length !== 1 || manifest.required_features[0] !== WEB_WORKSPACE.feature
      || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1 || !Array.isArray(manifest.entrypoints) || manifest.entrypoints.length !== 1 || !Array.isArray(manifest.links) || manifest.links.length) refuse()
    const artifact = manifest.artifacts[0] as Record<string, unknown>
    const entry = manifest.entrypoints[0] as Record<string, unknown>
    if (!object(artifact) || artifact.id !== WEB_WORKSPACE.path || artifact.owner !== WEB_WORKSPACE.owner || artifact.kind !== 'attachment'
      || !object(artifact.content_type) || artifact.content_type.id !== WEB_WORKSPACE.schema || artifact.content_type.version !== WEB_WORKSPACE.version
      || !object(artifact.storage) || artifact.storage.kind !== 'embedded' || artifact.storage.root_member !== WEB_WORKSPACE.path || !strings(artifact.storage.member_paths)
      || !object(artifact.identity) || artifact.identity.owner !== WEB_WORKSPACE.owner || artifact.identity.schema !== WEB_WORKSPACE.schema || artifact.identity.schema_version !== WEB_WORKSPACE.version || artifact.identity.fingerprint_profile !== 'sha256.raw.v1'
      || !Array.isArray(manifest.members) || !manifest.members.some((member) => object(member) && member.path === WEB_WORKSPACE.path && member.sha256 === (artifact.identity as Record<string, unknown>).fingerprint)
      || !object(entry) || entry.id !== 'workspace-open' || entry.owner !== WEB_WORKSPACE.owner || entry.operation !== 'host.workspace.open' || entry.root_artifact !== WEB_WORKSPACE.path
      || !Array.isArray(entry.input_artifacts) || entry.input_artifacts.length || !Array.isArray(entry.required_features) || entry.required_features.length !== 1 || entry.required_features[0] !== WEB_WORKSPACE.feature || entry.requirements !== null) refuse()
    const paths = new Set(artifact.storage.member_paths)
    if (!paths.has(WEB_WORKSPACE.path) || paths.size !== artifact.storage.member_paths.length) refuse()
    const document = await container.readMember(WEB_WORKSPACE.path)
    if (!document) refuse()
    const state = await unpackState(document, async (path) => {
      if (!paths.has(path)) refuse()
      const member = await container.readMember(path)
      if (!member) refuse()
      return member
    })
    validateEnvelope(state)
    // This is the established owner import path; arbitrary decoded fitted objects are never activated.
    const modelArchive = state.modelArchive ? new Blob([state.modelArchive as BlobPart], { type: 'application/octet-stream' }) : null
    const loadedModel = modelArchive ? await parseN4aFile(modelArchive) : null
    const dataset = state.dataset ? rehydrateIoRetained(state.dataset.view, state.dataset.retained) : null
    return { pipeline: state.pipeline, editor: state.editor, dataset, datasetName: state.dataset?.name, loadedModel, modelArchive }
  } finally {
    container.close()
  }
}

/** Small server metadata only: private arrays live inside the referenced Core archive. */
export function webWorkspaceSnapshot(name: string, sha: string): WorkspaceSnapshot {
  return { name, artifacts: [sha], resources: [], metadata: { app: WEB_WORKSPACE.app, schema: WEB_WORKSPACE.schema, schema_version: WEB_WORKSPACE.version, archive: sha } }
}

export function workspaceArchiveSha(record: WorkspaceRecord): string {
  const { snapshot } = record
  if (!snapshot || snapshot.metadata.app !== WEB_WORKSPACE.app || snapshot.metadata.schema !== WEB_WORKSPACE.schema || snapshot.metadata.schema_version !== WEB_WORKSPACE.version
    || snapshot.artifacts.length !== 1 || snapshot.metadata.archive !== snapshot.artifacts[0] || !/^[a-f0-9]{64}$/.test(snapshot.artifacts[0])) refuse()
  return snapshot.artifacts[0]
}

/** The immutable client's verified bearer project owns every lookup; no client project selector. */
export async function loadWebWorkspace(client: ServerClient, id: string): Promise<{ record: WorkspaceRecord; state: RestoredWebWorkspace }> {
  const record = await client.getWorkspace(id)
  const sha = workspaceArchiveSha(record)
  await client.getArtifact(sha) // Foreign/unknown artifacts are refused by the project-scoped server.
  const state = await readWebWorkspaceArchive(await client.downloadArtifact(sha), sha)
  return { record, state }
}
