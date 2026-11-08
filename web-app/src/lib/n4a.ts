// .n4a — a re-importable model file for nirs4all-web. The fitted model is a host
// payload (pipeline DSL + every fitted state + metrics + consent flag) carried as
// one embedded member of a real Core V1 container (`nirs4all.n4a.container.v1`)
// declared by the `nirs4all.web-host` owner. Core writes, hashes and verifies the
// container; this module only builds the host manifest, serializes the payload and
// routes an opened container by its declared owner/feature/entrypoint. The payload
// is readable by Core but executable only by this Web host (no portability claim).
import type { FittedPipeline, Metrics, RunResult, TaskType } from '@/engine/types'
import { importArchiveV2Model } from '@/engine/archive-v2'
import { openN4aContainer, writeN4aContainer } from '@/engine/nirs4all-core'
import { trainingRowSteps } from '@/engine/orchestrate'
import { parseFeatureIdentity } from '@/engine/feature-identity'

export const N4A_FORMAT = 'nirs4all-web/n4a'
/** Host payload version. v3: typed arrays travel as exact little-endian bytes
 *  (v2 stored lossy number arrays; v1 stored per-method number arrays). */
export const N4A_VERSION = 3

/** The Core V1 declaration of a Web host bundle. */
export const WEB_HOST = {
  owner: 'nirs4all.web-host',
  feature: 'nirs4all-web-host@1',
  entrypointId: 'host-predict',
  operation: 'host.predict',
  bundlePath: 'host/bundle.json',
  bundleContentType: 'nirs4all.web-host.bundle',
  contentTypeVersion: 1,
  fingerprintProfile: 'sha256.raw.v1',
} as const
const NATIVE_METHODS_FEATURE = 'native-methods-package@1'

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

// --- typed-array-aware JSON. PlsModel / libn4m blobs carry Float64Array fields and
// N4ME Uint8Array payloads that JSON.stringify would turn into {"0":…} objects.
// Every typed array travels as its exact little-endian bytes (base64), so NaN,
// ±Infinity, -0 and every finite bit pattern survive; Int32 keeps its integer range.
type NumericArray = Float64Array | Float32Array | Int32Array
interface NumericArrayCtor { new (buffer: ArrayBuffer, byteOffset: number, length: number): NumericArray; BYTES_PER_ELEMENT: number }
const NUMERIC_TAGS: Record<string, NumericArrayCtor> = { $f64le: Float64Array, $f32le: Float32Array, $i32le: Int32Array }
const LEGACY_TAGS = ['$f64', '$f32', '$i32']
const HOST_IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}
function swapElements(bytes: Uint8Array, width: number): void {
  for (let i = 0; i < bytes.length; i += width) bytes.subarray(i, i + width).reverse()
}
/** A copy of exactly this view's bytes (byteOffset/byteLength honoured), little-endian. */
function littleEndianBytes(view: NumericArray): Uint8Array {
  const bytes = new Uint8Array(view.byteLength)
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  if (!HOST_IS_LITTLE_ENDIAN) swapElements(bytes, view.BYTES_PER_ELEMENT)
  return bytes
}
function numericArrayFrom(tag: string, text: string): NumericArray {
  const Ctor = NUMERIC_TAGS[tag]
  const bytes = fromBase64(text)
  if (bytes.length % Ctor.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`Corrupt host payload: ${tag} byte length ${bytes.length} is not a multiple of ${Ctor.BYTES_PER_ELEMENT}.`)
  }
  if (!HOST_IS_LITTLE_ENDIAN) swapElements(bytes, Ctor.BYTES_PER_ELEMENT)
  return new Ctor(bytes.buffer as ArrayBuffer, 0, bytes.length / Ctor.BYTES_PER_ELEMENT)
}

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Float64Array) return { $f64le: toBase64(littleEndianBytes(v)) }
  if (v instanceof Float32Array) return { $f32le: toBase64(littleEndianBytes(v)) }
  if (v instanceof Int32Array) return { $i32le: toBase64(littleEndianBytes(v)) }
  if (v instanceof Uint8Array) return { $u8: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  return v
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const t = v as Record<string, unknown>
    if (LEGACY_TAGS.some((tag) => tag in t)) {
      throw new Error('Unsupported older host payload: it stores typed arrays as lossy number arrays (host payload v2 or older). Retrain and export the model again.')
    }
    for (const tag of Object.keys(NUMERIC_TAGS)) {
      if (tag in t && typeof t[tag] === 'string') return numericArrayFrom(tag, t[tag] as string)
    }
    if ('$u8' in t && typeof t.$u8 === 'string') return fromBase64(t.$u8)
  }
  return v
}

