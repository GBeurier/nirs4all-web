/** Host-owned JavaScript estimators behind the native DAG-ML controller contract. */

const MODEL_SCHEMA = 'nirs4all.js-estimator-model.v1';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
  return value;
}

function rowsFrom(input, label, requireTargets) {
  if (!input || typeof input !== 'object') throw new TypeError(`${label} must be a dataset.`);
  const sampleIds = input.sampleIds ?? input.sample_ids;
  if (!Array.isArray(sampleIds) || sampleIds.length === 0 ||
      sampleIds.some((id) => typeof id !== 'string' || !id) ||
      new Set(sampleIds).size !== sampleIds.length) {
    throw new TypeError(`${label}.sampleIds must contain unique nonempty strings.`);
  }
  const count = sampleIds.length;
  let X;
  if (Array.isArray(input.X) && Array.isArray(input.X[0])) {
    X = input.X.map((row) => Array.from(row));
  } else {
    const cols = input.cols ?? input.n_features;
    if (!Number.isInteger(cols) || cols < 1 || !input.X || input.X.length !== count * cols) {
      throw new TypeError(`${label}.X must be rows or a flat matrix with cols.`);
    }
    X = Array.from({ length: count }, (_, row) =>
      Array.from(input.X.slice(row * cols, (row + 1) * cols)));
  }
  const cols = X[0]?.length;
  if (X.length !== count || !Number.isInteger(cols) || cols < 1 ||
      X.some((row) => row.length !== cols || row.some((value) => !Number.isFinite(value)))) {
    throw new TypeError(`${label}.X must be a finite rectangular matrix aligned to sampleIds.`);
  }
  const y = input.y == null ? null : Array.from(input.y);
  if (requireTargets && (!y || y.length !== count || y.some((value) => !Number.isFinite(value)))) {
    throw new TypeError(`${label}.y must be a finite target vector aligned to sampleIds.`);
  }
  const index = new Map(sampleIds.map((id, row) => [id, row]));
  return { sampleIds, X, y, index, cols };
}

function select(data, ids, withTargets) {
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new TypeError('A controller cohort must contain unique sample IDs.');
  }
  const indices = ids.map((id) => {
    const row = data.index.get(id);
    if (row === undefined) throw new RangeError(`Unknown controller sample ID '${id}'.`);
    return row;
  });
  return {
    X: indices.map((row) => data.X[row]),
    y: withTargets ? indices.map((row) => data.y[row]) : undefined,
  };
}

function predictions(estimator, X, rows) {
  const result = estimator.predict(X);
  if (result && typeof result.then === 'function') {
    throw new TypeError('DAG-ML synchronous controllers require synchronous predict().');
  }
  const values = Array.from(result ?? []);
  if (values.length !== rows || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Estimator predictions must contain one finite number per sample.');
  }
  return values.map((value) => [value]);
}

function train(estimator, X, y) {
  const fit = estimator.fit ?? estimator.train;
  if (typeof fit !== 'function' || typeof estimator.predict !== 'function') {
    throw new TypeError('An estimator must expose fit()/train() and predict().');
  }
  const fitted = fit.call(estimator, X, y);
  if (fitted && typeof fitted.then === 'function') {
    throw new TypeError('DAG-ML synchronous controllers require synchronous fit()/train().');
  }
  return estimator;
}

function seedFor(exactSeed) {
  if (exactSeed == null) return { exactSeed: null, seed: 0 };
  if (typeof exactSeed !== 'string' || !/^\d+$/.test(exactSeed)) {
    throw new TypeError('DAG-ML must supply the exact seed as a decimal string.');
  }
  const value = BigInt(exactSeed);
  if (value > 0xffffffffffffffffn) throw new RangeError('DAG-ML seed exceeds u64.');
  return { exactSeed, seed: Number(value & 0xffffffffn) };
}

