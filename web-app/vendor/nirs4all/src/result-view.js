import { readPortableArchiveV2, replayMethodsArchiveV2, loadArchiveV2Native } from './archive-v2.js';

const FILES = ['manifest.json', 'score_set.json', 'predictions.parquet'];
const decoder = new TextDecoder('utf-8', { fatal: true });

function bytes(value, label) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${label} must be Uint8Array bytes`);
  return value;
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function parse(value, label) {
  return object(JSON.parse(decoder.decode(bytes(value, label))), label);
}

function identifier(value, label) {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\u0000-\u0020\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a nonempty printable identifier`);
  }
  return value;
}

async function sha256(value) {
  const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle;
  const digest = new Uint8Array(await subtle.digest('SHA-256', value));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Open an experiment from exact host-provided member bytes. */
export async function openExperiment(indexBytes, members) {
  const index = parse(indexBytes, 'experiment.json');
  const inventory = object(members, 'experiment members');
  if (index.schema !== 'nirs4all.experiment.v1') throw new Error('Unsupported experiment schema');
  identifier(index.run_id, 'run_id');
  identifier(index.winner_variant_id, 'winner_variant_id');
  const expected = object(index.results, 'results inventory');
  if (Object.keys(expected).sort().join('|') !== [...FILES].sort().join('|')) {
    throw new Error('Experiment results inventory is invalid');
  }
  for (const name of FILES) {
    const member = bytes(inventory[`results/${name}`], `results/${name}`);
    if (await sha256(member) !== expected[name]) throw new Error(`Experiment result hash mismatch: ${name}`);
  }
  const viewBytes = bytes(inventory['result_view.json'], 'result_view.json');
  if (await sha256(viewBytes) !== index.result_view_sha256) throw new Error('Experiment result view hash mismatch');
  const view = parse(viewBytes, 'result_view.json');
  const manifest = parse(inventory['results/manifest.json'], 'native manifest');
  identifier(manifest.selected_variant_id, 'manifest selected_variant_id');
  identifier(manifest.run_id, 'manifest run_id');
  const scores = parse(inventory['results/score_set.json'], 'native score set');
  if (canonical(view.manifest) !== canonical(manifest) || canonical(view.score_set) !== canonical(scores)) {
    throw new Error('Result view disagrees with native metadata');
  }
  // The native writer stores canonical score JSON bytes. Hash those exact
  // bytes: JavaScript number serialization can change 1.0 to 1.
  const scoreHash = await sha256(inventory['results/score_set.json']);
  if (manifest.schema_version !== 2 || manifest.engine !== 'dag-ml'
      || manifest.score_set_hash !== scoreHash || manifest.run_id !== index.run_id
      || manifest.selected_variant_id !== index.winner_variant_id) {
    throw new Error('Native result manifest is inconsistent');
  }
  const reports = scores.reports;
  const predictions = view.predictions;
  if (!Array.isArray(reports) || !Array.isArray(predictions)) throw new Error('Native result rows are invalid');
  const variants = new Set([
    ...reports.map((report) => report.variant_id).filter(Boolean),
    ...predictions.map((row) => row.variant_id).filter(Boolean),
  ]);
  if (!variants.has(index.winner_variant_id)) throw new Error('Winner is absent from native results');
  for (const row of predictions) {
    if (!Array.isArray(row.sample_indices) || !Array.isArray(row.sample_ids)
        || (row.sample_ids.length !== 0 && row.sample_ids.length !== row.sample_indices.length)
        || new Set(row.sample_ids).size !== row.sample_ids.length) {
      throw new Error('Prediction sample identities are invalid');
    }
  }
  let archive = null;
  if (index.model_archive !== null) {
    if (index.model_archive?.path !== 'model.n4a') throw new Error('Model archive reference is invalid');
    archive = bytes(inventory['model.n4a'], 'model.n4a').slice();
    if (await sha256(archive) !== index.model_archive.sha256) throw new Error('Model archive hash mismatch');
    const opened = await readPortableArchiveV2(archive);
    // Use the native package/artifact semantic gate before accepting a model.
    const nativeArchive = await loadArchiveV2Native();
    nativeArchive.validate_portable_archive_v2(archive);
    const packagePayload = parse(opened.members['dagml/portable_predictor_package.json'], 'native predictor package');
    const outcome = parse(opened.members['dagml/training_outcome.json'], 'native training outcome');
    if (outcome.run_id !== index.run_id || outcome.selected_variant_id !== index.winner_variant_id
        || packagePayload.execution_bundle?.selected_variant_id !== index.winner_variant_id
        || packagePayload.training_outcome?.outcome_fingerprint !== outcome.outcome_fingerprint
        || manifest.training_outcome_fingerprint !== outcome.outcome_fingerprint
        || canonical(scores) !== canonical(outcome.score_set)) {
      throw new Error('Model archive does not close over experiment winner');
    }
    nativeArchive.validate_training_predictions_json(
      decoder.decode(opened.members['dagml/training_outcome.json']), JSON.stringify(predictions),
    );
  }
  return Object.freeze({
    validationLevel: 'hashed_native_projection',
    modelPredictionClosure: archive !== null,
    unattestedDisplayFields: Object.freeze(['dataset', 'task_type']),
    runId: index.run_id,
    winnerVariantId: index.winner_variant_id,
    variantIds: Object.freeze([...variants].sort()),
    selectionMetric: scores.selection_metric ?? null,
    compare({ variantId, partition } = {}) {
      if (variantId !== undefined && !variants.has(variantId)) throw new RangeError(`Unknown variant: ${variantId}`);
      return reports.filter((report) => (variantId === undefined || report.variant_id === variantId)
        && (partition === undefined || report.partition === partition))
        .map((report) => ({ ...structuredClone(report), isWinner: report.variant_id === index.winner_variant_id }));
    },
    predictions({ variantId, partition, foldId } = {}) {
      if (variantId !== undefined && !variants.has(variantId)) throw new RangeError(`Unknown variant: ${variantId}`);
      return structuredClone(predictions.filter((row) => (variantId === undefined || row.variant_id === variantId)
        && (partition === undefined || row.partition === partition)
        && (foldId === undefined || row.fold_id === foldId)));
    },
    async predictMethods(dataset, options = {}) {
      if (archive === null) throw new Error('Experiment has no portable model archive');
      return replayMethodsArchiveV2(archive, dataset, options);
    },
  });
}

/** Query the exact evidence retained by a native, already-validated workflow.
 * Native run/archive loading owns outcome validation. This adapter projects
 * report and prediction fields and never computes a metric or selects a model.
 */
export function trainingResultView(outcome, inputSampleIds) {
  const native = structuredClone(object(outcome, 'native training outcome'));
  identifier(native.run_id, 'run_id');
  identifier(native.selected_variant_id, 'selected_variant_id');
  const reports = native.score_set?.reports;
  if (!Array.isArray(reports)) throw new TypeError('Native training outcome lacks score reports');
  const sampleIds = native.effective_plan?.fold_set?.sample_ids;
  if (!Array.isArray(sampleIds) || new Set(sampleIds).size !== sampleIds.length) {
    throw new TypeError('Native training outcome lacks a unique sample cohort');
  }
  const orderedIds = native.effective_plan?.campaign?.metadata?.input_sample_ids;
  if (!Array.isArray(orderedIds) || orderedIds.length !== sampleIds.length
      || new Set(orderedIds).size !== orderedIds.length || orderedIds.some(id => !sampleIds.includes(id))) {
    throw new TypeError('Signed input sample identities differ from the native fold cohort');
  }
  if (inputSampleIds !== undefined && (!Array.isArray(inputSampleIds)
      || inputSampleIds.length !== orderedIds.length
      || inputSampleIds.some((id, index) => id !== orderedIds[index]))) {
    throw new TypeError('Input sample order differs from the signed input sample order');
  }
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const rows = [];
  function add(variant, block, truth, context) {
    object(block, 'native prediction block');
    const ids = block.sample_ids ?? block.unit_ids?.map((unit) => {
      if (unit.level !== 'sample') throw new TypeError('Dense result projection requires native sample-level blocks');
      return unit.id;
    });
    if (!Array.isArray(ids) || !Array.isArray(block.values) || ids.length !== block.values.length) {
      throw new TypeError('Native prediction values and identities disagree');
    }
    const width = block.values[0]?.length;
    if (!Number.isInteger(width) || width < 1 || block.values.some((row) => row.length !== width)) {
      throw new TypeError('Native prediction target shape is invalid');
    }
    const indices = ids.map((id) => {
      if (!positions.has(id)) throw new TypeError(`Native prediction sample is absent from fold cohort: ${id}`);
      return positions.get(id);
    });
    const values = truth?.values ?? [];
    rows.push({
      dataset: native.effective_plan.id, config_name: variant, variant_id: variant,
      model_name: block.producer_node, partition: block.partition, fold_id: block.fold_id ?? '',
      refit_context: context, sample_indices: indices, sample_ids: [...ids],
      y_true: values.flat(), y_pred: block.values.flat(), y_proba: [],
      y_true_shape: values.length ? [values.length, width] : [],
      y_pred_shape: [ids.length, width], y_proba_shape: [], weights: [], arrays_present: true,
      val_score: null, test_score: null, train_score: null, scores: {},
      metric: native.score_set.selection_metric ?? '', task_type: 'regression',
      target_width: width, target_names: [...block.target_names],
    });
  }
  for (const average of native.oof_averages ?? []) add(native.selected_variant_id, average.predictions, average.y_true, 'cv_oof_average');
  for (const variant of native.variant_oof_averages ?? []) {
    for (const average of variant.oof_averages) add(variant.variant_id, average.predictions, average.y_true, 'cv_oof_average');
  }
  for (const average of native.ensemble_averages ?? []) add(native.selected_variant_id, average.predictions, average.y_true, 'cv_ensemble');
  for (const output of native.outputs ?? []) {
    for (const prediction of output.predictions) add(native.selected_variant_id, prediction, null, 'selected_output');
  }
  const variants = new Set([...reports.map((report) => report.variant_id), ...rows.map((row) => row.variant_id)].filter(Boolean));
  if (!variants.has(native.selected_variant_id)) throw new TypeError('Native winner is absent from results');
  function checkVariant(id) {
    if (id !== undefined && !variants.has(id)) throw new RangeError(`Unknown variant: ${id}`);
  }
  return Object.freeze({
    runId: native.run_id, winnerVariantId: native.selected_variant_id,
    validationLevel: 'training_outcome_projection',
    unattestedDisplayFields: Object.freeze(['dataset', 'task_type']),
    variantIds: Object.freeze([...variants].sort()), selectionMetric: native.score_set.selection_metric ?? null,
    summary() {
      return { runId: native.run_id, winnerVariantId: native.selected_variant_id, variantIds: [...variants].sort(),
        selectionMetric: native.score_set.selection_metric ?? null, scoreReportCount: reports.length,
        predictionRowCount: rows.length, validationLevel: 'training_outcome_projection' };
    },
    compare({ variantId, partition } = {}) {
      checkVariant(variantId);
      return reports.filter((report) => (variantId === undefined || report.variant_id === variantId)
        && (partition === undefined || report.partition === partition))
        .map((report) => ({ ...structuredClone(report), isWinner: report.variant_id === native.selected_variant_id }));
    },
    predictions({ variantId, partition, foldId } = {}) {
      checkVariant(variantId);
      return structuredClone(rows.filter((row) => (variantId === undefined || row.variant_id === variantId)
        && (partition === undefined || row.partition === partition)
        && (foldId === undefined || row.fold_id === foldId)));
    },
  });
}
