// Options and buffers are adapted here; native DAG owns search, CV, selection and replay.
import { workflowDependencies, workflowHashes, workflowSourceSchema, workflowController,
  workflowEnvelope, workflowRecipe } from './workflow.js';
import { loadArchiveV2Native } from './archive-v2.js';

const json = JSON.stringify;
const clone = value => structuredClone(value);
const direction = metric => metric === 'r2' ? 'maximize' : 'minimize';
const space = { n_components: { kind: 'int', low: 1, high: 3 }, scale: { kind: 'categorical', type: 'boolean', choices: [false, true] } };
const policy = { split_unit: 'sample', forbid_origin_cross_fold: true,
  allow_observation_split_with_shared_target: false, require_group_ids: false, unsafe_flags: [] };

async function publicController(deps, targetNames, sourceId, dense) {
  const native = await loadArchiveV2Native();
  if (typeof native.pls_role_pipeline_contract_json !== 'function') throw new Error('Native public PLS recipe bridge is unavailable');
  const controller = workflowController(deps, { 'model:pls': workflowRecipe }, targetNames, sourceId, dense);
  const invoke = controller.callback;
  controller.callback = (id, text, seed) => {
    const task = JSON.parse(text);
    if (task.node_plan) {
      const params = { ...task.node_plan.params, native_profile: 'n4m.pls_role_pipeline.v1',
        pipeline: { schema_version: 1, pipeline_type: 'n4m.snv_savgol_smooth.v1', savgol_window: 5, savgol_poly_degree: 2 } };
      const contract = JSON.parse(native.pls_role_pipeline_contract_json(json(params)));
      // Preserve the signed scientific parameter fingerprint. Only transport
      // the native owner's resolved method names/controls to the Methods binding.
      controller.operators[task.node_plan.node_id] = contract.operator;
      task.node_plan.params = {};
    }
    return invoke(id, json(task), seed);
  };
  return controller;
}

function persistence(options) {
  if (typeof options.persist === 'function') return options.persist;
  if (options.storageKey && typeof localStorage !== 'undefined') return snapshot => localStorage.setItem(options.storageKey, json(snapshot));
  throw new TypeError('Browser tuning requires persist(snapshot) or a localStorage storageKey for durable native checkpoints');
}

function compile(deps, dense, raw, sourceId, seed, manifest, env, params, withFolds) {
  const binding = { node_id: 'model:pls', input_name: 'x', request_id: env.plan.id,
    schema_fingerprint: env.schema_fingerprint, plan_fingerprint: env.plan_fingerprint,
    relation_fingerprint: env.relation_fingerprint, output_representation: 'tabular_numeric',
    feature_set_id: 'x', source_ids: [sourceId], require_relations: true,
    view_policy: { fit_partition: 'fold_train', predict_partition: 'fold_validation', include_augmented_train: false,
      include_augmented_validation: false, include_excluded: false, require_sample_ids: true }, metadata: {} };
  const dsl = { id: 'dsl:public-tuning', input: { name: 'x', representation: 'tabular_numeric' },
    campaign_id: 'campaign:public-tuning', root_seed: seed, leakage_policy: policy, data_bindings: [binding],
    steps: [{ kind: 'model', id: 'model:pls', operator: workflowRecipe, params }] };
  if (withFolds) dsl.split_invocation = { id: 'split:public-tuning', controller_id: null,
    leakage_policy: policy, params: {}, fold_set: JSON.parse(deps.dag.kfold_split_json(
      json({ n_splits: 2, shuffle: false, seed }), json(dense.sample_ids), 'folds:public-tuning')) };
  const compiled = JSON.parse(deps.dag.compile_pipeline_dsl_artifact_with_controllers_json(json(dsl), json([manifest])));
  compiled.graph.metadata = { ...compiled.graph.metadata, target_names: raw.target_names };
  compiled.campaign_template.metadata = { ...compiled.campaign_template.metadata,
    raw_source_schema: workflowSourceSchema(raw.sources.find(source => source.name === sourceId)) };
  return deps.dag.build_execution_plan_json('plan:public-tuning', json(compiled.graph), json(compiled.campaign_template), json([manifest]));
}