export function createDagMlNodeResult(task, prediction = null) {
  const node = task.node_plan;
  const block = prediction && {
    prediction_id: `pred:${node.node_id}:${task.variant_id ?? 'base'}:${task.fold_id ?? 'nofold'}:${task.phase}`,
    producer_node: node.node_id,
    partition: task.phase === 'FIT_CV' ? 'validation' : 'final',
    fold_id: task.fold_id ?? null,
    sample_ids: prediction.sampleIds,
    values: prediction.values,
    target_names: prediction.targetNames,
  };
  return {
    node_id: node.node_id,
    outputs: {},
    predictions: block ? [block] : [],
    observation_predictions: [],
    aggregated_predictions: [],
    explanations: [],
    shape_deltas: [],
    artifacts: [],
    artifact_handles: {},
    lineage: {
      record_id: `lineage:${node.node_id}:${task.phase}:${task.variant_id ?? 'base'}:${task.fold_id ?? 'nofold'}`,
      run_id: task.run_id,
      node_id: node.node_id,
      phase: task.phase,
      controller_id: node.controller_id,
      controller_version: node.controller_version,
      variant_id: task.variant_id ?? null,
      fold_id: task.fold_id ?? null,
      branch_path: task.branch_path ?? [],
      input_lineage: [],
      artifact_refs: [],
      params_fingerprint: node.params_fingerprint,
      data_model_shape_fingerprint: null,
      aggregation_policy_fingerprint: null,
      seed: null, // The DAG-ML WASM bridge injects its exact u64 seed.
      unsafe_flags: [],
      metrics: {},
    },
  };
}

/** Derive the shared model manifest in native DAG-ML instead of mirroring its defaults. */
export function createDagMlModelManifest({
  dagMl,
  controllerId,
  controllerVersion = '1.0.0',
  operatorSelectors = [],
  priority = 20,
  artifactPolicy = 'host_only',
}) {
  if (typeof dagMl?.derive_controller_manifest_json !== 'function' ||
      typeof dagMl?.validate_controller_manifest_json !== 'function') {
    throw new TypeError('A current dag-ml-wasm module is required.');
  }
  const spec = {
    controller_id: controllerId,
    controller_version: controllerVersion,
    operator_kind: 'model',
    priority,
    rng_policy: 'uses_core_seed',
    artifact_policy: artifactPolicy,
    operator_selectors: operatorSelectors,
    input_ports: [{ name: 'x', kind: 'data', representation: 'tabular_numeric', cardinality: 'one', description: '' }],
    output_ports: [{ name: 'oof', kind: 'prediction', representation: null, cardinality: 'one', description: '' }],
  };
  const manifest = JSON.parse(dagMl.derive_controller_manifest_json(JSON.stringify(spec)));
  dagMl.validate_controller_manifest_json(JSON.stringify(manifest));
  return manifest;
}

/**
 * Adapt a synchronous JS estimator to DAG-ML's native model-controller wire.
 * The host owns feature matrices and fitted objects; DAG-ML owns folds and lineage.
 */
