// User choices are compiled and signed by DAG-ML; Methods owns each fit.
import { loadDagMl, loadMethodsWasm } from './index.js';
import { loadArchiveV2Native, readPortableArchiveV2, writePortableArchiveV2, replayMethodsArchiveV2 } from './archive-v2.js';
import { trainingResultView } from './result-view.js';

const json = JSON.stringify;
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
let runtimePromise;
const nativeProfiles = new WeakMap();
async function runtime(options) {
  if (options.dagMl) return options.dagMl;
  runtimePromise ??= (async () => {
    const dag = await loadDagMl();
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      dag.initSync({ module: await readFile(new URL(import.meta.resolve('dag-ml-wasm/dag_ml_wasm_bg.wasm'))) });
    } else await dag.default();
    return dag;
  })();
  return runtimePromise;
}
export async function workflowDependencies(options) {
  const [dag, methods, io, native, adapter] = await Promise.all([
    runtime(options), options.methods ?? loadMethodsWasm(),
    options.io ?? import('@nirs4all/io-wasm/public-dataset'), loadArchiveV2Native(),
    import('dag-ml-wasm/n4m-controller'),
  ]);
  if (typeof methods.loadModule === 'function') await methods.loadModule();
  if (typeof native.sha256_bytes !== 'function') throw new Error('Native Core SHA-256 bridge is required');
  return { dag, methods, io, digest: bytes => native.sha256_bytes(bytes), Controller: adapter.N4mWasmRegressionController };
}
function hashes(digest) {
  const encoder = new TextEncoder();
  return value => digest(encoder.encode(json(ordered(value))));
}
function sourceSchema(source) {
  return { source_id: source.name, representation_id: source.representation_id, axes: source.axes,
    dtype: source.array.dtype, shape: [null, ...source.array.shape.slice(1)], feature_names: source.feature_names,
    axis_units: source.axis_units, axis_coordinates: source.axis_coordinates };
}
function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}
const recipe = deepFreeze({ type: 'N4mRolePipeline', steps: [
  { class: 'n4m:preprocessing.scatter.snv', params: {} },
  { class: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 5, polyorder: 2 } },
  { class: 'n4m:models.pls.pls_regression', params: {} },
] });
const rawRecipe = deepFreeze({ type: 'N4mRolePipeline', steps: [recipe.steps[2]] });
function boundedProfile(pkg) {
  const nodes = pkg.template?.graph?.nodes;
  if (!Array.isArray(nodes) || nodes.length !== 1 || nodes[0].id !== 'model:pls'
    || pkg.output_bindings?.length !== 1 || pkg.template.graph.edges?.length !== 0) {
    throw new TypeError('Archive does not contain the supported dense workflow profile');
  }
  const node = nodes[0];
  const generation = pkg.template.campaign.generation;
  const choices = generation.dimensions?.[0]?.choices;
  if (generation.strategy !== 'cartesian' || generation.dimensions.length !== 1
    || generation.dimensions[0].name !== 'pls_components' || !Array.isArray(choices)
    || choices.length < 2 || choices.length > 32 || new Set(choices.map(choice => choice.value)).size !== choices.length
    || choices.some(choice => !Number.isInteger(choice.value) || choice.value < 1 || choice.value > 2147483647
      || choice.active_subsequence != null || choice.param_overrides?.length !== 1
      || choice.param_overrides[0].node_id !== 'model:pls'
      || json(ordered(choice.param_overrides[0].params)) !== json({ n_components: choice.value }))) {
    throw new TypeError('Archive does not contain the supported PLS component candidate choices');
  }
  const expectedCpuPipeline = { schema_version: 1, pipeline_type: 'n4m.snv_savgol_smooth.v1', savgol_window: 5, savgol_poly_degree: 2 };
  const isCpu = node.operator === 'pls'
    && Object.keys(node.params).every(key => ['n_components', 'pipeline'].includes(key))
    && (!Object.hasOwn(node.params, 'pipeline') || json(ordered(node.params?.pipeline)) === json(ordered(expectedCpuPipeline)))
    && pkg.effective_plan.node_plans['model:pls']?.controller_id === 'controller:methods.pls';
  const isRole = [recipe, rawRecipe].some(candidate => json(ordered(node.operator)) === json(ordered(candidate)))
    && Object.keys(node.params).every(key => key === 'n_components')
    && pkg.effective_plan.node_plans['model:pls']?.controller_id === 'controller:methods.wasm.regression';
  if (!isCpu && !isRole) throw new TypeError('Archive preprocessing differs from supported raw or snv_savgol recipes');
  return isCpu ? 'native_n4mm' : 'wasm_role_pipeline';
}
function controller(deps, operators, targetNames, sourceId, dense) {
  const positions = new Map(dense.sample_ids.map((id, i) => [id, i]));
  const select = ids => ids.map(id => {
    const index = positions.get(id);
    if (index === undefined) throw new Error(`Unknown native view sample ${id}`);
    return index;
  });
  return new deps.Controller({ methods: deps.methods, operators, targetNames, digest: deps.digest,
    resolveFeatures: ({ view }) => {
      if (view.source_ids.length !== 1 || view.source_ids[0] !== sourceId) throw new Error('Native view source mismatch');
      const rows = select(view.sample_ids).map(index => dense.X[index]);
      return { sampleIds: [...view.sample_ids], matrix: { data: Float64Array.from(rows.flat()), rows: rows.length, cols: rows[0].length } };
    },
    resolveTargets: ({ sampleIds }) => {
      if (!dense.y) throw new Error('Inference cannot request targets');
      return { sampleIds: [...sampleIds], matrix: { data: Float64Array.from(select(sampleIds).map(index => dense.y[index])), rows: sampleIds.length, cols: 1 } };
    },
  });
}
function envelope(dag, hash, sourceId, dense, raw) {
  const plan = { id: 'io:dense-regression', output_representation: 'tabular_numeric', issues: [], steps: [{
    kind: 'materialize', source_id: sourceId, adapter_id: null, input_representation: null,
    output_representation: 'tabular_numeric', fit_scope: 'stateless', requires_user_choice: false, metadata: { output: 'port:X' },
  }] };
  const relations = { records: dense.sample_ids.map((id, i) => ({ observation_id: `obs:${id}`, sample_id: id,
    target_id: dense.y ? `target:${id}` : null, source_id: sourceId, group_id: raw.groups?.values[i] ?? null,
    origin_sample_id: null, is_augmented: false })) };
  return { schema_version: 1, schema_fingerprint: hash(sourceSchema(raw.sources.find(source => source.name === sourceId))),
    plan_fingerprint: hash(plan), relation_fingerprint: dag.sample_relation_set_fingerprint_json(json(relations)),
    plan, coordinator_relations: relations, data_content_fingerprint: hash(dense.X),
    target_content_fingerprint: dense.y ? hash(dense.y) : null, metadata: {} };
}

