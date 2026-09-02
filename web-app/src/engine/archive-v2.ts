import {
  inspectMethodsArchiveV2Predictors,
  loadArchiveV2Native,
  replayMethodsArchiveV2,
} from './nirs4all-core'
import type { NativePredictorDescriptorV1 } from './nirs4all-core'
import type { FittedPipeline, PredictResult } from './types'

export const ARCHIVE_V2_MODEL_KIND = 'nirs4all-core/archive-v2-methods-model' as const
export const MAX_ARCHIVE_V2_BYTES = 537_938_966

interface ValidatedArchive {
  readonly archive_id: string
  readonly archive_sha256: string
  readonly artifact_id: string
  readonly binding_id: string
  readonly node_id: string
  readonly port_name: string
  target_names_json(): string
  free(): void
}

interface ArchiveNativeModule {
  ValidatedMethodsArchiveV2: new (bytes: Uint8Array) => ValidatedArchive
}

export interface ArchiveV2ModelState {
  readonly kind: typeof ARCHIVE_V2_MODEL_KIND
  readonly archiveBytes: Uint8Array
  readonly archiveId: string
  readonly archiveSha256: string
  readonly artifactId: string
  readonly bindingId: string
  readonly nodeId: string
  readonly portName: string
  readonly targetNames: readonly string[]
  readonly nativePredictorDescriptor: NativePredictorDescriptorV1
}

export interface ArchiveV2Model extends FittedPipeline {
  readonly taskType: 'regression'
  readonly nFeatures: number
  readonly state: ArchiveV2ModelState
}

export interface ImportedArchiveV2Model {
  readonly model: ArchiveV2Model
  readonly name: string
  readonly taskType: 'regression'
  readonly targetName: string
}

function archiveBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_V2_BYTES) {
    throw new RangeError('Archive V2 is empty or exceeds the canonical Core byte budget.')
  }
  return new Uint8Array(bytes)
}

function targetNames(value: string): readonly string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Core returned an invalid Archive V2 target projection.')
  }
  return Object.freeze([...parsed])
}

const SHA256 = /^[0-9a-f]{64}$/
const DESCRIPTOR_KEYS = [
  'artifact_sha256',
  'capabilities',
  'descriptor_fingerprint',
  'descriptor_type',
  'dimensions',
  'format',
  'format_version',
  'owner_controller',
  'schema_version',
  'storage_algorithm',
  'writer_abi',
] as const

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

/** Validate only the browser-facing descriptor schema; DAG-ML owns controller/algorithm policy. */
function nativePredictorDescriptor(value: unknown): NativePredictorDescriptorV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Core returned no usable native predictor descriptor.')
  }
  const descriptor = value as Record<string, unknown>
  const writer = descriptor.writer_abi
  const dimensions = descriptor.dimensions
  if (!exactKeys(descriptor, DESCRIPTOR_KEYS)
    || !writer || typeof writer !== 'object' || Array.isArray(writer)
    || !exactKeys(writer as Record<string, unknown>, ['major', 'minor', 'patch'])
    || !dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)
    || !exactKeys(dimensions as Record<string, unknown>, ['training_samples', 'n_features', 'n_targets', 'n_components'])
    || descriptor.descriptor_type !== 'dagml.native_predictor_descriptor.v1'
    || descriptor.schema_version !== 1
    || descriptor.format !== 'N4MM'
    || descriptor.format_version !== 1
    || !['controller:methods.pls', 'controller:methods.ridge'].includes(String(descriptor.owner_controller))
    || !Number.isSafeInteger(descriptor.storage_algorithm)
    || !nonNegativeInteger(descriptor.capabilities) || descriptor.capabilities > 7
    || (Number(descriptor.capabilities) & 1) !== 1
    || typeof descriptor.artifact_sha256 !== 'string' || !SHA256.test(descriptor.artifact_sha256)
    || typeof descriptor.descriptor_fingerprint !== 'string' || !SHA256.test(descriptor.descriptor_fingerprint)
    || (writer as Record<string, unknown>).major !== 2
    || !nonNegativeInteger((writer as Record<string, unknown>).minor)
    || !nonNegativeInteger((writer as Record<string, unknown>).patch)
    || !positiveInteger((dimensions as Record<string, unknown>).training_samples)
    || !positiveInteger((dimensions as Record<string, unknown>).n_features)
    || !positiveInteger((dimensions as Record<string, unknown>).n_targets)
    || !nonNegativeInteger((dimensions as Record<string, unknown>).n_components)) {
    throw new TypeError('Core returned an invalid native predictor descriptor contract.')
  }
  return value as NativePredictorDescriptorV1
}

function sameNativePredictor(
  expected: NativePredictorDescriptorV1,
  actual: NativePredictorDescriptorV1,
): boolean {
  return expected.descriptor_fingerprint === actual.descriptor_fingerprint
    && expected.artifact_sha256 === actual.artifact_sha256
    && expected.descriptor_type === actual.descriptor_type
    && expected.schema_version === actual.schema_version
    && expected.owner_controller === actual.owner_controller
    && expected.format === actual.format
    && expected.format_version === actual.format_version
    && expected.storage_algorithm === actual.storage_algorithm
    && expected.capabilities === actual.capabilities
    && expected.writer_abi.major === actual.writer_abi.major
    && expected.writer_abi.minor === actual.writer_abi.minor
    && expected.writer_abi.patch === actual.writer_abi.patch
    && expected.dimensions.training_samples === actual.dimensions.training_samples
    && expected.dimensions.n_features === actual.dimensions.n_features
    && expected.dimensions.n_targets === actual.dimensions.n_targets
    && expected.dimensions.n_components === actual.dimensions.n_components
}

