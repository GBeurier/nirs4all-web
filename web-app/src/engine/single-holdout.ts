// Restricted Web lowering only: Methods splits/fits/predicts; DAG owns the bank,
// reports, SELECT, detached package and hydration. No owner-failure fallback.
import { loadDagMl } from './dagml'
import { materializeViaProvider, providerCohort, type DataProviderResult, type ProviderBinding } from './dagml-data'
import { datasetFeatureIdentity, checkInputColumns } from './feature-identity'
import { splitRows } from './methods/n4m'
import { loadDatasetsWasm, loadMethodsWasm } from './nirs4all-core'
import { decodeRows } from './orchestrate'
import { physicalIdentity, type PhysicalIdentity } from './relations'
import { makeRtError, RtErrorException } from './rt'
import { N4mWasmRegressionController, type MethodsRecipeStep } from './wasm/dagml/n4m_controller.mjs'
import type { FittedPipeline, MaterializedDataset, Metrics, PipelineDSL, PipelineStep, PredictResult, RunOptions, RunResult } from './types'

const BACKEND = 'dag-ml-single-holdout-wasm'
const PROFILE = 'single_resampled_holdout_bank.v1'
const REPORT = 'regression_report.population_rmse_ratios.v1'
const NODE = 'model:pls'
const OWNER = 'controller:methods.wasm.regression'
const VERSION = '1.1.0'
const OPERATOR = { type: 'N4mRolePipeline' }
const PLS = 'n4m:models.pls.pls_regression'
const SNV = 'n4m:preprocessing.scatter.snv'
const SG = 'n4m:preprocessing.derivatives.savitzky_golay'

interface Identity { ordinal: string; variant_id: string; recipe: MethodsRecipeStep[]; params: Record<string, unknown> }
interface PredictionBlock { sample_ids: string[]; values: number[][]; target_names: string[] }
interface OwnerReport { producer_node: string; fold_id: string; row_count: number; metrics: Metrics; metric_profile: string; undefined_metrics: Record<string, string> }
interface Variant { identity: Identity; eligible: boolean; report: OwnerReport | null; validation_predictions: PredictionBlock | null; validation_targets: { unit_ids: { id: string }[]; values: number[][] } | null }
interface Bank {
  status: 'selected' | 'refused'; refusal: string | null
  variants: Variant[]; chain_issues: { chain_label: string; failures: Record<string, string> }[]
  selected: { identity: Identity; selected_graph: unknown; training_sample_ids: string[]; validation_sample_ids: string[] } | null
}
interface PackageView {
  effective_plan: { node_plans: Record<string, { controller_id: string; controller_version: string; params: { pipeline_steps_v1: MethodsRecipeStep[]; n_components: number } }> }
  artifacts: { load_mode: string; record: { artifact: { kind: string; backend: string } } }[]
  outputs: { output_id: string }[]
  training_sample_ids: string[]
}
export interface SingleHoldoutState {
  backendId: typeof BACKEND
  profile: typeof PROFILE
  packageJson: string
  bankJson: string
  rootSeed: string
  originalDeclaration: PipelineDSL
  effectiveRecipe: MethodsRecipeStep[]
  featureNames: string[]
  targetNames: [string]
  inputIdentity: { basis: 'declared' | 'positional'; axis: number[]; axisUnit: string }
  identity: { sampleHandles: string[]; observationHandles: string[]; sampleIds: string[]; observationIds?: (string | null)[] }
  evaluation: { scope: 'selection_validation'; independent_test: false }
}

function refuse(reason: string, message: string): never {
  throw new RtErrorException(makeRtError({ verb: 'run', cause: 'unsupported_capability', unsupported_capability: `single_holdout_${reason}`, message }))
}
const unset = (value: unknown) => value === undefined || value === null || value === ''
function only(params: Record<string, unknown>, allowed: string[]): void {
  const key = Object.keys(params).find(key => !allowed.includes(key))
  if (key) refuse('parameter', `Unsupported single-holdout parameter '${key}'.`)
}
function number(value: unknown, fallback: number, label: string): number {
  const parsed = unset(value) ? fallback : typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) refuse('parameter', `${label} must be finite numeric data.`)
  return parsed
}
function integer(value: unknown, fallback: number, label: string): number {
  const parsed = number(value, fallback, label)
  if (!Number.isSafeInteger(parsed) || parsed < 1) refuse('parameter', `${label} must be a positive safe integer.`)
  return parsed
}
function component(value: unknown, fallback: number, label: string): number {
  if (value === '') refuse('parameter', `${label} must be a positive safe integer.`)
  return integer(value, fallback, label)
}
function fixed(params: Record<string, unknown>, key: string, value: unknown): void {
  if (!unset(params[key]) && params[key] !== value) refuse('parameter_conflict', `Single-holdout requires ${key}=${String(value)}; the supplied value is not discarded.`)
}