function validateTraining(ds, sourceId) {
  const record = ds.toJSON(), raw = record.dataset, dense = ds.toDenseRegression(sourceId);
  if (raw.partitions.values.some(partition => partition !== 'train') || raw.y.shape.length !== 1 || dense.y.some(y => !Number.isFinite(y))) {
    throw new TypeError('Tuning requires one finite numeric target and train rows');
  }
  if (raw.groups !== null || raw.independent_unit_ids || raw.repetition_ids || record.fold_ids.some(id => id !== null)
    || new Set(record.origin_ids).size !== record.origin_ids.length || record.origin_ids.some((id, i) => id !== dense.sample_ids[i])) {
    throw new TypeError('This bounded tuning profile requires independent samples without groups or declared folds');
  }
  return { dense, raw };
}

/** Browser-native Methods optimizer and native DAG CV with paired durable checkpoints. */
export async function tuneBrowser(data, options = {}) {
  const deps = await workflowDependencies(options), { dag, io, methods } = deps;
  const { N4mWasmHostOptimizer } = await import('dag-ml-wasm/n4m-optimizer');
  const trials = options.trials ?? 8, seed = options.seed ?? 91, sampler = options.sampler ?? 'random', metric = options.metric ?? 'rmse';
  if (!Number.isInteger(trials) || trials < 1 || trials > 256) throw new RangeError('trials must be a total budget between 1 and 256');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a nonnegative safe integer');
  if (options.folds !== undefined && options.folds !== 2) throw new TypeError('This bounded tuning profile uses two native CV folds');
  if (!['random', 'tpe', 'sobol', 'lhs'].includes(sampler) || !['rmse', 'mae', 'r2'].includes(metric)) throw new TypeError('Unsupported native sampler or regression metric');
  const persist = persistence(options), hash = workflowHashes(deps.digest), sourceId = options.sourceId ?? 'spectra';
  const { dense, raw } = validateTraining(io.dataset(data), sourceId), env = workflowEnvelope(dag, hash, sourceId, dense, raw);
  const nativeController = await publicController(deps, raw.target_names, sourceId, dense);
  let optimizer;
  try {
    const manifest = nativeController.manifest(dag), plan = compile(deps, dense, raw, sourceId, seed, manifest, env,
      { n_components: 1, scale: false }, true);
    const request = { target_node: 'model:pls', trial_budget: trials, metric, direction: direction(metric),
      optimizer_descriptor: { owner: 'methods-js-wasm', profile: 'n4m.pls_role_pipeline.v1', space, sampler, seed } };
    const objective = { target_node: request.target_node, metric, direction: request.direction,
      graph_fingerprint: JSON.parse(plan).graph_fingerprint, source_schema: workflowSourceSchema(raw.sources.find(source => source.name === sourceId)) };
    let snapshot;
    optimizer = new N4mWasmHostOptimizer({ Optimizer: methods.Optimizer, dagMl: dag, space,
      options: { sampler, pruner: 'none', direction: request.direction, metric, seed, startupTrials: 2 }, objective,
      state: options.checkpoint instanceof BrowserTuningResult ? options.checkpoint.snapshot : options.checkpoint ?? null,
      persist: value => {
        const result = persist(clone(value));
        snapshot = clone(value);
        // Preserve the return value so the native owner's synchronous barrier
        // rejects Promises and thenables before it permits another FIT.
        return result;
      } });
    const search = JSON.parse(dag.host_hpo_search_json(plan, json([manifest]), json(env), json(request),
      optimizer.committed === null ? undefined : json(optimizer.committed), nativeController.callback, optimizer.callback));
    if (!search.selected_params || search.status !== 'completed') throw new Error(`Native tuning did not complete: ${search.status}`);
    const selectedPlan = compile(deps, dense, raw, sourceId, seed, manifest, env, search.selected_params, false);
    const runId = options.runId ?? `run:browser:tuning:${Date.now()}`;
    const refit = JSON.parse(dag.execute_initial_full_refit_json(selectedPlan, json([manifest]), json(env),
      json(dense.sample_ids), `package:${runId}`, runId, String(seed), nativeController.callback));
    return new BrowserTuningResult(refit.initial_full_refit_package_json, search, snapshot,
      { trials, seed, sampler, metric, sourceId }, { plan, envelope: env, request, manifest, objective });
  } finally { optimizer?.close(); nativeController.close(); }
}