/** Native CV -> OOF selection -> full-data refit, with no caller-authored manifests. */
export async function run(value, options = {}) {
  const deps = await workflowDependencies(options), { dag, io } = deps, hash = hashes(deps.digest);
  const ds = io.dataset(value), record = ds.toJSON(), raw = record.dataset;
  const sourceId = options.sourceId ?? 'spectra', components = options.components ?? [1, 2];
  if (!Array.isArray(components) || components.length < 2 || components.length > 32 || new Set(components).size !== components.length
    || components.some(n => !Number.isInteger(n) || n < 1 || n > 2147483647)) throw new TypeError('2 to 32 distinct positive i32 component candidates required');
  const preprocessing = options.preprocessing ?? 'snv_savgol';
  if (!['raw', 'snv_savgol'].includes(preprocessing)) throw new TypeError('preprocessing must be raw or snv_savgol');
  const selectedRecipe = preprocessing === 'raw' ? rawRecipe : recipe;
  const dense = ds.toDenseRegression(sourceId);
  if (raw.partitions.values.some(p => p !== 'train') || raw.y.shape.length !== 1 || dense.y.some(y => !Number.isFinite(y))) throw new TypeError('Training requires one observed numeric target and train rows');
  if (new Set(record.origin_ids).size !== record.origin_ids.length || record.origin_ids.some((origin, i) => origin !== dense.sample_ids[i])
    || raw.groups !== null || raw.independent_unit_ids || raw.repetition_ids || record.fold_ids.some(id => id !== null)) throw new TypeError('This bounded workflow requires independent samples, no groups or declared folds');
  const seed = options.seed ?? 91, folds = options.folds ?? 2;
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError('seed must be a nonnegative safe integer');
  if (!Number.isSafeInteger(folds) || folds < 2) throw new TypeError('folds must be a safe integer of at least two');
  const foldSet = JSON.parse(dag.kfold_split_json(json({ n_splits: folds, shuffle: false, seed }), json(dense.sample_ids), 'folds:workflow'));
  const env = envelope(dag, hash, sourceId, dense, raw);
  const binding = { node_id: 'model:pls', input_name: 'x', request_id: env.plan.id, schema_fingerprint: env.schema_fingerprint,
    plan_fingerprint: env.plan_fingerprint, relation_fingerprint: env.relation_fingerprint, output_representation: 'tabular_numeric',
    feature_set_id: 'x', source_ids: [sourceId], require_relations: true, view_policy: { fit_partition: 'fold_train', predict_partition: 'fold_validation',
      include_augmented_train: false, include_augmented_validation: false, include_excluded: false, require_sample_ids: true }, metadata: {} };
  const nativeController = controller(deps, { 'model:pls': selectedRecipe }, raw.target_names, sourceId, dense);
  try {
    const manifest = nativeController.manifest(dag);
    const policy = { split_unit: 'sample', forbid_origin_cross_fold: true, allow_observation_split_with_shared_target: false, require_group_ids: false, unsafe_flags: [] };
    const compiled = JSON.parse(dag.compile_pipeline_dsl_artifact_with_controllers_json(json({ id: 'dsl:workflow',
      input: { name: 'x', representation: 'tabular_numeric' }, campaign_id: 'campaign:workflow', root_seed: seed,
      leakage_policy: policy, data_bindings: [binding], split_invocation: { id: 'split:workflow', controller_id: null,
        leakage_policy: policy, params: {}, fold_set: foldSet }, steps: [{ kind: 'model', id: 'model:pls', operator: selectedRecipe, params: { n_components: components[0] } }],
    }), json([manifest])));
    compiled.campaign_template.metadata = { ...compiled.campaign_template.metadata, raw_source_schema: io.publicSourceSchema(record, sourceId), input_sample_ids: [...dense.sample_ids] };
    compiled.campaign_template.generation = { strategy: 'cartesian', max_variants: components.length, dimensions: [{ name: 'pls_components',
      choices: components.map(n => ({ label: `pls_${n}`, value: n, param_overrides: [{ node_id: 'model:pls', params: { n_components: n } }], active_subsequence: null })) }] };
    const request = { schema_version: 1, request_id: 'training:workflow', plan_id: 'plan:workflow', graph: compiled.graph,
      campaign: compiled.campaign_template, controller_manifests: [manifest], data_identities: [JSON.parse(dag.training_data_identity_json(json(binding), json(env)))],
      parameter_patches: [], patch_policies: [], influence_requirements: [], training_losses: [], request_fingerprint: '0'.repeat(64), options: {
        refit: true, refit_strategy: 'refit_one', seed, selection: { id: 'selection:rmse', metric: { name: 'rmse', objective: 'minimize' },
          required_metric_level: 'sample', require_finite: true, evaluation_scope: 'oof' }, selection_output_id: 'output:prediction',
        outputs: [{ output_id: 'output:prediction', node_id: 'model:pls', port_name: 'oof', prediction_level: 'sample', unit_level: 'physical_sample',
          prediction_kind: 'regression_point', target_names: raw.target_names, target_units: [null], class_labels: [[]], output_order: 'target_order', target_space: 'raw' }],
        scheduler: { kind: 'sequential', backend: null, workers: 1 }, resources: { cpu_threads: 1, memory_bytes: null, gpu_devices: [], wall_time_ms: null },
        artifacts: { cv_artifacts: 'discard', prediction_caches: 'retain', fitted_artifacts: 'portable_required' },
      } };
    const runId = options.runId ?? `run:workflow:${globalThis.crypto.randomUUID()}`;
    const capture = JSON.parse(dag.execute_training_json(dag.sign_training_request_json(json(request)), json({ 'model:pls.x': env }),
      json(env.coordinator_relations), `package:${runId}`, `outcome:${runId}`, runId, `bundle:${runId}`, nativeController.callback));
    const payloads = JSON.parse(dag.build_archive_v2_native_portable_payloads_json(`archive:${runId}`, capture.training_outcome_json, capture.portable_predictor_package_json));
    const archive = await writePortableArchiveV2(payloads.manifest, Object.fromEntries(Object.entries(payloads.members).map(([name, bytes]) => [name, Uint8Array.from(bytes)])));
    return new Workflow(archive, JSON.parse(capture.training_outcome_json), { sourceId, components: [...components], preprocessing, seed, folds, inputSampleIds: [...dense.sample_ids] });
  } finally { nativeController.close(); }
}