/** Exactly the structural surface previously reached by toPortableSource. */
function eligible(ds: MaterializedDataset, dsl: PipelineDSL): boolean {
  if (ds.taskType !== 'regression' || !dsl.model || dsl.model.type !== PLS) return false
  if (dsl.cv || dsl.branch || dsl.generation || (dsl.containers ?? []).some(c => c.container !== 'generator' || c.branches.length > 0)) return false
  if (ds.partitions.some(part => part === 'predict')) return false
  if (!dsl.split && ds.partitions.some(part => part === 'test')) return false
  if (dsl.split && (dsl.split.type !== 'n4m:splitters.kennard_stone' || dsl.split.variants || dsl.split.sweeps)) return false
  if (dsl.steps.some(step => ![SNV, SG].includes(step.type) || step.variants || step.sweeps)) return false
  if (dsl.model.variants || Object.keys(dsl.model.sweeps ?? {}).some(key => key !== 'n_components')) return false
  const sweep = dsl.model.sweeps?.n_components
  return !sweep || (sweep.type === 'range' && sweep.from !== undefined && sweep.to !== undefined)
}

function lowerStep(step: PipelineStep): MethodsRecipeStep {
  const params = step.params
  if (step.type === SNV) {
    only(params, ['with_mean', 'with_std', 'ddof'])
    fixed(params, 'with_mean', true); fixed(params, 'with_std', true); fixed(params, 'ddof', 0)
    return { methodId: SNV.slice(4), params: { with_mean: true, with_std: true, ddof: 0 } }
  }
  if (step.type === SG) {
    only(params, ['window_length', 'window', 'polyorder', 'deriv', 'delta', 'mode', 'cval'])
    if (!unset(params.window) && !unset(params.window_length) && params.window !== params.window_length) refuse('parameter_conflict', 'Conflicting SG window and window_length.')
    const delta = number(params.delta, 1, 'SG delta')
    if (delta !== 1) refuse('parameter_conflict', 'The matched single-holdout SG profile requires delta=1.')
    const mode = unset(params.mode) ? 'interp' : typeof params.mode === 'string' ? params.mode.toLowerCase() : params.mode
    if (!['mirror', 'constant', 'nearest', 'wrap', 'interp', 0, 1, 2, 3, 4].includes(mode as string | number)) refuse('parameter', 'Unsupported SG mode.')
    const polyorder = number(params.polyorder, 3, 'SG polyorder'), deriv = number(params.deriv, 0, 'SG deriv')
    if (!Number.isInteger(polyorder) || polyorder < 0 || !Number.isInteger(deriv) || deriv < 0) refuse('parameter', 'SG polyorder and deriv must be nonnegative integers.')
    return { methodId: SG.slice(4), params: {
      window_length: integer(params.window_length ?? params.window, 11, 'SG window_length'), polyorder, deriv,
      delta, mode, cval: number(params.cval, 0, 'SG cval'),
    } }
  }
  if (step.type !== PLS) refuse('recipe', 'Only the qualified SNV/SG/PLS recipe is supported by this adapter.')
  only(params, ['n_components', 'solver', 'center_x', 'scale_x', 'center_y', 'scale_y'])
  for (const key of ['center_x', 'scale_x', 'center_y', 'scale_y']) fixed(params, key, true)
  fixed(params, 'solver', 'simpls')
  return { methodId: PLS.slice(4), params: { n_components: component(params.n_components, 2, 'n_components'), solver: 'simpls', center_x: true, scale_x: true, center_y: true, scale_y: true } }
}