/** Native initial full-refit package plus the paired host-HPO/N4MOPT checkpoint. */
export class BrowserTuningResult {
  constructor(packageJson, search, snapshot, config, contracts) {
    this.packageJson = packageJson; this.search = clone(search); this.snapshot = clone(snapshot);
    this.config = clone(config); this.contracts = clone(contracts);
  }
  trials() { return clone(this.search.trials); }
  compare({ trialIndex, partition, foldId, level } = {}) {
    if (trialIndex !== undefined && !this.search.trials.some(trial => trial.trial_index === trialIndex)) throw new Error('Unknown native trial');
    return clone(this.search.trials.filter(trial => trialIndex === undefined || trial.trial_index === trialIndex)
      .flatMap(trial => trial.scores.reports.filter(report =>
        (partition === undefined || report.partition === partition) && (foldId === undefined || report.fold_id === foldId)
        && (level === undefined || report.level === level)).map(report => ({ ...report, trial_index: trial.trial_index }))));
  }
  summary() { return { selectedTrialIndex: this.search.selected_trial_index, selectedParams: clone(this.search.selected_params),
    trialCount: this.search.trials.length, metric: this.config.metric, sampler: this.config.sampler, packageKind: 'dagml.initial-full-refit.v1' }; }
  resume(data, options = {}) { return tuneBrowser(data, { ...this.config, ...options, checkpoint: this }); }
  async export(options = {}) {
    const deps = await workflowDependencies(options);
    return { schema: 'nirs4all.browser-tuning.v1', packageKind: 'dagml.initial-full-refit.v1',
      packageJson: this.packageJson, packageSha256: deps.digest(new TextEncoder().encode(this.packageJson)),
      snapshot: clone(this.snapshot), search: clone(this.search), config: clone(this.config), contracts: clone(this.contracts) };
  }
  async predict(data, options = {}) {
    const deps = await workflowDependencies(options), { dag, io } = deps, hash = workflowHashes(deps.digest);
    dag.validate_initial_full_refit_package_json(this.packageJson);
    const pkg = JSON.parse(this.packageJson), raw = io.dataset(data).toJSON().dataset, sourceId = this.config.sourceId;
    if (raw.y !== null || raw.partitions.values.some(partition => partition !== 'predict')) throw new TypeError('Prediction requires target-free predict rows');
    const source = raw.sources.find(value => value.name === sourceId);
    if (!source || source.array.shape.length !== 2 || source.presence_mask.values.some(present => !present)
      || hash(workflowSourceSchema(source)) !== pkg.training_envelope.schema_fingerprint) throw new TypeError('Prediction source schema differs from training');
    const dense = { X: source.array.values, sample_ids: raw.sample_ids, y: null };
    const targetNames = pkg.effective_plan.graph_plan.graph.metadata.target_names;
    const nativeController = await publicController(deps, targetNames, sourceId, dense);
    try {
      const current = workflowEnvelope(dag, hash, sourceId, dense, raw);
      const envelope = dag.initial_full_refit_predict_envelope_json(this.packageJson, json({ role: 'inference',
        target_names: targetNames,
        data_content_fingerprint: current.data_content_fingerprint, target_content_fingerprint: null, relations: current.coordinator_relations }));
      return JSON.parse(dag.replay_initial_full_refit_json(this.packageJson, envelope,
        json(pkg.outputs.map(output => output.output_id)), '{}', options.runId ?? `run:browser:tuning:predict:${Date.now()}`, nativeController.callback));
    } finally { nativeController.close(); }
  }
}

