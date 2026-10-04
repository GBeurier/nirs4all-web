// Native REFIT/PREDICT control plane; the existing browser backend owns numerics.
// A composite host controller deliberately represents the complete browser pipeline.
// This is a host-sidecar package, not a claim of portable native estimator state.
import { createDagMlModelManifest, createDagMlNodeResult, loadDatasetsWasm } from './nirs4all-core'
import { loadDagMl, type DagMlMod } from './dagml'
import { materializeViaProvider } from './dagml-data'
import { datasetFeatureIdentity } from './feature-identity'
import { validatePartitionGroups } from './grouped-cv'
import { classInfo, exportPipeline, predictPipelineMatrix, trainAndPredict, type FittedState, type ModelBackend } from './orchestrate'
import type { FittedPipeline, MaterializedDataset, PipelineDSL, PredictResult } from './types'
import type { Mat } from './algo/linalg'

const OWNER = 'controller:web.pipeline'
type Invoke = (owner: string, task: string) => string
export interface RefitRuntime {
  execute_initial_full_refit_json(plan: string, manifests: string, envelope: string, ids: string, packageId: string, runId: string, seed: string, invoke: Invoke): string
  replay_initial_full_refit_json(packageJson: string, envelope: string, outputs: string, handles: string, runId: string, invoke: Invoke): string
  initial_full_refit_predict_envelope_json(packageJson: string, cohort: string): string
  validate_initial_full_refit_package_json(packageJson: string): void
  sample_relation_set_fingerprint_json(relations: string): string
}
export function requireRefitRuntime(value: DagMlMod): DagMlMod & RefitRuntime {
  const candidate = value as DagMlMod & Partial<RefitRuntime>
  for (const key of ['execute_initial_full_refit_json', 'replay_initial_full_refit_json', 'initial_full_refit_predict_envelope_json', 'validate_initial_full_refit_package_json', 'sample_relation_set_fingerprint_json'] as const) {
    if (typeof candidate[key] !== 'function') throw new Error(`The staged DAG-ML WASM lacks ${key}; rebuild and stage the current native WASM before REFIT/PREDICT. No direct-fit fallback is allowed.`)
  }
  return candidate as DagMlMod & RefitRuntime
}
interface View { partition: string; sample_ids: string[] | null }
interface NativeTask extends Record<string, unknown> {
  phase: string; node_plan: { node_id: string; params: { web_pipeline?: PipelineDSL; web_class_names?: string[]; web_target_names?: string[] } }
  data_views: Record<string, View>; input_handles: Record<string, { handle: number; kind: string; owner_controller: string }>
}
interface BrowserNodeResult extends Record<string, unknown> {
  predictions: Record<string, unknown>[]; lineage: Record<string, unknown>
}
function nodeResult(task: NativeTask, prediction: { sampleIds: string[]; values: number[][]; targetNames: string[] }): BrowserNodeResult {
  const result = createDagMlNodeResult(task, prediction)
  if (!Array.isArray(result.predictions) || !result.lineage || typeof result.lineage !== 'object') throw new Error('Core returned an invalid node-result skeleton')
  return result as BrowserNodeResult
}
export interface NativeRefitState {
  schemaVersion: 1; packageJson: string; artifactId: string; carrierSha256: string
  targetNames: string[]
}
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
const rows = (m: Mat) => Array.from({ length: m.rows }, (_, i) => Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols)))
const carrier = (model: FittedPipeline) => {
  const { nativeRefit: _native, ...state } = model.state as FittedState & { nativeRefit?: NativeRefitState }
  return JSON.stringify({ dsl: model.dsl, taskType: model.taskType, nFeatures: model.nFeatures, features: model.features, classes: model.classes, state })
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((v) => v.toString(16).padStart(2, '0')).join('')
}
// Canonical native serialization normalizes consent flags without removing or
// changing learned state. Actual user export still uses their explicit consent.
const carrierBytes = (model: FittedPipeline, backend: ModelBackend) => new TextEncoder().encode(carrier(exportPipeline(model, true, backend)))
export const carrierFingerprint = (model: FittedPipeline, backend: ModelBackend) => sha256(carrierBytes(model, backend))
export async function validateCarrierBinding(model: FittedPipeline, backend: ModelBackend): Promise<void> {
  const state = (model.state as FittedState & { nativeRefit?: NativeRefitState }).nativeRefit
  if (!state || state.schemaVersion !== 1) throw new Error('Missing native browser REFIT sidecar')
  const dagml = requireRefitRuntime(await loadDagMl())
  dagml.validate_initial_full_refit_package_json(state.packageJson)
  const pkg = JSON.parse(state.packageJson) as { artifacts: { record: { artifact: { id: string; content_fingerprint?: string; size_bytes?: number } } }[] }
  const bytes = carrierBytes(model, backend)
  const digest = await sha256(bytes)
  const reference = pkg.artifacts.length === 1 ? pkg.artifacts[0].record.artifact : undefined
  if (!reference || reference.id !== state.artifactId || reference.content_fingerprint !== digest || reference.size_bytes !== bytes.byteLength || state.carrierSha256 !== digest) throw new Error('Browser REFIT sidecar differs from the learned state bound in its native package')
}
const bufferFingerprint = (values: Float64Array) => sha256(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
function takeRows(X: Float64Array, indices: number[], width: number): Float64Array {
  const output = new Float64Array(indices.length * width)
  for (let row = 0; row < indices.length; row++) output.set(X.subarray(indices[row] * width, (indices[row] + 1) * width), row * width)
  return output
}
function indices(ids: string[], allowed: number[], prefix = 's'): number[] {
  const mapping = new Map(allowed.map((row) => [`${prefix}${row}`, row]))
  if (new Set(ids).size !== ids.length || ids.some((id) => !mapping.has(id))) throw new Error('Native task refers to duplicate or unavailable browser rows')
  return ids.map((id) => mapping.get(id)!)
}
function viewIds(task: NativeTask, partition: string): string[] {
  const views = Object.values(task.data_views).filter((v) => v.partition === partition)
  if (views.length !== 1 || !views[0].sample_ids?.length) throw new Error(`Expected exactly one native ${partition} data view`)
  return views[0].sample_ids
}
export async function refitWithDagMl(ds: MaterializedDataset, dsl: PipelineDSL, backend: ModelBackend, trainRows: number[], scoreRows: number[], signal?: AbortSignal): Promise<{ fitted: FittedPipeline; pred: Mat; packageFingerprint: string }> {
  for (const selected of [trainRows, scoreRows]) {
    if (!selected.length || new Set(selected).size !== selected.length || selected.some((i) => !Number.isInteger(i) || i < 0 || i >= ds.nSamples)) throw new Error('REFIT/scoring rows must be nonempty unique dataset identities')
  }
  if (trainRows.some((i) => ds.partitions[i] !== 'train')) throw new Error('Native REFIT may only fit declared Train observations')
  validatePartitionGroups(ds)
  if (scoreRows.some((i) => ds.augmented?.[i])) throw new Error('REFIT scoring cannot include augmented observations')
  const dagml = requireRefitRuntime(await loadDagMl())
  const hashes = await loadDatasetsWasm()
  if (!Number.isSafeInteger(dsl.cv?.seed ?? 0) || (dsl.cv?.seed ?? 0) < 0) throw new Error('Native REFIT requires a nonnegative safe integer root seed')
  // Materialize once more after partition overrides. Only true training content
  // enters the REFIT identity; held-out labels never enter the fitted package.
  const served = await materializeViaProvider(ds)
  const envelope = JSON.parse(served.envelopeJson)
  const ids = trainRows.map((i) => `s${i}`)
  envelope.coordinator_relations.records = envelope.coordinator_relations.records.filter((r: { sample_id: string }) => ids.includes(r.sample_id))
  envelope.relation_fingerprint = dagml.sample_relation_set_fingerprint_json(JSON.stringify(envelope.coordinator_relations))
  const trainX = takeRows(served.X, trainRows, ds.nFeatures)
  const trainY = Float64Array.from(trainRows.map((i) => served.y[i]))
  envelope.data_content_fingerprint = await bufferFingerprint(trainX)
  envelope.target_content_fingerprint = await bufferFingerprint(trainY)
  const manifest = createDagMlModelManifest({ dagMl: dagml, controllerId: OWNER, controllerVersion: '1.0.0' })
  // No false RNG/determinism promise for browser backends with their own params.
  manifest.rng_policy = 'ignores_seed'
  if (!Array.isArray(manifest.capabilities)) throw new Error('Native controller manifest lacks capabilities')
  manifest.capabilities = manifest.capabilities.filter((cap: string) => !['deterministic', 'uses_core_rng', 'thread_safe', 'process_safe'].includes(cap))
  dagml.validate_controller_manifest_json(JSON.stringify(manifest))
  const manifests = JSON.stringify([manifest])
  const concreteDsl = JSON.parse(JSON.stringify(dsl)) as PipelineDSL
  delete concreteDsl.cv
  delete concreteDsl.split
  delete concreteDsl.generation
  for (const step of concreteDsl.steps) { delete step.sweeps; delete step.variants }
  if (concreteDsl.model) { delete concreteDsl.model.sweeps; delete concreteDsl.model.variants }
  const { classNames } = classInfo(ds)
  if (ds.taskType !== 'regression' && classNames.length < 2) throw new Error('Classification requires at least two training classes')
  const targetNames = ds.taskType === 'regression' ? [ds.targetName] : classNames
  const artifact = JSON.parse(dagml.compile_pipeline_dsl_artifact_with_controllers_json(JSON.stringify({ id: 'graph:web-refit', output: { name: 'oof' }, steps: [{ kind: 'model', id: 'model:web.pipeline', operator: { type: 'WebPipeline' }, params: { web_pipeline: concreteDsl, web_class_names: classNames, web_target_names: targetNames } }] }), manifests))
  const graphNodes = artifact.graph.nodes as { id: string; ports: { inputs: { name: string; kind: string }[] } }[]
  if (graphNodes.length !== 1) throw new Error('Browser composite REFIT requires exactly one native model node')
  const node = graphNodes[0]
  const dataPorts = node.ports.inputs.filter((port) => port.kind === 'data')
  if (dataPorts.length !== 1) throw new Error('Browser composite REFIT requires exactly one data input')
  artifact.campaign_template.split_invocation = null
  artifact.campaign_template.data_bindings = { [node.id]: [{
    node_id: node.id, input_name: dataPorts[0].name, request_id: 'nir-to-tabular',
    schema_fingerprint: envelope.schema_fingerprint, plan_fingerprint: envelope.plan_fingerprint,
    relation_fingerprint: envelope.relation_fingerprint, output_representation: served.outputRepresentation,
    feature_set_id: 'X', source_ids: ['nir'], require_relations: true,
  }] }
  const planJson = dagml.build_execution_plan_json('plan:web-refit', JSON.stringify(artifact.graph), JSON.stringify(artifact.campaign_template), manifests)
  const learnedState: { fitted?: FittedPipeline } = {}
  let artifactId = ''
  let carrierSha256 = ''
  let calls = 0
  const invoke: Invoke = (owner, taskJson) => {
    if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')
    const task = JSON.parse(taskJson) as NativeTask
    if (owner !== OWNER || task.phase !== 'REFIT' || ++calls !== 1) throw new Error('Unexpected native browser REFIT task')
    if (stableJson(task.node_plan.params.web_pipeline) !== stableJson(concreteDsl)) throw new Error('Native REFIT pipeline differs from the declared browser pipeline')
    const nativeRows = indices(viewIds(task, 'full_train'), trainRows)
    const learned = trainAndPredict({ ...ds, X: served.X, y: served.y }, concreteDsl, backend, nativeRows, nativeRows)
    learnedState.fitted = { dsl: concreteDsl, taskType: ds.taskType, nFeatures: ds.nFeatures, features: datasetFeatureIdentity(ds), classes: classNames.length ? classNames : undefined, state: { chain: learned.descriptors, branch: learned.branch, model: learned.model, classNames: classNames.length ? classNames : undefined, backendId: backend.id } satisfies FittedState }
    artifactId = `artifact:${task.node_plan.node_id}:web`
    const result = nodeResult(task, { sampleIds: viewIds(task, 'full_train'), values: rows(learned.pred), targetNames })
    const bytes = carrierBytes(learnedState.fitted, backend)
    carrierSha256 = hashes.sha256(bytes)
    const reference = { id: artifactId, kind: 'web_pipeline', controller_id: OWNER, backend: 'json', content_fingerprint: carrierSha256, size_bytes: bytes.byteLength }
    return JSON.stringify({ ...result, predictions: result.predictions.map((block: object) => ({ ...block, producer_port: 'oof' })), artifacts: [reference], artifact_handles: { [artifactId]: { handle: 1, kind: 'model', owner_controller: OWNER } }, lineage: { ...result.lineage, artifact_refs: [reference] } })
  }
  const execution = JSON.parse(dagml.execute_initial_full_refit_json(planJson, manifests, JSON.stringify(envelope), JSON.stringify(ids), 'package:web-refit', 'run:web-refit', String(dsl.cv?.seed ?? 0), invoke))
  const fitted = learnedState.fitted
  if (!fitted || calls !== 1 || typeof execution.initial_full_refit_package_json !== 'string') throw new Error('Native REFIT did not return one fitted package')
  dagml.validate_initial_full_refit_package_json(execution.initial_full_refit_package_json)
  const nativeRefit: NativeRefitState = { schemaVersion: 1, packageJson: execution.initial_full_refit_package_json, artifactId, carrierSha256, targetNames }
  fitted.state = { ...(fitted.state as FittedState), nativeRefit }
  const Xscore = takeRows(ds.X, scoreRows, ds.nFeatures)
  const pred = await replayWithDagMl(fitted, Xscore, scoreRows.length, ds.nFeatures, backend, fitted.features?.names)
  return { fitted, pred, packageFingerprint: execution.initial_full_refit_package.package_fingerprint }
}

export async function replayWithDagMl(model: FittedPipeline, X: Float64Array, nRows: number, nFeatures: number, backend: ModelBackend, featureNames?: string[]): Promise<Mat> {
  const dagml = requireRefitRuntime(await loadDagMl())
  const state = (model.state as FittedState & { nativeRefit?: NativeRefitState }).nativeRefit
  if (!state || state.schemaVersion !== 1) throw new Error('This model has no native browser REFIT package; use its explicit legacy/offline replay profile')
  await validateCarrierBinding(model, backend)
  const pkg = JSON.parse(state.packageJson) as { effective_plan: { node_plans: Record<string, { params: { web_pipeline: PipelineDSL; web_class_names: string[]; web_target_names: string[] } }> }; outputs: { output_id: string; port_name: string }[]; artifacts: { record: { artifact: { id: string } } }[] }
  const plans = Object.values(pkg.effective_plan.node_plans)
  if (plans.length !== 1 || stableJson(plans[0].params.web_pipeline) !== stableJson(model.dsl) || stableJson(plans[0].params.web_class_names) !== stableJson(model.classes ?? []) || stableJson(plans[0].params.web_target_names) !== stableJson(state.targetNames)) throw new Error('Browser sidecar pipeline or class-column vocabulary differs from its native package')
  if (pkg.artifacts.length !== 1 || pkg.artifacts[0].record.artifact.id !== state.artifactId || pkg.outputs.length !== 1) throw new Error('Unsupported native browser package inventory')
  if (!Number.isSafeInteger(nRows) || nRows < 1 || X.length !== nRows * nFeatures) throw new Error('Prediction matrix shape does not match its buffer')
  const inputRows = Array.from({ length: nRows }, (_, i) => i)
  const ids = inputRows.map((i) => `predict:s${i}`)
  const relations = { records: ids.map((id) => ({ observation_id: id, sample_id: id, source_id: 'nir', is_augmented: false })) }
  const envelope = dagml.initial_full_refit_predict_envelope_json(state.packageJson, JSON.stringify({ role: 'inference', relations, target_names: state.targetNames, data_content_fingerprint: await bufferFingerprint(X) }))
  let calls = 0
  const invoke: Invoke = (owner, json) => {
    const task = JSON.parse(json) as NativeTask
    if (owner !== OWNER || task.phase !== 'PREDICT' || ++calls !== 1) throw new Error('Unexpected native browser PREDICT task')
    const nativeIds = viewIds(task, 'predict')
    if (nativeIds.length !== nRows || !Object.values(task.input_handles).some((h) => h.handle === 1 && h.owner_controller === OWNER && h.kind === 'model')) throw new Error('Native PREDICT rows or fitted handle differ from the package')
    // DAG owns task order; align real feature rows by identity before numerics.
    const nativeRows = indices(nativeIds, inputRows, 'predict:s')
    const prediction = predictPipelineMatrix(model, takeRows(X, nativeRows, nFeatures), nRows, nFeatures, backend, featureNames)
    const result = nodeResult(task, { sampleIds: nativeIds, values: rows(prediction), targetNames: state.targetNames })
    return JSON.stringify({ ...result, predictions: result.predictions.map((block: object) => ({ ...block, producer_port: pkg.outputs[0].port_name })) })
  }
  const replay = JSON.parse(dagml.replay_initial_full_refit_json(state.packageJson, envelope, JSON.stringify(pkg.outputs.map((o) => o.output_id)), JSON.stringify({ [state.artifactId]: { handle: 1, kind: 'model', owner_controller: OWNER } }), 'run:web-predict', invoke))
  const blocks = replay.node_results.flatMap((r: { predictions: { sample_ids: string[]; values: number[][] }[] }) => r.predictions)
  if (calls !== 1 || blocks.length !== 1 || blocks[0].sample_ids.length !== nRows || blocks[0].values.length !== nRows || blocks[0].values.some((row: number[]) => row.length !== state.targetNames.length || row.some((v) => !Number.isFinite(v)))) throw new Error('Native replay returned incomplete or incompatible prediction evidence')
  const outputRows = indices(blocks[0].sample_ids, inputRows, 'predict:s')
  const data = new Float64Array(nRows * state.targetNames.length)
  for (let row = 0; row < nRows; row++) data.set(blocks[0].values[row], outputRows[row] * state.targetNames.length)
  return { data, rows: nRows, cols: state.targetNames.length }
}
export function predictionResult(model: FittedPipeline, pred: Mat): PredictResult {
  if (model.taskType === 'regression') return { values: pred.data }
  const classes = model.classes ?? []
  const values = Float64Array.from({ length: pred.rows }, (_, i) => {
    let best = 0
    for (let k = 1; k < pred.cols; k++) if (pred.data[i * pred.cols + k] > pred.data[i * pred.cols + best]) best = k
    return best
  })
  return { values, labels: Array.from(values, (i) => classes[i]) }
}
