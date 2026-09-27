// .n4a — a portable, re-importable model bundle for nirs4all-web: the pipeline DSL
// + the fitted model (preprocessing state + coefficients) + metadata. Re-importing
// one into the Predict step scores new spectra without retraining — the same idea
// as nirs4all's .n4a bundles, scoped to this demo. It is JSON (with typed arrays
// encoded losslessly), so it stays diff-able and works offline.
import type { FittedPipeline, Metrics, RunResult, TaskType } from '@/engine/types'
import { importArchiveV2Model, MAX_ARCHIVE_V2_BYTES } from '@/engine/archive-v2'
import { trainingRowSteps } from '@/engine/orchestrate'
import { parseFeatureIdentity } from '@/engine/feature-identity'

export const N4A_FORMAT = 'nirs4all-web/n4a'
const COMPATIBLE_N4A_FORMATS = ['nirs4all-core/n4a']
/** v2: n4m methods carry their fitted state as portable N4ME bytes. v1 bundles
 *  stored per-method positional number arrays that no current engine reads.
 *  `model.features` (the fitted column names / axis, optional) is checked at
 *  import; a v2 bundle without it predicts by position. */
export const N4A_VERSION = 2

export interface N4aBundle {
  format: string
  version: number
  createdAt: string
  name: string
  targetName: string
  taskType: TaskType
  engine: string
  scoreMetric: keyof Metrics
  metrics: { cv?: Metrics; refit?: Metrics }
  /** some fitted state embeds training spectra (each state records its own
   *  `containsTrainingRows`); the export required the user's explicit consent */
  containsTrainingRows: boolean
  model: FittedPipeline
}

// --- typed-array-aware JSON (PlsModel / libn4m blobs carry Float64Array fields
// and N4ME Uint8Array payloads that JSON.stringify would silently turn into
// {"0":…} objects; bytes travel as base64) ---
type TypedTag = { $f64: number[] } | { $f32: number[] } | { $i32: number[] } | { $u8: string }

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Float64Array) return { $f64: Array.from(v) }
  if (v instanceof Float32Array) return { $f32: Array.from(v) }
  if (v instanceof Int32Array) return { $i32: Array.from(v) }
  if (v instanceof Uint8Array) return { $u8: toBase64(v) }
  return v
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const t = v as TypedTag
    if ('$f64' in t && Array.isArray(t.$f64)) return Float64Array.from(t.$f64)
    if ('$f32' in t && Array.isArray(t.$f32)) return Float32Array.from(t.$f32)
    if ('$i32' in t && Array.isArray(t.$i32)) return Int32Array.from(t.$i32)
    if ('$u8' in t && typeof t.$u8 === 'string') return fromBase64(t.$u8)
  }
  return v
}

/** Serialize any value preserving typed arrays (use for .n4a model state). */
export function serializeTyped(value: unknown): string {
  return JSON.stringify(value, replacer, 2)
}
/** Inverse of serializeTyped — restores Float64Array/Float32Array/Int32Array and N4ME bytes. */
export function deserializeTyped<T = unknown>(text: string): T {
  return JSON.parse(text, reviver) as T
}

/** Build a re-importable .n4a bundle from a completed run. */
export function buildN4aBundle(run: RunResult): N4aBundle {
  return {
    format: N4A_FORMAT,
    version: N4A_VERSION,
    createdAt: new Date().toISOString(),
    name: run.pipelineName,
    targetName: run.targetName,
    taskType: run.taskType,
    engine: run.engine,
    scoreMetric: run.scoreMetric,
    metrics: { cv: run.cv?.metrics, refit: run.refit.metrics },
    containsTrainingRows: trainingRowSteps(run.model).length > 0,
    model: run.model,
  }
}

export interface LoadedModel {
  model: FittedPipeline
  name: string
  taskType: TaskType
  targetName: string
  metrics?: { cv?: Metrics; refit?: Metrics }
}

/**
 * Import either the legacy Web JSON bundle or the canonical binary Archive V2.
 * Binary archives are validated by Core Rust/WASM; this module never opens ZIP
 * members or reconstructs an estimator in JavaScript.
 */
export async function parseN4aFile(file: File): Promise<LoadedModel> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ARCHIVE_V2_BYTES) {
    throw new RangeError('The .n4a file is empty or exceeds the canonical Core byte budget.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const first = bytes.find((value) => ![0x09, 0x0a, 0x0d, 0x20].includes(value))
  if (first === 0x7b) {
    return parseN4a(new TextDecoder().decode(bytes))
  }
  return importArchiveV2Model(bytes, file.name)
}

/** Parse + validate a .n4a bundle into a model ready for Predict. Throws on invalid. */
export function parseN4a(text: string): LoadedModel {
  let bundle: N4aBundle
  try {
    bundle = deserializeTyped<N4aBundle>(text)
  } catch {
    throw new Error('Not valid JSON — expected a nirs4all-web .n4a bundle.')
  }
  const format = String(bundle?.format ?? '')
  const supported = format.startsWith(N4A_FORMAT) || COMPATIBLE_N4A_FORMATS.some((f) => format.startsWith(f))
  if (!bundle || typeof bundle !== 'object' || !supported) {
    throw new Error('Not a nirs4all-web .n4a bundle (missing format tag).')
  }
  if ((bundle.version ?? 0) > N4A_VERSION) {
    throw new Error(`This .n4a was made by a newer version (v${bundle.version}); v${N4A_VERSION} can't read it.`)
  }
  if ((bundle.version ?? 0) < N4A_VERSION) {
    throw new Error(`This .n4a (v${bundle.version ?? 0}) stores models in the retired per-method number-array form; retrain the pipeline and export it again.`)
  }
  const m = bundle.model
  if (!m || typeof m !== 'object' || !m.dsl || !m.state || typeof m.nFeatures !== 'number') {
    throw new Error('The .n4a bundle has no usable fitted model.')
  }
  const features = parseFeatureIdentity(m.features, m.nFeatures)
  return {
    model: { ...m, features },
    name: bundle.name || m.dsl.name || 'Imported model',
    taskType: bundle.taskType ?? m.taskType,
    targetName: bundle.targetName ?? 'target',
    metrics: bundle.metrics,
  }
}