/** Validate both native package bytes and the exact optimizer/checkpoint binding before use. */
export async function loadBrowserTuning(record, options = {}) {
  if (record?.schema !== 'nirs4all.browser-tuning.v1' || record.packageKind !== 'dagml.initial-full-refit.v1') throw new TypeError('Invalid browser tuning export');
  if (!Number.isSafeInteger(record.config?.seed) || record.config.seed < 0) {
    throw new RangeError('Browser tuning seed exceeds the supported exact integer range 0..2^53-1');
  }
  const deps = await workflowDependencies(options), { dag, methods } = deps;
  if (record.packageSha256 !== deps.digest(new TextEncoder().encode(record.packageJson))) throw new Error('Browser tuning package hash mismatch');
  dag.validate_initial_full_refit_package_json(record.packageJson);
  const { N4mWasmHostOptimizer } = await import('dag-ml-wasm/n4m-optimizer');
  const c = record.config, contracts = record.contracts;
  const pkg = JSON.parse(record.packageJson), graph = pkg.effective_plan.graph_plan.graph;
  const equal = (left, right) => workflowHashes(deps.digest)(left) === workflowHashes(deps.digest)(right);
  if (graph.nodes.length !== 1 || graph.nodes[0].id !== 'model:pls' || !equal(graph.nodes[0].operator, workflowRecipe)
    || pkg.execution_root_seed !== c.seed || contracts.request.trial_budget !== c.trials
    || contracts.request.metric !== c.metric || contracts.request.direction !== direction(c.metric)
    || contracts.request.optimizer_descriptor.seed !== c.seed || contracts.request.optimizer_descriptor.sampler !== c.sampler
    || contracts.objective.source_schema.source_id !== c.sourceId
    || record.snapshot.committed.trials.length !== c.trials) throw new Error('Browser tuning options differ from native study contracts');
  const controller = await publicController(deps, graph.metadata.target_names, c.sourceId,
    { X: [], sample_ids: [], y: null });
  try {
    if (!equal(controller.manifest(dag), contracts.manifest)) throw new Error('Browser tuning controller differs from the official native manifest');
  } finally { controller.close(); }
  const optimizer = new N4mWasmHostOptimizer({ Optimizer: methods.Optimizer, dagMl: dag, space,
    options: { sampler: c.sampler, pruner: 'none', direction: direction(c.metric), metric: c.metric, seed: c.seed, startupTrials: 2 },
    objective: contracts.objective, state: record.snapshot, persist: () => {} });
  try {
    const verified = JSON.parse(dag.host_hpo_search_json(contracts.plan, json([contracts.manifest]), json(contracts.envelope),
      json({ ...contracts.request, trial_budget: record.snapshot.committed.trials.length }), json(optimizer.committed),
      () => { throw new Error('Cold tuning validation cannot fit'); }, optimizer.callback));
    const params = pkg.effective_plan.graph_plan.graph.nodes[0].params;
    if (json(verified.selected_params) !== json(record.search.selected_params)
      || params.n_components !== verified.selected_params.n_components || params.scale !== verified.selected_params.scale
      || pkg.training_envelope.data_content_fingerprint !== contracts.envelope.data_content_fingerprint
      || pkg.training_envelope.target_content_fingerprint !== contracts.envelope.target_content_fingerprint
      || pkg.training_envelope.schema_fingerprint !== contracts.envelope.schema_fingerprint) throw new Error('Browser tuning model differs from its native selected study');
    return new BrowserTuningResult(record.packageJson, verified, optimizer.snapshot(), c, contracts);
  } finally { optimizer.close(); }
}