/**
 * Validate an Archive V2 with Core's Rust/WASM reader and retain only its opaque
 * bytes plus bounded identity metadata. Web never parses ZIP members itself.
 */
export async function importArchiveV2Model(
  value: ArrayBuffer | ArrayBufferView,
  fileName = 'Imported Archive V2',
): Promise<ImportedArchiveV2Model> {
  const bytes = archiveBytes(value)
  const descriptors = await inspectMethodsArchiveV2Predictors(bytes)
  if (!Array.isArray(descriptors) || descriptors.length !== 1) {
    throw new TypeError('Core Archive V2 import requires exactly one native predictor descriptor.')
  }
  const descriptor = nativePredictorDescriptor(descriptors[0])
  const native = await loadArchiveV2Native() as ArchiveNativeModule
  if (typeof native?.ValidatedMethodsArchiveV2 !== 'function') {
    throw new TypeError('Core Archive V2 native validator is unavailable or incompatible.')
  }
  const archive = new native.ValidatedMethodsArchiveV2(bytes)
  try {
    const names = targetNames(archive.target_names_json())
    if (names.length !== descriptor.dimensions.n_targets) {
      throw new Error('Archive target names disagree with the native predictor descriptor.')
    }
    const state: ArchiveV2ModelState = Object.freeze({
      kind: ARCHIVE_V2_MODEL_KIND,
      archiveBytes: bytes,
      archiveId: archive.archive_id,
      archiveSha256: archive.archive_sha256,
      artifactId: archive.artifact_id,
      bindingId: archive.binding_id,
      nodeId: archive.node_id,
      portName: archive.port_name,
      targetNames: names,
      nativePredictorDescriptor: descriptor,
    })
    const name = fileName.replace(/\.n4a$/i, '') || 'Imported Archive V2'
    return {
      name,
      taskType: 'regression',
      targetName: names.join(', '),
      model: {
        dsl: { name, steps: [] },
        taskType: 'regression',
        nFeatures: descriptor.dimensions.n_features,
        state,
      },
    }
  } finally {
    archive.free()
  }
}

export function isArchiveV2Model(model: FittedPipeline): model is ArchiveV2Model {
  const state = model?.state as Partial<ArchiveV2ModelState> | null
  if (model?.taskType !== 'regression'
    || !positiveInteger(model.nFeatures)
    || !state
    || state.kind !== ARCHIVE_V2_MODEL_KIND
    || !(state.archiveBytes instanceof Uint8Array)
    || typeof state.archiveId !== 'string'
    || typeof state.archiveSha256 !== 'string'
    || !SHA256.test(state.archiveSha256)
    || typeof state.artifactId !== 'string'
    || typeof state.bindingId !== 'string'
    || typeof state.nodeId !== 'string'
    || typeof state.portName !== 'string'
    || !Array.isArray(state.targetNames)) return false
  try {
    const descriptor = nativePredictorDescriptor(state.nativePredictorDescriptor)
    return descriptor.dimensions.n_features === model.nFeatures
      && descriptor.dimensions.n_targets === state.targetNames.length
  } catch {
    return false
  }
}

/** Replay one multi-target N4MM model exactly once through Core + Methods WASM. */
export async function predictArchiveV2(
  model: ArchiveV2Model,
  X: Float64Array,
  rows: number,
  cols: number,
): Promise<PredictResult> {
  const expectedDescriptor = nativePredictorDescriptor(model.state.nativePredictorDescriptor)
  if (model.nFeatures !== expectedDescriptor.dimensions.n_features || cols !== model.nFeatures) {
    throw new RangeError(`Archive model expects ${model.nFeatures} features; received ${cols}.`)
  }
  const result = await replayMethodsArchiveV2(model.state.archiveBytes, {
    X,
    rows,
    cols,
  })
  const actualDescriptor = nativePredictorDescriptor(result.nativePredictorDescriptor)
  if (result.schema !== 'nirs4all.core.archive-v2-replay.v1'
    || result.engine !== 'nirs4all-methods-wasm'
    || result.fallback !== false
    || result.archiveId !== model.state.archiveId
    || result.archiveSha256 !== model.state.archiveSha256
    || result.artifactId !== model.state.artifactId
    || result.bindingId !== model.state.bindingId
    || result.nodeId !== model.state.nodeId
    || result.portName !== model.state.portName
    || !sameNativePredictor(expectedDescriptor, actualDescriptor)
    || result.rows !== rows
    || result.cols !== expectedDescriptor.dimensions.n_targets
    || result.sampleIds.length !== rows
    || result.targetNames.join('\u0000') !== model.state.targetNames.join('\u0000')
    || result.data.length !== result.rows * result.cols) {
    throw new Error('Core Archive V2 replay returned inconsistent identity or shape metadata.')
  }
  return {
    values: Float64Array.from(result.data),
    rows: result.rows,
    cols: result.cols,
    sampleIds: [...result.sampleIds],
    targetNames: [...result.targetNames],
    engine: result.engine,
    fallback: false,
    archiveSha256: result.archiveSha256,
  }
}