/** Ordered projection only. Source masks remain represented by finite/absent values;
 * the dense provider refuses masked cells. No missing value is filled here. */
export function singleHoldoutCohort(ds: MaterializedDataset, identity: PhysicalIdentity, indices: number[]): { ds: MaterializedDataset; identity: PhysicalIdentity } {
  if (!indices.length || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= ds.nSamples)) refuse('identity', 'A holdout cohort requires distinct original rows.')
  return providerCohort(ds, identity, indices)
}

type Dag = Awaited<ReturnType<typeof loadDagMl>>
type Hash = (bytes: Uint8Array) => string
const bytes = (values: Float64Array) => new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
function contentEnvelope(served: DataProviderResult, hash: Hash): string {
  return JSON.stringify({ ...JSON.parse(served.envelopeJson), data_content_fingerprint: hash(bytes(served.X)), target_content_fingerprint: hash(bytes(served.y)) })
}
function binding(served: DataProviderResult, envelopeJson: string, input: string) {
  const envelope = JSON.parse(envelopeJson)
  return { [NODE]: [{ node_id: NODE, input_name: input, request_id: 'nir-to-tabular',
    schema_fingerprint: envelope.schema_fingerprint, plan_fingerprint: envelope.plan_fingerprint,
    relation_fingerprint: envelope.relation_fingerprint, output_representation: served.outputRepresentation,
    feature_set_id: 'X', source_ids: ['nir'], require_relations: true,
  }] }
}
function controller(methods: Awaited<ReturnType<typeof loadMethodsWasm>>, hash: Hash, served: Pick<DataProviderResult, 'X' | 'y'> & { identity: Pick<PhysicalIdentity, 'rowsOf'> }, featureNames: string[], targetNames: [string], signal?: AbortSignal) {
  const row = (id: string) => {
    const indices = served.identity.rowsOf.get(id)
    if (indices?.length !== 1) refuse('identity', `Owner requested unavailable or repeated sample '${id}'.`)
    return indices[0]
  }
  const check = () => { if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError') }
  return new N4mWasmRegressionController({ methods, operators: { [NODE]: OPERATOR }, controllerVersion: VERSION, digest: hash, targetNames,
    resolveFeatures: ({ view }) => {
      check()
      const data = new Float64Array(view.sample_ids.length * featureNames.length)
      view.sample_ids.forEach((id, i) => data.set(served.X.subarray(row(id) * featureNames.length, (row(id) + 1) * featureNames.length), i * featureNames.length))
      return { sampleIds: [...view.sample_ids], matrix: { data, rows: view.sample_ids.length, cols: featureNames.length }, featureNames }
    },
    resolveTargets: ({ sampleIds }) => {
      check()
      return { sampleIds: [...sampleIds], matrix: { data: Float64Array.from(sampleIds, id => served.y[row(id)]), rows: sampleIds.length, cols: 1 } }
    },
  })
}

export function isSingleHoldoutModel(model: FittedPipeline): boolean {
  return (model.state as Partial<SingleHoldoutState> | null)?.backendId === BACKEND
}
function checkedPackage(dag: Dag, state: SingleHoldoutState): PackageView {
  if (state.profile !== PROFILE || typeof state.packageJson !== 'string' || !/^\d+$/.test(state.rootSeed) || state.targetNames?.length !== 1) refuse('state', 'Unsupported detached single-holdout state.')
  dag.validate_initial_full_refit_package_json(state.packageJson)
  const pkg = JSON.parse(state.packageJson) as PackageView
  const nodes = Object.entries(pkg.effective_plan.node_plans)
  if (nodes.length !== 1 || nodes[0][0] !== NODE || nodes[0][1].controller_id !== OWNER || nodes[0][1].controller_version !== VERSION || pkg.outputs.length !== 1 || pkg.artifacts.length !== 1 || pkg.artifacts.some(a => a.load_mode !== 'native_portable' || a.record.artifact.kind !== 'methods_role_pipeline' || a.record.artifact.backend !== 'raw')) refuse('state', 'Only the qualified portable Methods RolePipeline package is supported here.')
  const params = nodes[0][1].params
  const steps = params.pipeline_steps_v1
  if (!Array.isArray(steps) || !steps.length) refuse('state', 'Detached package has no qualified recipe.')
  steps.forEach((step, i) => {
    if (!step.methodId || (i === steps.length - 1 ? step.methodId !== PLS.slice(4) : ![SNV.slice(4), SG.slice(4)].includes(step.methodId))) refuse('state', 'Detached package is outside the non-retaining SNV/SG/PLS profile.')
    // Check the actual package recipe, not a backend label or external copy.
    const effective: Record<string, unknown> = { ...step.params, ...(i === steps.length - 1 ? { n_components: params.n_components } : {}) }
    const expected = lowerStep({ id: String(i), type: `n4m:${step.methodId}`, params: effective })
    if (Object.entries(expected.params!).some(([key, value]) => effective[key] !== value)) refuse('state', 'Detached package must declare the complete qualified effective parameters.')
  })
  if (params.n_components > Math.min(state.featureNames.length, pkg.training_sample_ids.length - 1)) refuse('component_bound', 'Detached package components exceed its qualified training bound.')
  return pkg
}

/** Display projection of this fixed linear recipe, preserving owner MethodIDs
 * and complete effective params. The original declaration remains separate. */
function selectedDeclaration(original: PipelineDSL, recipe: MethodsRecipeStep[]): PipelineDSL {
  const declared = [...original.steps, original.model!]
  if (recipe.length !== declared.length || recipe.some((step, i) => `n4m:${step.methodId}` !== declared[i].type)) refuse('owner_recipe', 'Owner recipe differs from the declared fixed linear MethodIDs.')
  const effective = declared.map((step, i) => ({ ...structuredClone(step), params: structuredClone(recipe[i].params ?? {}), sweeps: undefined, variants: undefined }))
  return { ...structuredClone(original), steps: effective.slice(0, -1), model: effective.at(-1)! }
}

export async function tryRunSingleHoldout(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult | null> {
  if (!eligible(ds, dsl)) return null
  if (!dsl.split) refuse('resubstitution', 'Training-only resubstitution and its sweeps are not supported by the single-holdout profile.')
  if (ds.partitions.includes('test')) refuse('retained_test', 'Explicit KennardStone plus retained test rows is refused before splitting: retained test data cannot enter selection.')
  only(dsl.split.params, ['test_size', 'n_train'])
  if (!unset(dsl.split.params.n_train)) refuse('training_count', "The Web single-holdout profile does not qualify 'n_train'; native Methods count support is separate.")
  const testSize = number(dsl.split.params.test_size, .25, 'test_size')
  if (testSize <= 0 || testSize >= 1) refuse('parameter', 'test_size must be strictly between zero and one.')
  const recipe = [...dsl.steps.map(lowerStep), lowerStep(dsl.model!)]
  const base = component(dsl.model!.params.n_components, 2, 'n_components')
  const sweep = dsl.model!.sweeps?.n_components
  if (sweep) only(sweep as unknown as Record<string, unknown>, ['type', 'from', 'to', 'step'])
  const start = sweep ? component(sweep.from, base, 'range start') : base
  const stop = sweep ? component(sweep.to, base, 'range stop') : base
  const stride = sweep ? component(sweep.step, 1, 'range step') : 1
  if (start > stop) refuse('parameter', 'Component range start must not exceed stop.')
  // Axis declarations only; DAG enumerates and executes the Cartesian bank.
  const components = Array.from({ length: Math.floor((stop - start) / stride) + 1 }, (_, i) => start + i * stride)
  if (ds.axis.length !== ds.nFeatures) refuse('axis', 'The declared spectral axis must match the feature width; no replacement axis is invented.')
  const features = datasetFeatureIdentity(ds)
  if ((ds.featureNames || ds.axisUnit !== 'index') && !features) refuse('columns', 'The holdout profile requires complete distinct declared input columns.')
  const featureNames = features?.names ?? Array.from({ length: ds.nFeatures }, (_, i) => String(i))
  const targetNames: [string] = [ds.targetName]
  const identity = physicalIdentity(ds)
  if (identity.repeated || ds.X.length !== ds.nSamples * ds.nFeatures || ds.y.length !== ds.nSamples || !ds.X.every(Number.isFinite) || !ds.y.every(Number.isFinite)) refuse('dense_data', 'This holdout profile requires complete finite independent rows; masked or repeated data are not projected away.')
  if (opts.signal?.aborted) throw new DOMException('Run cancelled', 'AbortError')
  const methods = await loadMethodsWasm()
  const [fold] = splitRows('n4m:splitters.kennard_stone', { test_size: testSize }, { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }, ds.y)
  if (!fold) refuse('split', 'Native KennardStone returned no holdout.')
  const train = singleHoldoutCohort(ds, identity, fold.train)
  singleHoldoutCohort(ds, identity, fold.test)
  if (new Set([...fold.train, ...fold.test]).size !== ds.nSamples || fold.train.some(i => fold.test.includes(i))) refuse('split', 'Native holdout must cover disjoint training and validation rows.')
  // This adapter refuses the declaration, rather than applying the ordinary Web
  // clamp (which would duplicate candidates) or salvaging a reduced chain.
  const bound = Math.min(ds.nFeatures, fold.train.length - 1)
  if (components.some(n => n > bound)) refuse('component_bound', `Declared components exceed min(features, KS-train rows - 1)=${bound}; no values are clamped or dropped.`)
  const dag = await loadDagMl()
  if (typeof dag.execute_single_holdout_bank_json !== 'function') refuse('owner_api', 'The staged DAG lacks the single-resampled-holdout bank; no alternate execution is used.')
  const hash = (await loadDatasetsWasm()).sha256
  const full = await materializeViaProvider(ds, { identity, featureNames, targetNames })
  const envelope = contentEnvelope(full, hash)
  const owner = controller(methods, hash, full, featureNames, targetNames, opts.signal)
  let bankJson: string
  let bank: Bank
  let input: string
  let template: Record<string, unknown>
  const rootSeed = '0' // old eligible DSL has no CV seed; exact digits cross the ABI
  const manifests = JSON.stringify([owner.manifest(dag)])
  try {
    const artifact = JSON.parse(dag.compile_pipeline_dsl_artifact_with_controllers_json(JSON.stringify({ id: 'graph:web-holdout', steps: [{ kind: 'model', id: NODE, operator: OPERATOR, params: { pipeline_steps_v1: recipe, n_components: base } }] }), manifests))
    const ports = artifact.graph.nodes[0].ports.inputs.filter((p: { kind: string }) => p.kind === 'data')
    if (ports.length !== 1) refuse('owner_graph', 'Expected one native model data port.')
    input = ports[0].name
    template = artifact.campaign_template
    const trainIds = fold.train.map(i => identity.sampleHandle[i]), validIds = fold.test.map(i => identity.sampleHandle[i])
    const choice = (label: string, params: Record<string, unknown>) => ({ label, value: label, param_overrides: [{ node_id: NODE, params }] })
    const campaign = { ...template, split_invocation: { id: 'split:web-holdout', fold_set: { id: 'foldset:web-holdout', sample_ids: identity.handles, sample_groups: {}, partition_mode: 'resampled', train_exclusion: 'relations', target_missing_sample_ids: [], folds: [{ fold_id: 'fold:holdout', train_sample_ids: trainIds, validation_sample_ids: validIds, metadata: {} }] } },
      generation: { strategy: 'cartesian', max_variants: components.length, dimensions: [
        { name: 'chain', choices: [choice('declared recipe', { pipeline_steps_v1: recipe })] },
        { name: 'components', choices: components.map(n => choice(`n_components=${n}`, { n_components: n })) },
      ] }, data_bindings: binding(full, envelope, input),
    }
    const plan = dag.build_execution_plan_json('plan:web-holdout', JSON.stringify(artifact.graph), JSON.stringify(campaign), manifests)
    opts.onProgress?.({ phase: 'fit_cv', pct: 10, message: 'DAG single-holdout bank' })
    bankJson = dag.execute_single_holdout_bank_json(plan, manifests, envelope, JSON.stringify({ schema_version: 1, profile: PROFILE, report_profile: REPORT, failure_group_dimension: 'chain', target_node: NODE }), 'run:web-holdout', rootSeed, owner.callback)
    bank = JSON.parse(bankJson)
    if (bank.status !== 'selected' || !bank.selected) throw Object.assign(new Error([bank.refusal ?? 'DAG single-holdout bank refused.', ...bank.chain_issues.map(issue => JSON.stringify(issue))].join('\n')), { bankJson })
    if (JSON.stringify(bank.selected.training_sample_ids) !== JSON.stringify(trainIds) || JSON.stringify(bank.selected.validation_sample_ids) !== JSON.stringify(validIds)) refuse('identity', 'Owner-selected holdout identities/order differ from the native split.')
  } finally { owner.close() }

  // A fresh native schema/plan/relation envelope for the ordered training cohort.
  const training = await materializeViaProvider(train.ds, { identity: train.identity, featureNames, targetNames })
  const trainingEnvelope = contentEnvelope(training, hash)
  const refitter = controller(methods, hash, training, featureNames, targetNames, opts.signal)
  let packageJson: string
  try {
    const plan = dag.build_execution_plan_json('plan:web-holdout-refit', JSON.stringify(bank.selected!.selected_graph), JSON.stringify({ ...template!, split_invocation: null, generation: { strategy: 'none', dimensions: [], max_variants: 1 }, data_bindings: binding(training, trainingEnvelope, input!) }), manifests)
    const refit = JSON.parse(dag.execute_initial_full_refit_json(plan, manifests, trainingEnvelope, JSON.stringify(bank.selected!.training_sample_ids), 'package:web-holdout', 'run:web-holdout-refit', rootSeed, refitter.callback))
    packageJson = refit.initial_full_refit_package_json
    if (typeof packageJson !== 'string') refuse('owner_package', 'Owner REFIT omitted exact package JSON.')
  } finally { refitter.close() }
  const selected = bank.selected!
  const state: SingleHoldoutState = { backendId: BACKEND, profile: PROFILE, packageJson, bankJson, rootSeed, originalDeclaration: structuredClone(dsl), effectiveRecipe: selected.identity.recipe, featureNames, targetNames, inputIdentity: { basis: identity.basis, axis: [...ds.axis], axisUnit: ds.axisUnit },
    identity: { sampleHandles: [...identity.sampleHandle], observationHandles: [...identity.observationHandle], sampleIds: [...ds.sampleIds], observationIds: ds.observationIds && [...ds.observationIds] }, evaluation: { scope: 'selection_validation', independent_test: false } }
  checkedPackage(dag, state)
  const fitted: FittedPipeline = { dsl: selectedDeclaration(dsl, selected.identity.recipe), taskType: 'regression', nFeatures: ds.nFeatures, features, state }
  const winner = bank.variants.find(v => v.identity.ordinal === selected.identity.ordinal)
  if (!winner?.report || !winner.validation_predictions || !winner.validation_targets) refuse('owner_report', 'Owner winner lacks complete validation evidence.')
  const predictions = winner.validation_predictions
  const rowOf = new Map(identity.sampleHandle.map((id, i) => [id, i]))
  const order = predictions.sample_ids.map(id => {
    const i = rowOf.get(id)
    if (i === undefined) refuse('identity', 'Owner prediction references an unknown sample.')
    return i
  })
  const validation = singleHoldoutCohort({ ...ds, X: full.X, y: full.y }, identity, order)
  const replayed = await predictSingleHoldout(fitted, validation.ds.X, order.length, ds.nFeatures, features?.names)
  if (replayed.values.some((value, i) => !Object.is(value, predictions.values[i][0]))) refuse('winner_replay', 'Owner train-only REFIT/hydrated validation predictions differ from the selected FIT_CV predictions.')
  // Reuse existing display decoding, not scoreNode or any host metric routine.
  const truth = new Map(winner.validation_targets.unit_ids.map((id, i) => [id.id, winner.validation_targets!.values[i][0]]))
  const display = { ...ds, y: Float64Array.from(ds.y) }
  order.forEach((row, i) => {
    const value = truth.get(predictions.sample_ids[i])
    if (value === undefined) refuse('identity', 'Owner validation target is absent.')
    display.y[row] = value
  })
  const rows = decodeRows(display, [], new Int32Array(), { data: Float64Array.from(predictions.values, row => row[0]), rows: order.length, cols: 1 }, order)
  const report = winner.report
  if (report.producer_node !== NODE || !report.fold_id) refuse('owner_report', 'Owner holdout report must retain its producer and validation fold.')
  opts.onProgress?.({ phase: 'done', pct: 100 })
  return { id: `run-${Date.now().toString(36)}`, pipelineName: dsl.name, targetName: ds.targetName, taskType: 'regression', engine: 'dag-ml-wasm', scoreMetric: 'rmse', seed: 0, createdAt: new Date().toISOString(), model: fitted, folds: [],
    refit: { id: report.fold_id, kind: 'refit', name: 'Selection validation', status: 'completed', predictions: rows, metrics: { ...report.metrics, n: report.row_count }, scoreContext: { unit: 'sample', identityBasis: identity.basis, physicalKey: identity.physicalKey, nObservations: order.length, nPhysicalSamples: identity.basis === 'positional' ? null : order.length, aggregation: 'dag:single-holdout', evaluation: 'selection_validation', independent_test: false, metric_profile: report.metric_profile, undefined_metrics: report.undefined_metrics } },
    lineage: { engine: 'dag-ml-wasm', executed: true, profile: PROFILE, producerNode: report.producer_node, selectedVariant: selected.identity.variant_id, evaluation: state.evaluation, bankJson, chainIssues: bank.chain_issues }, bundleJson: bankJson,
    variantCount: bank.variants.length, variants: bank.variants.map(v => ({ variantId: v.identity.variant_id, label: v.identity.ordinal, metrics: v.report?.metrics ?? {}, selected: v.identity.ordinal === selected.identity.ordinal, pipeline: selectedDeclaration(dsl, v.identity.recipe) })),
  }
}

export async function predictSingleHoldout(model: FittedPipeline, X: Float64Array, n: number, p: number, names?: string[]): Promise<PredictResult> {
  checkInputColumns(model, p, names)
  if (!Number.isSafeInteger(n) || n < 1 || X.length !== n * p) refuse('predict_shape', 'Prediction matrix shape does not match its buffer.')
  const state = model.state as SingleHoldoutState
  const dag = await loadDagMl(), pkg = checkedPackage(dag, state)
  if (state.featureNames.length !== p) refuse('columns', 'Detached feature-name width differs from the fitted model.')
  const methods = await loadMethodsWasm(), hash = (await loadDatasetsWasm()).sha256
  const ids = Array.from({ length: n }, (_, i) => `predict:s${i}`)
  const identity = { rowsOf: new Map(ids.map((id, i) => [id, [i]])) }
  const owner = controller(methods, hash, { X, y: new Float64Array(), identity }, state.featureNames, state.targetNames)
  try {
    const envelope = dag.initial_full_refit_predict_envelope_json(state.packageJson, JSON.stringify({ role: 'inference', target_names: state.targetNames, relations: { records: ids.map(id => ({ observation_id: id, sample_id: id, source_id: 'nir', is_augmented: false })) }, data_content_fingerprint: hash(bytes(X)) }))
    const replay = JSON.parse(dag.replay_initial_full_refit_json(state.packageJson, envelope, JSON.stringify(pkg.outputs.map(o => o.output_id)), '{}', 'run:web-holdout-predict', owner.callback)) as { node_results: { predictions: PredictionBlock[] }[] }
    const blocks = replay.node_results.flatMap(node => node.predictions)
    if (blocks.length !== 1 || blocks[0].sample_ids.length !== n || new Set(blocks[0].sample_ids).size !== n || blocks[0].values.length !== n || blocks[0].values.some(row => row.length !== 1 || !Number.isFinite(row[0]))) refuse('prediction_evidence', 'Owner replay returned incomplete scalar predictions.')
    const at = new Map(ids.map((id, i) => [id, i])), values = new Float64Array(n)
    blocks[0].sample_ids.forEach((id, i) => {
      const row = at.get(id)
      if (row === undefined) refuse('identity', 'Owner replay returned an unknown sample.')
      values[row] = blocks[0].values[i][0]
    })
    return { values }
  } finally { owner.close() }
}

/** This deliberately admits only the qualified non-retaining state family.
 * No training-row permission can be inferred from the backend or enabled here. */
export async function exportSingleHoldoutModel(model: FittedPipeline): Promise<FittedPipeline> {
  checkedPackage(await loadDagMl(), model.state as SingleHoldoutState)
  return structuredClone(model)
}
