// Core transports; DAG-ML owns calibration, interval calculations and lineage.
import { Workflow, workflowDependencies, workflowReplay, workflowHashes, workflowEnvelope } from './workflow.js';
import { loadArchiveV2Native, readPortableArchiveV2, replayMethodsArchiveV2, writePortableArchiveV2 } from './archive-v2.js';
import { independentPhysicalDataset } from './uncertainty-cohort.js';

const json = JSON.stringify;
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;

export class CalibratedWorkflow {
  constructor(archive, calibration) {
    this.archive = new Uint8Array(archive);
    this.calibration = structuredClone(calibration);
  }
  predict(value, options = {}) { return predictCalibrated(this, value, options); }
  export() { return new Uint8Array(this.archive); }
}

export function exportCalibrated(model) {
  if (!(model instanceof CalibratedWorkflow)) throw new TypeError('A calibrated workflow is required');
  return model.export();
}

export async function calibrate(model, value, options = {}) {
  const source = model instanceof Workflow ? model.archive : model;
  const deps = await workflowDependencies(options);
  const record = independentPhysicalDataset(deps.io, value);
  const inventory = await readPortableArchiveV2(source);
  const packageJson = text(inventory.members[inventory.manifest.replay.portable_predictor_package.member_path]);
  const pkg = JSON.parse(packageJson);
  const details = Object.values(pkg.effective_plan.node_plans).some(node => node.controller_id === 'controller:methods.pls')
    ? await nativeMethodsCalibrationReplay(source, record, pkg, packageJson, inventory, deps)
    : await workflowReplay(source, record, options, true);
  const original = details.archive;
  const native = await loadArchiveV2Native();
  const outcome = text(original.members[original.manifest.replay.training_artifacts.training_outcome.member_path]);
  const capture = JSON.parse(native.calibrate_workflow_replay_json(outcome, details.replayJson,
    json(details.relations), json(details.truth), json(options.coverages ?? [0.9]), json(options.smallSamplePolicy ?? 'error')));
  const { dag } = await workflowDependencies(options);
  const payloads = JSON.parse(dag.build_archive_v2_native_portable_payloads_json(
    'archive:public:calibrated', capture.training_outcome_json, capture.portable_predictor_package_json));
  const archive = await writePortableArchiveV2(payloads.manifest,
    Object.fromEntries(Object.entries(payloads.members).map(([key, bytes]) => [key, Uint8Array.from(bytes)])));
  return new CalibratedWorkflow(archive, capture.calibration);
}

export async function predictCalibrated(model, value, options = {}) {
  const deps = await workflowDependencies(options);
  const record = independentPhysicalDataset(deps.io, value);
  const bytes = model instanceof CalibratedWorkflow ? model.archive : model;
  const archive = await readPortableArchiveV2(bytes);
  const storedPackage = text(archive.members[archive.manifest.replay.portable_predictor_package.member_path]);
  const pkg = JSON.parse(storedPackage);
  if (Object.values(pkg.effective_plan.node_plans).some(node => node.controller_id === 'controller:methods.pls')) {
    const { io } = deps;
    const raw = record.dataset;
    if (raw.y !== null || raw.partitions.values.some(role => role !== 'predict')) throw new TypeError('Prediction requires target-free predict rows');
    const sourceId = Object.values(pkg.template.campaign.data_bindings).flat()[0].source_ids[0];
    const expected = pkg.template.campaign.metadata.raw_source_schema;
    if (!expected || json(ordered(io.publicSourceSchema(record, sourceId))) !== json(ordered(expected))) throw new TypeError('Prediction source schema differs from frozen predictor');
    const source = raw.sources.find(source => source.name === sourceId);
    if (source.array.shape.length !== 2 || source.presence_mask.values.some(present => !present)) throw new TypeError('Calibrated inference requires a complete numeric source');
    const replay = await replayMethodsArchiveV2(bytes, { X: source.array.values,
      rows: raw.sample_ids.length, cols: source.array.shape[1], sampleIds: raw.sample_ids }, { methods: deps.methods });
    const values = Array.from({ length: replay.rows }, (_, i) => replay.data.slice(i * replay.cols, (i + 1) * replay.cols));
    const native = await loadArchiveV2Native();
    const nativeJson = native.calibrated_methods_points_json(storedPackage, archive.archiveSha256,
      json(replay.sampleIds), json(values), json(replay.nativePredictorDescriptor));
    const result = JSON.parse(nativeJson);
    Object.defineProperty(result, 'native_json', { value: nativeJson });
    return result;
  }
  const details = await workflowReplay(bytes, record, options, false, true);
  const packageJson = details.packageJson;

  const native = await loadArchiveV2Native();
  return JSON.parse(native.calibrated_prediction_json(packageJson, details.request, details.replayJson));
}