export function createJsEstimatorController({
  dagMl,
  controllerId,
  controllerVersion = '1.0.0',
  createEstimator,
  restoreEstimator,
  dataset,
  foldSet,
  targetName = 'y',
  operatorSelectors = [],
  paramsForTask = (params) => params,
}) {
  requireFunction(createEstimator, 'createEstimator');
  requireFunction(paramsForTask, 'paramsForTask');
  const training = rowsFrom(dataset, 'dataset', true);
  if (!foldSet || !Array.isArray(foldSet.folds) || foldSet.folds.length === 0) {
    throw new TypeError('A native DAG-ML FoldSet is required.');
  }
  if (!Array.isArray(foldSet.sample_ids) || foldSet.sample_ids.length !== training.sampleIds.length ||
      new Set(foldSet.sample_ids).size !== training.sampleIds.length ||
      foldSet.sample_ids.some((id) => !training.index.has(id))) {
    throw new TypeError('The DAG-ML FoldSet sample IDs must exactly match the training dataset.');
  }
  const folds = new Map(foldSet.folds.map((fold) => [fold.fold_id, fold]));
  if (folds.size !== foldSet.folds.length) throw new TypeError('Fold IDs must be unique.');
  for (const fold of folds.values()) {
    const trainIds = fold.train_sample_ids;
    const validationIds = fold.validation_sample_ids;
    select(training, trainIds, true);
    select(training, validationIds, false);
    if (trainIds.some((id) => validationIds.includes(id))) {
      throw new TypeError('DAG-ML fold train and validation cohorts overlap.');
    }
  }
  const manifest = createDagMlModelManifest({
    dagMl, controllerId, controllerVersion, operatorSelectors,
  });
  let predictionData = null;
  let selectedVariant = null;
  const fitted = new Map();

  function fitOn(ids, params, exactSeed, variantId = null) {
    const cohort = select(training, ids, true);
    const estimator = createEstimator({ params, ...seedFor(exactSeed) });
    train(estimator, cohort.X, cohort.y);
    fitted.set(variantId ?? 'base', estimator);
    return estimator;
  }

  function predictFrom(estimator, data, ids) {
    const cohort = select(data, ids, false);
    return predictions(estimator, cohort.X, ids.length);
  }

  function invoke(id, taskJson, exactSeed) {
    if (id !== controllerId) throw new Error(`Unexpected controller '${id}'.`);
    const task = JSON.parse(taskJson);
    if (task.node_plan?.controller_id !== controllerId ||
        task.node_plan?.controller_version !== controllerVersion) {
      throw new Error('NodeTask controller identity does not match its registered implementation.');
    }
    const variantId = task.variant_id ?? 'base';
    const params = paramsForTask(task.node_plan.params ?? {});
    if (task.phase === 'FIT_CV') {
      const fold = folds.get(task.fold_id);
      if (!fold) throw new Error(`Unknown DAG-ML fold '${task.fold_id}'.`);
      const cohort = select(training, fold.train_sample_ids, true);
      const estimator = createEstimator({ params, ...seedFor(exactSeed) });
      train(estimator, cohort.X, cohort.y);
      const values = predictFrom(estimator, training, fold.validation_sample_ids);
      return JSON.stringify(createDagMlNodeResult(task, {
        sampleIds: fold.validation_sample_ids, values, targetNames: [targetName],
      }));
    }
    if (task.phase === 'REFIT') {
      fitOn(foldSet.sample_ids ?? training.sampleIds, params, exactSeed, variantId);
      selectedVariant = variantId;
      return JSON.stringify(createDagMlNodeResult(task));
    }
    if (task.phase === 'PREDICT') {
      const estimator = fitted.get(variantId) ?? fitted.get(selectedVariant);
      if (!estimator) throw new Error('Predict requires a refitted or restored estimator.');
      if (!predictionData) throw new Error('Call setPredictionDataset() before DAG-ML PREDICT.');
      return JSON.stringify(createDagMlNodeResult(task, {
        sampleIds: predictionData.sampleIds,
        values: predictFrom(estimator, predictionData, predictionData.sampleIds),
        targetNames: [targetName],
      }));
    }
    throw new Error(`Unsupported DAG-ML phase '${task.phase}'.`);
  }

  return {
    manifest,
    invoke,
    setPredictionDataset(value) {
      const next = rowsFrom(value, 'prediction dataset', false);
      if (next.cols !== training.cols) throw new RangeError('Prediction feature count differs from training.');
      predictionData = next;
    },
    fitFull(params = {}, seed = '0') {
      const estimator = fitOn(foldSet.sample_ids, paramsForTask(params), seed);
      selectedVariant = 'base';
      return estimator;
    },
    predict(value) {
      const estimator = fitted.get(selectedVariant);
      if (!estimator) throw new Error('Fit or restore an estimator before prediction.');
      const data = rowsFrom(value, 'prediction dataset', false);
      if (data.cols !== training.cols) throw new RangeError('Prediction feature count differs from training.');
      return predictFrom(estimator, data, data.sampleIds).map((row) => row[0]);
    },
    exportModel() {
      const estimator = fitted.get(selectedVariant);
      if (!estimator || typeof estimator.toJSON !== 'function') {
        throw new Error('This estimator has no JSON model export.');
      }
      const model = estimator.toJSON();
      if (model && typeof model.then === 'function') {
        throw new TypeError('This estimator exports asynchronously; use exportModelAsync().');
      }
      return {
        schema: MODEL_SCHEMA, controllerId, controllerVersion,
        nFeatures: training.cols, model,
      };
    },
    async exportModelAsync() {
      const estimator = fitted.get(selectedVariant);
      if (!estimator || typeof estimator.toJSON !== 'function') {
        throw new Error('This estimator has no JSON model export.');
      }
      return {
        schema: MODEL_SCHEMA, controllerId, controllerVersion,
        nFeatures: training.cols, model: await estimator.toJSON(),
      };
    },
    importModel(payload) {
      if (payload?.schema !== MODEL_SCHEMA || payload.controllerId !== controllerId ||
          payload.controllerVersion !== controllerVersion || payload.nFeatures !== training.cols) {
        throw new Error('JS estimator artifact is incompatible with this controller.');
      }
      requireFunction(restoreEstimator, 'restoreEstimator');
      const estimator = restoreEstimator(payload.model);
      if (estimator && typeof estimator.then === 'function') {
        throw new TypeError('This estimator restores asynchronously; use importModelAsync().');
      }
      if (typeof estimator?.predict !== 'function') throw new TypeError('Restored estimator lacks predict().');
      fitted.set('base', estimator);
      selectedVariant = 'base';
    },
    async importModelAsync(payload) {
      if (payload?.schema !== MODEL_SCHEMA || payload.controllerId !== controllerId ||
          payload.controllerVersion !== controllerVersion || payload.nFeatures !== training.cols) {
        throw new Error('JS estimator artifact is incompatible with this controller.');
      }
      requireFunction(restoreEstimator, 'restoreEstimator');
      const estimator = await restoreEstimator(payload.model);
      if (typeof estimator?.predict !== 'function') throw new TypeError('Restored estimator lacks predict().');
      fitted.set('base', estimator);
      selectedVariant = 'base';
    },
  };
}