export class Workflow {
  constructor(archive, outcome, config, nativeProfile = 'wasm_role_pipeline') {
    this.archive = new Uint8Array(archive); this.outcome = structuredClone(outcome); this.config = structuredClone(config);
    nativeProfiles.set(this, nativeProfile);
  }
  predict(value, options = {}) { return predict(this, value, options); }
  retrain(value, options = {}) { return retrain(this, value, options); }
  export() { return exportWorkflow(this); }
  compare(query = {}) { return trainingResultView(this.outcome, this.config.inputSampleIds).compare(query); }
  predictions(query = {}) { return trainingResultView(this.outcome, this.config.inputSampleIds).predictions(query); }
  summary() { return trainingResultView(this.outcome, this.config.inputSampleIds).summary(); }
}
/** Rehydrate native Methods state from the shared Archive V2; no fit occurs. */
export async function predict(model, value, options = {}) {
  return workflowReplay(model, value, options, false);
}
export async function workflowReplay(model, value, options = {}, calibration = false, details = false) {
  if (options.preprocessing !== undefined && !['raw', 'snv_savgol'].includes(options.preprocessing)) throw new TypeError('preprocessing must be raw or snv_savgol');
  const deps = await workflowDependencies(options), { dag, io } = deps, hash = hashes(deps.digest);
  const archive = await readPortableArchiveV2(model instanceof Workflow ? model.archive : model);
  const packagePath = archive.manifest.replay.portable_predictor_package.member_path;
  const packageJson = new TextDecoder('utf-8', { fatal: true }).decode(archive.members[packagePath]);
  dag.validate_archive_v2_portable_payloads_json(json(archive.manifest), packageJson,
    json(Object.fromEntries(Object.entries(archive.members).map(([name, bytes]) => [name, [...bytes]]))));
  const pkg = JSON.parse(packageJson);
  const profile = boundedProfile(pkg);
  if (calibration && Object.values(pkg.effective_plan.node_plans).some(node => node.controller_id === 'controller:methods.pls')) {
    throw new TypeError('Browser calibration requires a native DAG role-pipeline workflow; calibrate this C-native N4MM archive in a native host before browser replay');
  }
  const ds = io.dataset(value), raw = ds.toJSON().dataset;
  if (calibration) {
    if (raw.y === null || raw.y.shape.length !== 1 || raw.y.values.some(y => !Number.isFinite(y))) throw new TypeError('Calibration requires one finite observed target');
    if (raw.groups !== null || raw.independent_unit_ids || raw.repetition_ids) throw new TypeError('Calibration requires independent physical samples');
  } else if (raw.y !== null || raw.partitions.values.some(p => p !== 'predict')) throw new TypeError('Prediction requires target-free predict rows');
  const binding = Object.values(pkg.template.campaign.data_bindings).flat()[0];
  const sourceId = binding.source_ids[0], source = raw.sources.find(s => s.name === sourceId);
  if (!source || source.array.shape.length !== 2 || source.presence_mask.values.some(p => !p)) throw new TypeError('Prediction requires the complete numeric training source');
  if (profile === 'native_n4mm') {
    if (calibration || details) throw new TypeError('C-native N4MM replay does not produce a DAG host-controller replay outcome; use the native calibration or presentation API');
    const archivedSchema = pkg.template.campaign.metadata.raw_source_schema;
    if (!archivedSchema || json(ordered(io.publicSourceSchema(ds, sourceId))) !== json(ordered(archivedSchema))) {
      throw new TypeError('Prediction source schema differs from training (dtype, columns, axes, shape, units or coordinates)');
    }
    return replayMethodsArchiveV2(model instanceof Workflow ? model.archive : model,
      { X: source.array.values, rows: raw.sample_ids.length, cols: source.array.shape[1], sampleIds: raw.sample_ids },
      { methods: deps.methods });
  }
  if (hash(sourceSchema(source)) !== pkg.data_identities[0].schema_fingerprint) throw new TypeError('Prediction source schema differs from training (dtype, columns, axes, shape, units or coordinates)');
  const dense = { X: source.array.values, sample_ids: raw.sample_ids, y: calibration ? raw.y.values : null };
  const output = pkg.output_bindings[0], targetNames = output.target_names;
  const nodes = pkg.template.graph.nodes;
  const operators = Object.fromEntries(nodes.filter(node => pkg.predictor_node_ids.includes(node.id)).map(node => [node.id, node.operator]));
  const nativeController = controller(deps, operators, targetNames, sourceId, dense);
  try {
    const trainingIds = pkg.effective_plan.fold_set.sample_ids;
    const identity = pkg.data_identities[0];
    // Reconstruct only the archived structural envelope from native-signed
    // identities and the native training fold cohort. No training values enter.
    const cohort = envelope(dag, hash, sourceId, dense, raw);
    const trainEnvelope = { ...cohort, schema_fingerprint: identity.schema_fingerprint, plan_fingerprint: identity.plan_fingerprint,
      relation_fingerprint: identity.relation_fingerprint, data_content_fingerprint: identity.data_content_fingerprint,
      target_content_fingerprint: identity.target_content_fingerprint, coordinator_relations: { records: trainingIds.map(id => ({
        observation_id: `obs:${id}`, sample_id: id, target_id: `target:${id}`, source_id: sourceId, group_id: null,
        origin_sample_id: null, is_augmented: false,
      })) } };
    const predictEnvelope = JSON.parse(dag.attach_predict_cohort_to_envelope_json(json(trainEnvelope), json({ role: calibration ? 'external_test' : 'inference', target_names: targetNames,
      data_content_fingerprint: cohort.data_content_fingerprint, target_content_fingerprint: calibration ? cohort.target_content_fingerprint : null, relations: cohort.coordinator_relations })));
    const replayRequest = dag.sign_training_replay_request_json(json({ schema_version: 1, request_id: 'replay:workflow',
      source_outcome_fingerprint: pkg.training_outcome.outcome_fingerprint, phase: 'PREDICT', data_envelope_keys: ['model:pls.x'],
      output_binding_ids: [output.binding_id], request_fingerprint: '0'.repeat(64) }));
    const replayJson = dag.replay_training_package_json(packageJson, replayRequest, json({ 'model:pls.x': predictEnvelope }),
      json([nativeController.manifest(dag)]), 'outcome:workflow:predict', 'run:workflow:predict', nativeController.callback);
    const replay = JSON.parse(replayJson);
    return calibration || details ? { replay, replayJson, request: replayRequest, packageJson, relations: cohort.coordinator_relations,
      truth: calibration ? { sample_ids: [...dense.sample_ids], values: dense.y.map(y => [y]),
        target_names: [...raw.target_names], validity_masks: raw.target_mask.values.map(valid => [valid]) } : null, archive } : replay;
  } finally { nativeController.close(); }
}
export async function retrain(model, value, options = {}) {
  if (!(model instanceof Workflow)) throw new TypeError('retrain requires a Workflow');
  const validated = await load(model.archive, options);
  if (nativeProfiles.get(validated) === 'native_n4mm') throw new TypeError('C-native N4MM retraining requires a native CPU host; browser retraining cannot preserve this profile');
  return run(value, { ...validated.config, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) });
}
export function exportWorkflow(model) {
  return { schema: 'nirs4all.workflow.v1', archive: [...model.archive], outcome: structuredClone(model.outcome), config: structuredClone(model.config) };
}
export async function load(value, options = {}) {
  if (options.preprocessing !== undefined && !['raw', 'snv_savgol'].includes(options.preprocessing)) throw new TypeError('preprocessing must be raw or snv_savgol');
  const rawArchive = value instanceof Uint8Array || value instanceof ArrayBuffer;
  const record = typeof value === 'string' ? JSON.parse(value) : value;
  if (!rawArchive && (record?.schema !== 'nirs4all.workflow.v1' || !Array.isArray(record.archive) || !record.archive.length
    || record.archive.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255))) throw new TypeError('Invalid workflow export');
  const archive = rawArchive ? Uint8Array.from(new Uint8Array(value)) : Uint8Array.from(record.archive);
  const loaded = await readPortableArchiveV2(archive), dag = await runtime(options);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const packageJson = decoder.decode(loaded.members[loaded.manifest.replay.portable_predictor_package.member_path]);
  dag.validate_archive_v2_portable_payloads_json(json(loaded.manifest), packageJson,
    json(Object.fromEntries(Object.entries(loaded.members).map(([name, bytes]) => [name, [...bytes]]))));
  const pkg = JSON.parse(packageJson);
  const profile = boundedProfile(pkg);
  const actualOutcome = JSON.parse(decoder.decode(loaded.members[loaded.manifest.replay.training_artifacts.training_outcome.member_path]));
  const binding = Object.values(pkg.template.campaign.data_bindings).flat()[0];
  const actualConfig = { sourceId: binding.source_ids[0], components: pkg.template.campaign.generation.dimensions[0].choices.map(choice => choice.value),
    preprocessing: pkg.template.graph.nodes[0].operator === 'pls'
      ? (Object.hasOwn(pkg.template.graph.nodes[0].params, 'pipeline') ? 'snv_savgol' : 'raw')
      : (pkg.template.graph.nodes[0].operator.steps.length === 1 ? 'raw' : 'snv_savgol'), seed: pkg.template.campaign.root_seed, folds: pkg.effective_plan.fold_set.folds.length, inputSampleIds: pkg.template.campaign.metadata.input_sample_ids };
  if (!Number.isSafeInteger(actualConfig.seed) || actualConfig.seed < 0) throw new TypeError('seed must be a nonnegative safe integer');
  if (!Number.isSafeInteger(actualConfig.folds) || actualConfig.folds < 2) throw new TypeError('folds must be a safe integer of at least two');
  if (!rawArchive && (json(ordered(record.outcome)) !== json(ordered(actualOutcome)) || json(ordered(record.config)) !== json(ordered(actualConfig)))) {
    throw new TypeError('Workflow outcome or configuration differs from its native archive');
  }
  return new Workflow(archive, actualOutcome, actualConfig, profile);
}

export { sourceSchema as workflowSourceSchema, controller as workflowController,
  envelope as workflowEnvelope, hashes as workflowHashes, recipe as workflowRecipe };
