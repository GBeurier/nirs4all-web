import { loadArchiveV2Native, replayMethodsArchiveV2 } from './nirs4all-core'
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
}

export interface ArchiveV2Model extends FittedPipeline {
  readonly taskType: 'regression'
  /** The feature count stays opaque until Methods imports the N4MM model. */
  readonly nFeatures: 0
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

/**
 * Validate an Archive V2 with Core's Rust/WASM reader and retain only its opaque
 * bytes plus bounded identity metadata. Web never parses ZIP members itself.
 */
export async function importArchiveV2Model(
  value: ArrayBuffer | ArrayBufferView,
  fileName = 'Imported Archive V2',
): Promise<ImportedArchiveV2Model> {
  const bytes = archiveBytes(value)
  const native = await loadArchiveV2Native() as ArchiveNativeModule
  if (typeof native?.ValidatedMethodsArchiveV2 !== 'function') {
    throw new TypeError('Core Archive V2 native validator is unavailable or incompatible.')
  }
  const archive = new native.ValidatedMethodsArchiveV2(bytes)
  try {
    const names = targetNames(archive.target_names_json())
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
    })
    const name = fileName.replace(/\.n4a$/i, '') || 'Imported Archive V2'
    return {
      name,
      taskType: 'regression',
      targetName: names.join(', '),
      model: {
        dsl: { name, steps: [] },
        taskType: 'regression',
        nFeatures: 0,
        state,
      },
    }
  } finally {
    archive.free()
  }
}

export function isArchiveV2Model(model: FittedPipeline): model is ArchiveV2Model {
  const state = model?.state as Partial<ArchiveV2ModelState> | null
  return model?.taskType === 'regression'
    && model.nFeatures === 0
    && state?.kind === ARCHIVE_V2_MODEL_KIND
    && state.archiveBytes instanceof Uint8Array
    && typeof state.archiveId === 'string'
    && typeof state.archiveSha256 === 'string'
    && Array.isArray(state.targetNames)
}

/** Replay one multi-target N4MM model exactly once through Core + Methods WASM. */
export async function predictArchiveV2(
  model: ArchiveV2Model,
  X: Float64Array,
  rows: number,
  cols: number,
): Promise<PredictResult> {
  const result = await replayMethodsArchiveV2(model.state.archiveBytes, {
    X,
    rows,
    cols,
  })
  if (result.schema !== 'nirs4all.core.archive-v2-replay.v1'
    || result.engine !== 'nirs4all-methods-wasm'
    || result.fallback !== false
    || result.archiveId !== model.state.archiveId
    || result.archiveSha256 !== model.state.archiveSha256
    || result.rows !== rows
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
