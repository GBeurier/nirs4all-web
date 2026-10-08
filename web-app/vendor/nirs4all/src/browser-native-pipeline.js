// Product orchestration only: IO owns alignment, DAG owns CV/selection/replay,
// Methods owns each estimator and its opaque N4ME state.
import { workflowDependencies, workflowHashes } from './workflow.js';
import { loadArchiveV2Native } from './archive-v2.js';
import { trainingResultView } from './result-view.js';
const json = JSON.stringify;
const requireValue = (value, message) => { if (!value) throw new TypeError(message); };
const models = new WeakMap();
function boundedRecipe(recipe) {
  requireValue(recipe && typeof recipe === 'object' && Object.keys(recipe).sort().join() === 'candidates,steps'
    && Array.isArray(recipe.steps) && recipe.steps.length >= 1 && recipe.steps.length <= 32
    && Array.isArray(recipe.candidates) && recipe.candidates.length >= 1 && recipe.candidates.length <= 32, 'Expected 1..32 native steps/candidates');
  for (const [i, step] of recipe.steps.entries()) {
    requireValue(step && Object.keys(step).every(key => ['method_id', 'role', 'params'].includes(key)) && typeof step.method_id === 'string'
      && step.method_id.trim() && (i === recipe.steps.length - 1 ? ['regressor', 'classifier'] : ['transformer', 'selector']).includes(step.role), 'Invalid native pipeline step');
    requireValue(step.params === undefined || step.params && typeof step.params === 'object' && !Array.isArray(step.params), 'Native params must be a map');
  }
  for (const params of [...recipe.steps.map(step => step.params ?? {}), ...recipe.candidates]) {
    requireValue(params && typeof params === 'object' && !Array.isArray(params)
      && !Object.hasOwn(params, 'method_id') && !Object.hasOwn(params, 'unsafe_flags'), 'Parameter map cannot override method identity/safety');
  }
  return structuredClone(recipe);
}
async function dependencies(options) {
  const [deps, native, adapter] = await Promise.all([workflowDependencies(options), loadArchiveV2Native(),
    options.estimatorAdapter ?? import('dag-ml-wasm/n4m-estimator-controller')]);
  requireValue(typeof native.native_pipeline_fragments_json === 'function' && typeof deps.dag.native_estimator_descriptor_json === 'function', 'Native pipeline requires the matching Core/DAG browser cohort');
  return {...deps, native, Controller: adapter.N4mWasmEstimatorControllers};
}
// Match IO's CPU DatasetPackage storage at the host boundary. Methods still
// receives/owns its native matrix arithmetic; this is a dtype conversion only.
function matrixStorage(dense) {
  if (dense.task_type === 'classification' && dense.y) requireValue(dense.y.flat().every(label => Number.isSafeInteger(label) && Math.fround(label) === label), 'Classification IDs must be exactly representable integers before storage conversion');
  const f32 = value => { const number = Math.fround(value); requireValue(Number.isFinite(number), 'Native dataset value exceeds finite float32 storage'); return number; };
  return {...dense, X:dense.X.map(row => row.map(f32)), y:dense.y?.map(row => row.map(f32)) ?? null};
}
function registration(deps, dense, sourceId, targetNames) {
  const positions = new Map(dense.sample_ids.map((id, i) => [id, i]));
  const select = ids => ids.map(id => { const index = positions.get(id); requireValue(index !== undefined, 'Unknown native task sample'); return index; });
  const matrix = values => ({data: Float64Array.from(values.flat()), rows: values.length, cols: values[0].length});
  return new deps.Controller({methods: deps.methods, dagMl: deps.dag, digest: deps.digest, targetNames,
    resolveFeatures: ({view}) => {
      requireValue(view.source_ids.length === 1 && view.source_ids[0] === sourceId, 'Native source mismatch');
      return {sampleIds: [...view.sample_ids], matrix: matrix(select(view.sample_ids).map(index => dense.X[index]))};
    },
    resolveTargets: ({sampleIds}) => { requireValue(dense.y, 'Target-free replay cannot request fitting labels');
      return {sampleIds: [...sampleIds], matrix: matrix(select(sampleIds).map(index => dense.y[index]))}; },
  });
}
function envelope(deps, dense, raw, sourceId, sourceSchema) {
  const hash = workflowHashes(deps.digest);
  const plan = {id:'io:native-pipeline', output_representation:'tabular_numeric', issues:[], steps:[{
    kind:'materialize', source_id:sourceId, adapter_id:null, input_representation:null, output_representation:'tabular_numeric',
    fit_scope:'stateless', requires_user_choice:false, metadata:{output:'port:X'}}]};
  const relations = {records:dense.sample_ids.map((id, i) => ({observation_id:`obs:${id}`, sample_id:id, target_id:dense.y ? `target:${id}` : null,
    source_id:sourceId, group_id:dense.groups?.[i] != null ? String(dense.groups[i]) : null, origin_sample_id:dense.origin_ids?.[i] !== id ? dense.origin_ids?.[i] ?? null : null, is_augmented:false}))};
  return {schema_version:1, schema_fingerprint:hash(sourceSchema), plan_fingerprint:hash(plan),
    relation_fingerprint:deps.dag.sample_relation_set_fingerprint_json(json(relations)), plan, coordinator_relations:relations,
    data_content_fingerprint:hash(dense.X), target_content_fingerprint:dense.y ? hash(dense.y) : null, metadata:{}};
}
function foldSet(deps, dense, options) {
  const dependent = dense.groups !== null || dense.origin_ids.some((origin, i) => origin !== dense.sample_ids[i]);
  const declared = dense.fold_ids.some(id => id !== null);
  requireValue(!dependent || declared, 'Grouped/dependent samples require declared leakage-safe fold IDs');
  if (!declared) return JSON.parse(deps.dag.kfold_split_json(json({n_splits:options.folds ?? 2, shuffle:false, seed:options.seed ?? 91}), json(dense.sample_ids), 'native:folds'));
  requireValue(dense.fold_ids.every(id => id !== null), 'Every training row requires a declared fold ID');
  const unique = [...new Set(dense.fold_ids)];
  requireValue(unique.length >= 2, 'At least two declared folds required');
  return {id:'native:declared-folds', sample_ids:dense.sample_ids,
    sample_groups:dependent ? Object.fromEntries(dense.sample_ids.map((id, i) => [id, String(dense.groups?.[i] ?? dense.origin_ids[i])])) : {},
    folds:unique.map((fold, i) => ({fold_id:`native.fold.${i}`, train_sample_ids:dense.sample_ids.filter((_, j) => dense.fold_ids[j] !== fold),
      validation_sample_ids:dense.sample_ids.filter((_, j) => dense.fold_ids[j] === fold), metadata:{}}))};
}
/** Generic catalog-resolved native CV/OOF/refit, executed entirely in WASM. */
export async function runBrowserPipeline(value, options = {}) {
  const recipe = boundedRecipe(options.pipeline), sourceId = options.sourceId ?? 'spectra', seed = options.seed ?? 91;
  requireValue(Number.isSafeInteger(seed) && seed >= 0 && Number.isSafeInteger(options.folds ?? 2) && (options.folds ?? 2) >= 2, 'Safe nonnegative seed and at least two folds required');
  const deps = await dependencies(options), ds = deps.io.dataset(value), record = ds.toJSON(), dense = matrixStorage(ds.toMatrixRegression(sourceId)), raw = record.dataset;
  requireValue(!dense.independent_unit_ids && !dense.repetition_ids, 'This browser profile requires sample/group identity, without repetition or independent-unit overrides');
  requireValue(dense.y && dense.partitions.every(partition => partition === 'train'), 'Native training requires observed targets and train rows');
  const classification = recipe.steps.at(-1).role === 'classifier';
  requireValue((dense.task_type === 'classification') === classification, 'Native recipe role differs from the IO target task');
  requireValue(!classification || dense.target_names.length === 1 && dense.y.flat().every(label => Number.isSafeInteger(label) && Math.fround(label) === label), 'Classification requires one exactly representable integer target');
  const sourceSchema = deps.io.publicSourceSchema(record, sourceId), env = envelope(deps, dense, raw, sourceId, sourceSchema);
  const firstId = recipe.steps.length === 1 ? 'model:pls' : 'transform:0';
  const binding = {node_id:firstId, input_name:'x', request_id:env.plan.id, schema_fingerprint:env.schema_fingerprint, plan_fingerprint:env.plan_fingerprint,
    relation_fingerprint:env.relation_fingerprint, output_representation:'tabular_numeric', feature_set_id:'x', source_ids:[sourceId], require_relations:true,
    view_policy:{fit_partition:'fold_train', predict_partition:'fold_validation', include_augmented_train:false, include_augmented_validation:false, include_excluded:false, require_sample_ids:true}, metadata:{}};
  const controller = registration(deps, dense, sourceId, dense.target_names);
  try {
    const policy = {split_unit:dense.groups !== null ? 'group' : 'sample', forbid_origin_cross_fold:true, allow_observation_split_with_shared_target:false,
      require_group_ids:dense.groups !== null, unsafe_flags:[]};
    const steps = recipe.steps.map((step, i) => ({kind:i === recipe.steps.length - 1 ? 'model' : 'transform', id:i === recipe.steps.length - 1 ? 'model:pls' : `transform:${i}`,
      operator:`n4m:${step.method_id}`, params:{...(step.params ?? {}), method_id:step.method_id}}));
    const compiled = JSON.parse(deps.dag.compile_pipeline_dsl_artifact_with_controllers_json(json({id:'dsl:native-pipeline', input:{name:'x', representation:'tabular_numeric'},
      campaign_id:'campaign:native-pipeline', root_seed:seed, leakage_policy:policy, data_bindings:[binding],
      split_invocation:{id:'native:split', controller_id:null, leakage_policy:policy, params:{}, fold_set:foldSet(deps, dense, options)}, steps}), json(controller.manifests)));
    // Resolve every role and every parameter candidate before any fit callback.
    for (let i = 0; i < recipe.steps.length; ++i) {
      const step = recipe.steps[i], owner = `controller:n4m.${step.role}`, node = {controller_id:owner, operator_ref:`n4m:${step.method_id}`, params:{method_id:step.method_id, ...(step.params ?? {})}};
      controller.planned(node);
      if (i === recipe.steps.length - 1) for (const params of recipe.candidates) controller.planned({...node, params:{...node.params, ...params}});
    }
    compiled.campaign_template.metadata = {...compiled.campaign_template.metadata, native_pipeline_recipe:recipe, raw_source_schema:sourceSchema,
      native_training_relations:env.coordinator_relations, input_sample_ids:[...dense.sample_ids]};
    compiled.campaign_template.generation = {strategy:'cartesian', max_variants:recipe.candidates.length, dimensions:[{name:'native_model_params', choices:recipe.candidates.map((params, i) => ({
      label:`candidate_${i}`, value:i, param_overrides:Object.keys(params).length ? [{node_id:'model:pls', params}] : [], active_subsequence:null}))}]};
    const request = {schema_version:1, request_id:'training:native-pipeline', plan_id:'plan:native-pipeline', graph:compiled.graph, campaign:compiled.campaign_template,
      controller_manifests:controller.manifests, data_identities:[JSON.parse(deps.dag.training_data_identity_json(json(binding), json(env)))], parameter_patches:[], patch_policies:[],
      influence_requirements:[], training_losses:[], request_fingerprint:'0'.repeat(64), options:{refit:true, refit_strategy:'refit_one', seed,
        selection:{id:'selection:native-pipeline', metric:{name:classification ? 'balanced_accuracy' : 'rmse', objective:classification ? 'maximize' : 'minimize'}, required_metric_level:'sample', require_finite:true, evaluation_scope:'oof'},
        selection_output_id:'output:prediction', outputs:[{output_id:'output:prediction', node_id:'model:pls', port_name:'oof', prediction_level:'sample', unit_level:'physical_sample',
          prediction_kind:classification ? 'class_label' : 'regression_point', target_names:dense.target_names, target_units:dense.target_names.map(() => null), class_labels:dense.target_names.map(() => []), output_order:'target_order', target_space:'raw'}],
        scheduler:{kind:'sequential', backend:null, workers:1}, resources:{cpu_threads:1, memory_bytes:null, gpu_devices:[], wall_time_ms:null},
        artifacts:{cv_artifacts:'discard', prediction_caches:'retain', fitted_artifacts:'portable_required'}}};
    const runId = options.runId ?? `run:browser-native:${globalThis.crypto.randomUUID()}`;
    const capture = JSON.parse(deps.dag.execute_training_json(deps.dag.sign_training_request_json(json(request)), json({[`${firstId}.x`]:env}), json(env.coordinator_relations),
      `package:${runId}`, `outcome:${runId}`, runId, `bundle:${runId}`, controller.callback));
    // Native fragments are deliberately embedded unchanged, including uint64 seeds.
    const text = `{"schema":"nirs4all.native-pipeline.v1","schema_version":1,"config":${json({source_id:sourceId, pipeline:recipe})},"training_outcome":${capture.training_outcome_json},"package":${capture.portable_predictor_package_json}}`;
    return loadBrowserPipeline(text, options);
  } finally { controller.close(); }
}
export class BrowserNativePipeline {
  constructor(token, text, fragments) {
    requireValue(token === models, 'Use runBrowserPipeline/loadBrowserPipeline');
    models.set(this, {text, fragments});
  }
  get config() { return JSON.parse(models.get(this).fragments.config_json); }
  get outcome() { return JSON.parse(models.get(this).fragments.training_outcome_json); }
  export() { return models.get(this).text; }
  predict(value, options = {}) { return predictBrowserPipeline(this, value, options); }
  retrain(value, options = {}) { return runBrowserPipeline(value, {...options, sourceId:this.config.source_id, pipeline:this.config.pipeline}); }
  compare(query = {}) { return trainingResultView(this.outcome, this.outcome.effective_plan.fold_set.sample_ids).compare(query); }
}
/** Load CPU/browser N4ME state without fitting; exact JSON text is required. */
export async function loadBrowserPipeline(text, options = {}) {
  requireValue(typeof text === 'string', 'Native pipeline loading requires exact JSON text to preserve uint64 values');
  const native = await loadArchiveV2Native(), fragments = JSON.parse(native.native_pipeline_fragments_json(text));
  const config = JSON.parse(fragments.config_json); boundedRecipe(config.pipeline);
  return new BrowserNativePipeline(models, text, fragments);
}
export async function predictBrowserPipeline(model, value, options = {}) {
  requireValue(models.has(model), 'Expected a BrowserNativePipeline');
  const deps = await dependencies(options), {fragments} = models.get(model), pkg = JSON.parse(fragments.package_json), config = JSON.parse(fragments.config_json);
  const ds = deps.io.dataset(value), record = ds.toJSON(), dense = matrixStorage(ds.toMatrixRegression(config.source_id)), raw = record.dataset;
  requireValue(dense.y === null && dense.partitions.every(partition => partition === 'predict'), 'Prediction requires target-free predict rows');
  const sourceSchema = deps.io.publicSourceSchema(record, config.source_id);
  if (pkg.template.campaign.metadata.raw_source_schema) requireValue(workflowHashes(deps.digest)(sourceSchema) === workflowHashes(deps.digest)(pkg.template.campaign.metadata.raw_source_schema), 'Prediction source schema differs from training');
  const env = envelope(deps, dense, raw, config.source_id, sourceSchema), identity = pkg.data_identities[0], binding = Object.values(pkg.template.campaign.data_bindings).flat()[0];
  const savedRelations = pkg.template.campaign.metadata.native_training_relations ?? {records:pkg.effective_plan.fold_set.sample_ids.map(id => ({
    observation_id:`obs:${id}`, sample_id:id, target_id:`target:${id}`, source_id:config.source_id, group_id:pkg.effective_plan.fold_set.sample_groups[id] ?? null, origin_sample_id:null, is_augmented:false}))};
  const trainingEnvelope = {...env, schema_fingerprint:identity.schema_fingerprint, plan_fingerprint:identity.plan_fingerprint, relation_fingerprint:identity.relation_fingerprint,
    data_content_fingerprint:identity.data_content_fingerprint, target_content_fingerprint:identity.target_content_fingerprint, coordinator_relations:savedRelations};
  const predictEnvelope = JSON.parse(deps.dag.attach_predict_cohort_to_envelope_json(json(trainingEnvelope), json({role:'inference', target_names:pkg.output_bindings[0].target_names,
    data_content_fingerprint:env.data_content_fingerprint, target_content_fingerprint:null, relations:env.coordinator_relations})));
  const key = `${binding.node_id}.${binding.input_name}`, controller = registration(deps, dense, config.source_id, pkg.output_bindings[0].target_names);
  try {
    const request = deps.dag.sign_training_replay_request_json(json({schema_version:1, request_id:'predict:browser-native', source_outcome_fingerprint:pkg.training_outcome.outcome_fingerprint,
      phase:'PREDICT', data_envelope_keys:[key], output_binding_ids:pkg.output_bindings.map(output => output.binding_id), request_fingerprint:'0'.repeat(64)}));
    return JSON.parse(deps.dag.replay_training_package_json(fragments.package_json, request, json({[key]:predictEnvelope}), json(controller.manifests),
      'outcome:browser-native:predict', 'run:browser-native:predict', controller.callback));
  } finally { controller.close(); }
}