export async function conformalMetrics(model, prediction, truth) {
  if (!(model instanceof CalibratedWorkflow)) throw new TypeError('A calibrated workflow is required');
  const native = await loadArchiveV2Native();
  const archive = await readPortableArchiveV2(model.archive);
  const packageJson = text(archive.members[archive.manifest.replay.portable_predictor_package.member_path]);
  return JSON.parse(native.conformal_metrics_json(packageJson, json(prediction.interval_block), json(truth)));
}

export async function loadCalibrated(bytes, options = {}) {
  const archive = await readPortableArchiveV2(bytes), { dag } = await workflowDependencies(options);
  const packageJson = text(archive.members[archive.manifest.replay.portable_predictor_package.member_path]);
  dag.validate_archive_v2_portable_payloads_json(json(archive.manifest), packageJson,
    json(Object.fromEntries(Object.entries(archive.members).map(([key, value]) => [key, [...value]]))));
  const calibration = JSON.parse(packageJson).conformal_calibration;
  if (!calibration) throw new TypeError('Native archive has no calibration');
  return new CalibratedWorkflow(bytes, calibration);
}

// An invocation-local frozen controller transports actual N4MM outputs to DAG.
// The model is inspected and executed by Methods before scheduler dispatch;
// the callback can only select those exact identity-bound rows, never FIT.
async function nativeMethodsCalibrationReplay(bytes, record, pkg, packageJson, archive, deps) {
  const { dag, io } = deps, raw = record.dataset;
  if (pkg.output_bindings.length !== 1 || pkg.execution_bundle.refit_artifacts.length !== 1
      || pkg.execution_bundle.data_requirements.length !== 1) throw new TypeError('Calibration requires one native predictor and source');
  if (raw.y === null || raw.y.shape.length !== 1 || raw.y.values.some(value => !Number.isFinite(value))) throw new TypeError('Calibration requires one finite observed target');
  const binding = pkg.output_bindings[0], artifact = pkg.execution_bundle.refit_artifacts[0];
  const sourceId = Object.values(pkg.template.campaign.data_bindings).flat()[0].source_ids[0];
  const expected = pkg.template.campaign.metadata.raw_source_schema;
  if (!expected || json(ordered(io.publicSourceSchema(record, sourceId))) !== json(ordered(expected))) throw new TypeError('Calibration source schema differs from frozen predictor');
  const source = raw.sources.find(value => value.name === sourceId);
  if (!source || source.array.shape.length !== 2 || source.presence_mask.values.some(present => !present)) throw new TypeError('Calibration requires a complete numeric source');
  const native = await replayMethodsArchiveV2(bytes, { X: source.array.values, rows: raw.sample_ids.length,
    cols: source.array.shape[1], sampleIds: raw.sample_ids }, { methods: deps.methods });
  if (json(ordered(native.nativePredictorDescriptor)) !== json(ordered(artifact.artifact.native_predictor_descriptor))) throw new TypeError('Inspected calibration predictor differs from signed artifact');
  const dense = { X: source.array.values, sample_ids: raw.sample_ids, y: raw.y.values };
  const current = workflowEnvelope(dag, workflowHashes(deps.digest), sourceId, dense, raw);
  const requirement = pkg.execution_bundle.data_requirements[0];
  const key = `${requirement.node_id}.${requirement.input_name}`;
  const envelope = { schema_version: 1, schema_fingerprint: requirement.schema_fingerprint,
    plan_fingerprint: requirement.plan_fingerprint, relation_fingerprint: requirement.relation_fingerprint,
    data_content_fingerprint: pkg.data_identities[0].data_content_fingerprint,
    target_content_fingerprint: pkg.data_identities[0].target_content_fingerprint,
    coordinator_relations: { records: pkg.effective_plan.fold_set.sample_ids.map(id => ({
      observation_id: id, sample_id: id, target_id: null, source_id: sourceId,
      group_id: null, origin_sample_id: null, is_augmented: false })) }, predict_cohort: null };
  const predictEnvelope = JSON.parse(dag.attach_predict_cohort_to_envelope_json(json(envelope), json({
    role: 'external_test', target_names: raw.target_names,
    data_content_fingerprint: current.data_content_fingerprint, target_content_fingerprint: current.target_content_fingerprint,
    relations: current.coordinator_relations })));
  const request = dag.sign_training_replay_request_json(json({ schema_version: 1, request_id: 'replay:browser:cpu:calibrate',
    source_outcome_fingerprint: pkg.training_outcome.outcome_fingerprint, phase: 'PREDICT',
    data_envelope_keys: [key], output_binding_ids: [binding.binding_id], request_fingerprint: '0'.repeat(64) }));
  const positions = new Map(raw.sample_ids.map((id, index) => [id, index]));
  const manifest = pkg.effective_plan.controller_manifests['controller:methods.pls'];
  const adapter = new deps.Controller({ methods: deps.methods, operators: { [artifact.node_id]: 'pls' }, targetNames: binding.target_names,
    controllerId: manifest.controller_id, controllerVersion: manifest.controller_version, digest: deps.digest,
    resolveFeatures: ({ view }) => {
      if (view.source_ids.length !== 1 || view.source_ids[0] !== sourceId) throw new TypeError('Calibration replay source binding differs');
      const rows = view.sample_ids.map(id => { if (!positions.has(id)) throw new TypeError('Unknown calibration sample'); return source.array.values[positions.get(id)]; });
      return { sampleIds: [...view.sample_ids], matrix: { rows: rows.length, cols: source.array.shape[1], data: Float64Array.from(rows.flat()) } };
    }, resolveTargets: () => { throw new Error('Frozen calibration cannot FIT or request fitting targets'); } });
  const handles = new Set();
  const callback = (id, value) => {
    const task = JSON.parse(value);
    if (id !== manifest.controller_id) throw new TypeError('Unexpected calibration controller');
    if (task.operation === 'hydrate_artifact_payload') {
      const input = task.request;
      if (input.node_id !== artifact.node_id || input.params_fingerprint !== artifact.params_fingerprint
          || input.artifact.content_fingerprint !== artifact.artifact.content_fingerprint
          || deps.digest(Uint8Array.from(task.payload)) !== artifact.artifact.content_fingerprint) throw new TypeError('Calibration artifact closure differs');
      const handle = { handle: handles.size + 1, kind: 'model', owner_controller: id }; handles.add(handle.handle);
      return json({ operation: 'hydrated_artifact_payload', schema_version: 1, handle });
    }
    if (task.operation === 'release_hydrated_artifact_payload') {
      if (!handles.delete(task.handle.handle)) throw new TypeError('Unknown frozen calibration handle');
      return json({ operation: 'released_hydrated_artifact_payload', schema_version: 1 });
    }
    if (task.operation || task.phase !== 'PREDICT' || task.node_plan.node_id !== artifact.node_id
        || task.node_plan.params_fingerprint !== artifact.params_fingerprint) throw new TypeError('Frozen calibration only permits bound PREDICT');
    const inputs = Object.entries(task.artifact_inputs);
    if (inputs.length !== 1 || !handles.has(task.input_handles[inputs[0][0]]?.handle)
        || inputs[0][1].artifact.content_fingerprint !== artifact.artifact.content_fingerprint) throw new TypeError('Frozen calibration handle/artifact differs');
    const features = adapter._features(task, 'predict');
    const model = { predict(matrix) {
      const indices = features.sampleIds.map(sample => positions.get(sample));
      const expectedX = indices.flatMap(index => source.array.values[index]);
      if (matrix.data.length !== expectedX.length || expectedX.some((value, index) => matrix.data[index] !== value)) throw new TypeError('Calibration callback features differ from executed Methods inputs');
      return { rows: indices.length, cols: native.cols, data: Float64Array.from(indices.flatMap(index => native.data.slice(index * native.cols, (index + 1) * native.cols))) };
    } };
    return adapter._result(task, features, model, [], {});
  };
  try {
    const replayJson = dag.replay_training_package_json(packageJson, request, json({ [key]: predictEnvelope }),
      json([manifest]), 'outcome:browser:cpu:calibration', 'run:browser:cpu:calibration', callback);
    return { archive, replayJson, relations: current.coordinator_relations,
      truth: { sample_ids: [...raw.sample_ids], values: raw.y.values.map(y => [y]),
        target_names: [...raw.target_names], validity_masks: raw.target_mask.values.map(valid => [valid]) } };
  } finally { adapter.close(); }
}