/** Optional ml-random-forest adapter; the package is loaded only when requested. */
export async function createRandomForestController(options) {
  let forest;
  try {
    forest = await import('ml-random-forest');
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw new Error('Install the optional ml-random-forest package to use this controller.', { cause: error });
  }
  const classification = options.task === 'classification';
  const Constructor = classification ? forest.RandomForestClassifier : forest.RandomForestRegression;
  if (typeof Constructor !== 'function') throw new TypeError('ml-random-forest lacks the requested estimator.');
  return createJsEstimatorController({
    ...options,
    controllerId: options.controllerId ??
      (classification ? 'controller:js.random_forest_classifier' : 'controller:js.random_forest_regression'),
    paramsForTask: (params) => {
      const { n_estimators, ...rest } = params;
      return { ...rest, ...(n_estimators == null ? {} : { nEstimators: n_estimators }) };
    },
    createEstimator: ({ params, seed }) => new Constructor({ ...params, seed }),
    restoreEstimator: (model) => Constructor.load(model),
  });
}

/** Native n4m coefficient-model adapter. Numerics remain entirely in Methods WASM. */
export function createN4mModelController({ methods, modelType, ...options }) {
  if (typeof methods?.fitModel !== 'function' || typeof methods?.predictModel !== 'function') {
    throw new TypeError('An initialized @nirs4all/methods binding is required.');
  }
  if (typeof modelType !== 'string' || !modelType) throw new TypeError('modelType is required.');
  const asMatrix = (rows) => ({
    data: Float64Array.from(rows.flat()), rows: rows.length, cols: rows[0].length,
  });
  const asEstimator = (model = null, params = {}) => ({
    fit(X, y) {
      const components = params.n_components ?? 1;
      if (!Number.isInteger(components) || components < 1) {
        throw new TypeError('n_components must be a positive integer.');
      }
      const vector = params.params ?? [];
      if (!Array.isArray(vector) || vector.some((value) => !Number.isFinite(value))) {
        throw new TypeError('n4m params must be a finite positional number array.');
      }
      model = methods.fitModel(modelType, asMatrix(X),
        { data: Float64Array.from(y), rows: y.length, cols: 1 }, components, vector);
    },
    predict(X) {
      if (!model) throw new Error('Fit or restore the n4m model before prediction.');
      const result = methods.predictModel(model, asMatrix(X));
      if (result.cols !== 1 || result.rows !== X.length) {
        throw new TypeError('n4m model returned an incompatible prediction shape.');
      }
      return Array.from(result.data);
    },
    toJSON() {
      if (!model) throw new Error('Fit the n4m model before export.');
      return {
        coefficients: Array.from(model.coefficients),
        xMean: Array.from(model.xMean),
        yMean: Array.from(model.yMean),
        intercept: model.intercept == null ? null : Array.from(model.intercept),
        n_features: model.n_features,
        n_targets: model.n_targets,
      };
    },
  });
  return createJsEstimatorController({
    ...options,
    controllerId: options.controllerId ?? `controller:methods.${modelType.toLowerCase()}`,
    createEstimator: ({ params }) => asEstimator(null, params),
    restoreEstimator: (model) => asEstimator({
      coefficients: Float64Array.from(model.coefficients),
      xMean: Float64Array.from(model.xMean),
      yMean: Float64Array.from(model.yMean),
      intercept: model.intercept == null ? null : Float64Array.from(model.intercept),
      n_features: model.n_features,
      n_targets: model.n_targets,
    }),
  });
}