/** Serialize any value preserving typed arrays exactly (use for .n4a model state). */
export function serializeTyped(value: unknown): string {
  return JSON.stringify(value, replacer, 2)
}
/** Inverse of serializeTyped — restores Float64Array/Float32Array/Int32Array and N4ME bytes
 *  bit for bit; refuses the retired lossy number-array tags. */
export function deserializeTyped<T = unknown>(text: string): T {
  return JSON.parse(text, reviver) as T
}

/** Build a re-importable host payload from a completed run. */
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

// --- the Core V1 host container ---------------------------------------------------

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SubtleCrypto is unavailable in this context; the .n4a host payload cannot be fingerprinted.')
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The Core V1 manifest of a Web host container. Core derives member sizes and
 *  SHA-256 values, so the inventory entry carries placeholders; the artifact
 *  identity declares the payload's raw SHA-256 (`sha256.raw.v1`, plain hex). */
export function webHostManifest(fingerprint: string): Record<string, unknown> {
  const { owner, feature, bundlePath, bundleContentType, contentTypeVersion } = WEB_HOST
  return {
    schema: 'nirs4all.n4a.container.v1',
    schema_version: 1,
    minimum_reader_version: 1,
    container_id: `container:nirs4all.web-host.${globalThis.crypto.randomUUID()}`,
    required_features: [feature],
    physical_profile: 'zip-stored.v1',
    members: [{ path: bundlePath, byte_length: 0, sha256: '0'.repeat(64) }],
    artifacts: [{
      id: bundlePath,
      kind: 'model',
      owner,
      content_type: { id: bundleContentType, version: contentTypeVersion },
      identity: { owner, schema: bundleContentType, schema_version: contentTypeVersion, fingerprint_profile: WEB_HOST.fingerprintProfile, fingerprint },
      storage: { kind: 'embedded', root_member: bundlePath, member_paths: [bundlePath] },
      requirements: null,
    }],
    links: [],
    entrypoints: [{
      id: WEB_HOST.entrypointId,
      owner,
      operation: WEB_HOST.operation,
      root_artifact: bundlePath,
      input_artifacts: [],
      required_features: [feature],
      requirements: null,
    }],
  }
}

/**
 * Export a completed run as a Core V1 `.n4a` container carrying the Web host payload.
 * The payload (all models, full recipe, N4ME states, metrics, consent flag) is hashed
 * once; Core's write receipt must then report that same digest for the member.
 */
export async function exportN4aContainer(run: RunResult, model: FittedPipeline): Promise<Uint8Array> {
  const payload = new TextEncoder().encode(serializeTyped(buildN4aBundle({ ...run, model })))
  const fingerprint = await sha256Hex(payload)
  const { archiveBytes, receipt } = await writeN4aContainer(webHostManifest(fingerprint), [{ path: WEB_HOST.bundlePath, bytes: payload }])
  const written = receipt.members.find((member) => member.path === WEB_HOST.bundlePath)?.sha256
  if (written !== fingerprint) throw new Error('Core wrote a host bundle whose SHA-256 differs from the declared fingerprint; the export was discarded.')
  return archiveBytes
}

interface ContainerManifest {
  required_features: string[]
  members: { path: string; sha256: string }[]
  artifacts: { id: string; owner: string; content_type: { id: string; version: number }; identity: { fingerprint_profile: string; fingerprint: string }; storage: { kind: string; root_member: string; member_paths: string[] } }[]
  links: { owner: string }[]
  entrypoints: { id: string; owner: string; operation: string; root_artifact: string; input_artifacts: string[]; required_features: string[]; requirements: unknown }[]
}

/**
 * Classify a manifest of a container Core opened (so inventory SHA-256 values are the
 * verified digests). True: a valid Web host container. False: not a Web host container.
 * Throws when the Web host declaration is violated or its fingerprint is not the verified
 * inventory digest of the bundle member (no payload byte has been read yet).
 */
