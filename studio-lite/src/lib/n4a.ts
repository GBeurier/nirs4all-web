// .n4a — a portable, re-importable model bundle for studio-lite: the pipeline DSL
// + the fitted model (preprocessing state + coefficients) + metadata. Re-importing
// one into the Predict step scores new spectra without retraining — the same idea
// as nirs4all's .n4a bundles, scoped to this demo. It is JSON (with typed arrays
// encoded losslessly), so it stays diff-able and works offline.
import type { FittedPipeline, Metrics, RunResult, TaskType } from '@/engine/types'

export const N4A_FORMAT = 'nirs4all-lite/n4a'
export const N4A_VERSION = 1

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
  model: FittedPipeline
}

// --- typed-array-aware JSON (PlsModel / libn4m blobs carry Float64Array fields
// that JSON.stringify would silently turn into {"0":…} objects) ---
type TypedTag = { $f64: number[] } | { $f32: number[] } | { $i32: number[] }

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Float64Array) return { $f64: Array.from(v) }
  if (v instanceof Float32Array) return { $f32: Array.from(v) }
  if (v instanceof Int32Array) return { $i32: Array.from(v) }
  return v
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const t = v as TypedTag
    if ('$f64' in t && Array.isArray(t.$f64)) return Float64Array.from(t.$f64)
    if ('$f32' in t && Array.isArray(t.$f32)) return Float32Array.from(t.$f32)
    if ('$i32' in t && Array.isArray(t.$i32)) return Int32Array.from(t.$i32)
  }
  return v
}

/** Serialize any value preserving typed arrays (use for .n4a model state). */
export function serializeTyped(value: unknown): string {
  return JSON.stringify(value, replacer, 2)
}
/** Inverse of serializeTyped — restores Float64Array/Float32Array/Int32Array. */
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

/** Parse + validate a .n4a bundle into a model ready for Predict. Throws on invalid. */
export function parseN4a(text: string): LoadedModel {
  let bundle: N4aBundle
  try {
    bundle = deserializeTyped<N4aBundle>(text)
  } catch {
    throw new Error('Not valid JSON — expected a nirs4all-lite .n4a bundle.')
  }
  if (!bundle || typeof bundle !== 'object' || !String(bundle.format ?? '').startsWith('nirs4all-lite/n4a')) {
    throw new Error('Not a nirs4all-lite .n4a bundle (missing format tag).')
  }
  if ((bundle.version ?? 0) > N4A_VERSION) {
    throw new Error(`This .n4a was made by a newer version (v${bundle.version}); v${N4A_VERSION} can't read it.`)
  }
  const m = bundle.model
  if (!m || typeof m !== 'object' || !m.dsl || !m.state || typeof m.nFeatures !== 'number') {
    throw new Error('The .n4a bundle has no usable fitted model.')
  }
  return {
    model: m,
    name: bundle.name || m.dsl.name || 'Imported model',
    taskType: bundle.taskType ?? m.taskType,
    targetName: bundle.targetName ?? 'target',
    metrics: bundle.metrics,
  }
}
