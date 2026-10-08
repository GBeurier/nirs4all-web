import { Workflow, workflowDependencies, workflowReplay } from './workflow.js';
import { CalibratedWorkflow } from './conformal.js';
import { loadArchiveV2Native, readPortableArchiveV2, replayMethodsArchiveV2 } from './archive-v2.js';
import { independentPhysicalDataset } from './uncertainty-cohort.js';

const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;

/** Frozen Gaussian stress scenarios; Methods transforms and DAG-ML scores. */
export async function robustness(model, value, truth, options = {}) {
  const deps = await workflowDependencies(options), native = await loadArchiveV2Native();
  const record = independentPhysicalDataset(deps.io, value);
  const scenarios = JSON.parse(native.validate_robustness_scenarios_json(JSON.stringify(options.scenarios ?? [
    { id: 'observed', kind: 'observed', severity: 0, seed: 0 },
    { id: 'gaussian', kind: 'spectral_noise', severity: 0.01, seed: 1 },
  ])));
  const bytes = model instanceof Workflow || model instanceof CalibratedWorkflow ? model.archive : model;
  if (record.dataset.sources.length !== 1) throw new TypeError('Frozen robustness supports one source');
  const source = record.dataset.sources[0], X = source.array.values;
  const matrix = { data: Float64Array.from(X.flat()), rows: X.length, cols: X[0].length };
  const archive = await readPortableArchiveV2(bytes);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const packageJsonStored = decoder.decode(archive.members[archive.manifest.replay.portable_predictor_package.member_path]);
  const pkg = JSON.parse(packageJsonStored);
  const cProfile = Object.values(pkg.effective_plan.node_plans)
    .some(node => node.controller_id === 'controller:methods.pls');
  if (cProfile) {
    if (source.array.shape.length !== 2 || source.presence_mask.values.some(present => !present)) throw new TypeError('Frozen robustness requires a complete numeric source');
    if (record.dataset.y !== null || record.dataset.partitions.values.some(role => role !== 'predict')) throw new TypeError('Robustness requires target-free predict rows and separately keyed truth');
    const sourceId = Object.values(pkg.template.campaign.data_bindings).flat()[0].source_ids[0];
    const expected = pkg.template.campaign.metadata.raw_source_schema;
    if (!expected || JSON.stringify(ordered(deps.io.publicSourceSchema(record, sourceId))) !== JSON.stringify(ordered(expected))) throw new TypeError('Prediction source schema differs from frozen predictor');
    deps.dag.validate_archive_v2_portable_payloads_json(JSON.stringify(archive.manifest), packageJsonStored,
      JSON.stringify(Object.fromEntries(Object.entries(archive.members).map(([name, bytes]) => [name, [...bytes]]))));
  }
  const replays = [];
  let packageJson;
  for (const scenario of scenarios) {
    const shifted = structuredClone(record);
    if (scenario.kind === 'spectral_noise') {
      const noisy = new deps.methods.GaussianNoise({ sigma: scenario.severity, seed: scenario.seed }).augment(matrix);
      shifted.dataset.sources[0].array.values = Array.from({ length: noisy.rows }, (_, row) =>
        Array.from(noisy.data.subarray(row * noisy.cols, (row + 1) * noisy.cols)));
    }
    if (cProfile) {
      const replay = await replayMethodsArchiveV2(bytes, { X: shifted.dataset.sources[0].array.values,
        rows: shifted.dataset.sample_ids.length, cols: source.array.shape[1], sampleIds: shifted.dataset.sample_ids }, { methods: deps.methods });
      const values = Array.from({ length: replay.rows }, (_, row) => replay.data.slice(row * replay.cols, (row + 1) * replay.cols));
      replays.push(native.frozen_methods_points_json(packageJsonStored, archive.archiveSha256,
        JSON.stringify(replay.sampleIds), JSON.stringify(values), JSON.stringify(replay.nativePredictorDescriptor)));
    }
    else {
      const details = await workflowReplay(bytes, shifted, options, false, true);
      packageJson = details.packageJson;
      replays.push(details.replayJson);
    }
  }
  if (cProfile) return JSON.parse(native.robustness_methods_points_json(packageJsonStored,
    JSON.stringify(scenarios), JSON.stringify(replays), JSON.stringify(truth)));
  return JSON.parse(native.robustness_report_json(packageJson, JSON.stringify(scenarios), JSON.stringify(replays), JSON.stringify(truth)));
}