function isWebHostManifest(manifest: ContainerManifest): boolean {
  const { owner, feature } = WEB_HOST
  const hostOwned = [...manifest.artifacts, ...manifest.entrypoints, ...manifest.links].some((item) => item.owner === owner)
  if (!manifest.required_features.includes(feature) && !hostOwned) return false
  if (manifest.required_features.length !== 1 || manifest.required_features[0] !== feature) {
    throw new Error(`A Web host container must require exactly the ${feature} feature.`)
  }
  if (manifest.links.length) throw new Error('A Web host container declares no links.')
  const digests = new Map(manifest.members.map((member) => [member.path, member.sha256]))
  const bundles: string[] = []
  for (const artifact of manifest.artifacts) {
    const { storage, identity } = artifact
    if (artifact.owner !== owner) throw new Error('A Web host container cannot mix artifacts of another owner.')
    if (storage.kind !== 'embedded' || storage.member_paths.length !== 1 || storage.member_paths[0] !== storage.root_member || artifact.id !== storage.root_member) {
      throw new Error('Every Web host artifact must embed exactly one member whose path is its id.')
    }
    if (identity.fingerprint_profile !== WEB_HOST.fingerprintProfile || identity.fingerprint !== digests.get(storage.root_member)) {
      throw new Error(`The host artifact fingerprint is not the verified inventory SHA-256 of its member: ${artifact.id}`)
    }
    if (artifact.content_type.id === WEB_HOST.bundleContentType && artifact.content_type.version === WEB_HOST.contentTypeVersion) bundles.push(artifact.id)
  }
  const [entrypoint] = manifest.entrypoints
  if (manifest.entrypoints.length !== 1 || bundles.length !== 1 || bundles[0] !== WEB_HOST.bundlePath
    || entrypoint.id !== WEB_HOST.entrypointId || entrypoint.owner !== owner || entrypoint.operation !== WEB_HOST.operation
    || entrypoint.root_artifact !== bundles[0] || entrypoint.input_artifacts.length !== 0
    || entrypoint.required_features.length !== 1 || entrypoint.required_features[0] !== feature || entrypoint.requirements !== null) {
    throw new Error(`The Web host entrypoint must be ${WEB_HOST.entrypointId} (${WEB_HOST.operation}) rooted at the single ${WEB_HOST.bundlePath} bundle.`)
  }
  return true
}

/**
 * Open a Core V1 `.n4a` container (File/Blob, never copied whole by Web) and route it by
 * its declared owner/feature/entrypoint: a Web host bundle, or a native-methods-package
 * model validated by Core's own Package V2 reader. Everything else is refused, naming the
 * declared features: readable by Core is not executable here. Core's own refusals
 * (tampered, unsupported, historical or non-container bytes) propagate verbatim.
 */
export async function parseN4aFile(file: Blob & { name?: string }): Promise<LoadedModel> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new RangeError('The .n4a file is empty or its size is not a safe integer.')
  }
  const container = await openN4aContainer(file)
  try {
    const manifest = JSON.parse(new TextDecoder().decode(container.manifestBytes())) as ContainerManifest
    if (isWebHostManifest(manifest)) {
      const bytes = await container.readMember(WEB_HOST.bundlePath)
      if (!bytes) throw new Error(`The Web host container has no ${WEB_HOST.bundlePath} member.`)
      return parseN4a(new TextDecoder().decode(bytes))
    }
    // Core selects the native predict-external operation and validates its root,
    // closure and global + selected-entrypoint requirements. Other entrypoints
    // (including calibration) do not grant or deny prediction capabilities.
    if (manifest.entrypoints.some((entry) => entry.owner === 'dag-ml' && entry.operation === 'predict-external')) {
      return importArchiveV2Model(await container.readArchive(), file.name)
    }
    throw new Error(`This .n4a container requires ${manifest.required_features.join(', ') || 'no declared feature'}; the Web app runs only ${WEB_HOST.feature} bundles and ${NATIVE_METHODS_FEATURE} models. It is readable here but not executable.`)
  } finally {
    container.close()
  }
}

/** Parse + validate a Web host payload into a model ready for Predict. Throws on invalid. */
export function parseN4a(text: string): LoadedModel {
  let bundle: N4aBundle
  try {
    bundle = deserializeTyped<N4aBundle>(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Not valid JSON — expected a nirs4all-web host payload.')
    throw error
  }
  if (!bundle || typeof bundle !== 'object' || !String(bundle.format ?? '').startsWith(N4A_FORMAT)) {
    throw new Error('Not a nirs4all-web host payload (missing format tag).')
  }
  if ((bundle.version ?? 0) > N4A_VERSION) {
    throw new Error(`This .n4a was made by a newer version (v${bundle.version}); v${N4A_VERSION} can't read it.`)
  }
  if ((bundle.version ?? 0) < N4A_VERSION) {
    throw new Error(`This .n4a host payload (v${bundle.version ?? 0}) uses an unsupported older encoding; retrain the pipeline and export it again.`)
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
