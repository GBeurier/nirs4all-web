import { loadMethodsWasm, loadPipelineDefinition } from './index.js';
import { parseTrainAugmentation } from './native-augmentation.js';
import { n4mRoleMethodId } from './n4m-roles.js';

const KENNARD_STONE = new Set([
  'nirs4all.operators.splitters.KennardStoneSplitter',
  'nirs4all.operators.splitters.splitters.KennardStoneSplitter',
  'n4m.KennardStone',
]);

const SNV = new Set([
  'nirs4all.operators.transforms.SNV',
  'nirs4all.operators.transforms.StandardNormalVariate',
  'nirs4all.operators.transforms.scalers.StandardNormalVariate',
  'n4m.SNV',
]);

const SAVGOL = new Set([
  'nirs4all.operators.transforms.SavitzkyGolay',
  'nirs4all.operators.transforms.nirs.SavitzkyGolay',
  'n4m.SavitzkyGolay',
]);

const MSC = new Set([
  'n4m.MSC',
  'nirs4all.operators.transforms.MSC',
  'nirs4all.operators.transforms.MultiplicativeScatterCorrection',
  'nirs4all.operators.transforms.nirs.MultiplicativeScatterCorrection',
]);

const SPA = new Set(['n4m.SPA', 'n4m.SPASelector', 'pls4all.sklearn.SPASelector']);
const SELECTOR = 'n4m.Selector';
const SELECTOR_PARAMS = new Map([
  ['spa_select', ['top_k']],
  ['cars_select', ['n_iterations', 'min_features']],
  ['interval_select', ['interval_width', 'step']],
  ['stability_select', ['top_k']],
  ['uve_select', ['noise_features', 'noise_seed']],
  ['random_frog_select', ['n_iterations', 'initial_size', 'min_size', 'max_size', 'top_k', 'seed']],
  ['scars_select', ['n_iterations', 'min_features', 'sample_fraction', 'seed']],
  ['ga_select', ['n_generations', 'population_size', 'min_features', 'max_features', 'mutation_rate', 'seed']],
  ['pso_select', ['n_swarm', 'n_iterations', 'w', 'c1', 'c2', 'v_max', 'seed']],
  ['vissa_select', ['n_iterations', 'n_submodels', 'ratio_kept', 'threshold', 'floor_probability', 'seed']],
  ['shaving_select', ['n_steps', 'min_features', 'shave_fraction']],
  ['bve_select', ['n_steps', 'min_features']],
  ['t2_select', ['alpha_thresholds', 'min_selected']],
  ['wvc_select', ['top_k', 'normalize']],
  ['wvc_threshold_select', ['normalize', 'threshold', 'threshold_factor', 'min_selected']],
  ['emcuve_select', ['noise_features', 'noise_seed', 'n_ensembles', 'vote_threshold']],
  ['randomization_select', ['n_permutations', 'randomization_seed', 'alpha']],
  ['bipls_select', ['interval_width', 'min_intervals']],
  ['sipls_select', ['interval_width', 'combination_size']],
  ['rep_select', ['n_steps', 'min_features', 'remove_count']],
  ['ipw_select', ['n_iterations', 'top_k', 'damping', 'weight_floor']],
  ['st_select', ['thresholds', 'min_selected']],
  ['iriv_select', ['max_rounds', 'seed']],
  ['irf_select', ['n_iterations', 'window_size', 'initial_intervals', 'top_k', 'seed']],
  ['vip_spa_select', ['vip_threshold', 'top_k']],
]);
const SELECTOR_PLAN = new Set([...SELECTOR_PARAMS.keys()].filter((name) =>
  !['spa_select', 'wvc_select', 'wvc_threshold_select', 'randomization_select', 'vip_spa_select'].includes(name)));
const SELECTOR_TOP_K = new Set(['spa_select', 'wvc_select', 'stability_select',
  'random_frog_select', 'ipw_select', 'irf_select', 'vip_spa_select']);
const SELECTOR_SEEDS = new Map([
  ['uve_select', 'noise_seed'], ['emcuve_select', 'noise_seed'],
  ['randomization_select', 'randomization_seed'],
  ...['random_frog_select', 'scars_select', 'ga_select', 'pso_select', 'vissa_select',
    'iriv_select', 'irf_select'].map((name) => [name, 'seed']),
]);
const SELECTOR_INTEGER_PARAMS = new Set(['top_k', 'n_iterations', 'min_features', 'interval_width',
  'step', 'noise_features', 'noise_seed', 'initial_size', 'min_size', 'max_size', 'seed',
  'n_generations', 'population_size', 'n_swarm', 'n_submodels', 'n_steps', 'min_selected',
  'n_ensembles', 'n_permutations', 'randomization_seed', 'min_intervals', 'combination_size',
  'remove_count', 'max_rounds', 'window_size', 'initial_intervals']);

const STATELESS_PREPROCESSING = new Set(['StandardNormalVariate', 'SavitzkyGolay']);

const PLS = new Set([
  'sklearn.cross_decomposition.PLSRegression',
  'sklearn.cross_decomposition._pls.PLSRegression',
  'n4m.PLS',
  'n4m.PLSRegression',
]);

const AFFINE_MODELS = new Map([
  ['n4m.Ridge', { type: 'Ridge', params: [['lambda', 1]] }],
  ['n4m.RidgePLS', { type: 'RidgePLS', params: [['ridge_lambda', 1]] }],
  ['n4m.RobustPLS', { type: 'RobustPLS', params: [['huber_k', 1.345], ['max_irls_iter', 20, 'integer']] }],
  ['n4m.CPPLS', { type: 'CPPLS', params: [['gamma', 0.5]] }],
  ['n4m.SparseSIMPLS', { type: 'SparseSIMPLS', params: [['sparsity_lambda', 0.05]] }],
  ['n4m.ECR', { type: 'ECR', params: [['alpha', 0.5]] }],
  ['n4m.ContinuumRegression', { type: 'ContinuumRegression', params: [['tau', 0.5]] }],
  ['n4m.MIRPLS', { type: 'MIRPLS', params: [] }],
  ['n4m.FusedSparsePLS', { type: 'FusedSparsePLS', strict: true,
    params: [['l1_lambda', 0.05], ['fusion_lambda', 0.05]] }],
  ['n4m.BaggingPLS', { type: 'BaggingPLS', strict: true,
    params: [['n_estimators', 50, 'integer'], ['seed', 0, 'seed']] }],
  ['n4m.BoostingPLS', { type: 'BoostingPLS', strict: true,
    params: [['n_estimators', 50, 'integer'], ['learning_rate', 0.1, 'unitInterval']] }],
  ['n4m.RandomSubspacePLS', { type: 'RandomSubspacePLS', strict: true,
    params: [['n_estimators', 50, 'integer'], ['features_per_subspace', 10, 'integer'],
      ['seed', 0, 'seed']] }],
  ['n4m.NPLS', { type: 'NPLS', strict: true,
    params: [['mode_j', undefined, 'integer'], ['mode_k', undefined, 'integer']] }],
  ['n4m.MBPLS', { type: 'MBPLS', strict: true,
    params: [['block_sizes', undefined, 'integerArray']] }],
  ['n4m.GroupSparsePLS', { type: 'GroupSparsePLS', strict: true,
    params: [['group_lambda', 0.05], ['group_assignment', undefined, 'integerArray']] }],
]);

export async function runPortablePipeline(source, dataset, options = {}) {
  const definition = loadPipelineDefinition(source);
  const plan = parseExecutionPlan(definition);
  const methods = options.methods ?? await loadMethodsWasm();
  if (typeof methods.loadModule === 'function') {
    await methods.loadModule();
  }

  const input = coerceDataset(dataset);
  const split = computeSplit(methods, plan.splitter, input);
  const train = selectRows(input.X, input.rows, input.cols, split.trainIndices);
  const test = selectRows(input.X, input.rows, input.cols, split.testIndices);
  const yTrain = selectRows(input.y, input.rows, 1, split.trainIndices);
  const yTest = selectRows(input.y, input.rows, 1, split.testIndices);

  let XTrain = train;
  let XTest = test;
  const preprocessing = [];

  if (plan.trainAugmentation) {
    if (typeof methods.augmentNative !== 'function') {
      throw new Error('nirs4all-methods WASM lacks augmentNative (requires Methods ABI 2.11 or newer).');
    }
    const augmentation = plan.trainAugmentation;
    const augmented = methods.augmentNative(
      augmentation.methodsKind, XTrain, augmentation.values, augmentation.seed,
    );
    if (!augmented || augmented.rows !== XTrain.rows || augmented.cols !== XTrain.cols
        || !(augmented.data instanceof Float64Array)
        || augmented.data.length !== XTrain.data.length
        || !augmented.data.every(Number.isFinite)) {
      throw new Error('nirs4all-methods returned an invalid native X augmentation matrix.');
    }
    XTrain = augmented;
  }

  for (const step of plan.preprocessing) {
    if (step.type === 'N4MSelector') {
      const spec = step.params;
      if (spec.n_components > Math.min(XTrain.cols, XTrain.rows - 1)) {
        throw new RangeError(`Selector n_components ${spec.n_components} exceeds the training rank.`);
      }
      if (SELECTOR_PLAN.has(spec.method) && XTrain.rows < 4) {
        throw new RangeError('Selector validation plan requires at least 4 training rows.');
      }
      if (spec.method_params.top_k > XTrain.cols) {
        throw new RangeError(`Selector top_k exceeds ${XTrain.cols} input features.`);
      }
      const selected = methods.selectVariables(spec.method,
        { data: XTrain.data, rows: XTrain.rows, cols: XTrain.cols },
        { data: yTrain.data, rows: yTrain.rows, cols: 1 },
        spec.n_components, spec.method_params);
      const indices = checkedSelectorIndices(selected, XTrain.cols);
      XTrain = selectColumns(XTrain, sortedSpaIndices(indices));
      XTest = selectColumns(XTest, sortedSpaIndices(indices));
      preprocessing.push({ type: 'N4MSelector', params: spec, state: indices });
      continue;
    }
    if (step.type === 'SPA') {
      if (step.params[0] > XTrain.cols) {
        throw new RangeError(`SPA top_k ${step.params[0]} exceeds ${XTrain.cols} features.`);
      }
      const maxComponents = Math.min(XTrain.cols, XTrain.rows - 1);
      if (step.params[1] > maxComponents) {
        throw new RangeError(`SPA n_components ${step.params[1]} exceeds train rank limit ${maxComponents}.`);
      }
      const selected = methods.selectSpa(
        { data: XTrain.data, rows: XTrain.rows, cols: XTrain.cols },
        { data: yTrain.data, rows: yTrain.rows, cols: 1 },
        step.params[0], step.params[1],
      );
      const indices = checkedSpaIndices(selected, XTrain.cols, step.params[0]);
      XTrain = selectColumns(XTrain, sortedSpaIndices(indices));
      XTest = selectColumns(XTest, sortedSpaIndices(indices));
      preprocessing.push({ type: 'SPA', params: step.params, state: indices });
      continue;
    }
    const op = methods.ppCreate(step.type, step.params);
    try {
      methods.ppFit(op, XTrain.data, XTrain.rows, XTrain.cols);
      const state = typeof methods.ppGetState === 'function'
        ? Array.from(methods.ppGetState(op))
        : [];
      if (!STATELESS_PREPROCESSING.has(step.type) && state.length === 0) {
        throw new Error(`Portable preprocessing '${step.type}' did not provide fitted state.`);
      }
      if (!state.every(Number.isFinite) || (step.type === 'MSC' && state.length !== XTrain.cols)) {
        throw new Error(`Portable preprocessing '${step.type}' provided invalid fitted state.`);
      }
      XTrain = {
        data: methods.ppTransform(op, XTrain.data, XTrain.rows, XTrain.cols),
        rows: XTrain.rows,
        cols: XTrain.cols,
      };
      XTest = {
        data: methods.ppTransform(op, XTest.data, XTest.rows, XTest.cols),
        rows: XTest.rows,
        cols: XTest.cols,
      };
      preprocessing.push({ type: step.type, params: step.params, state });
    } finally {
      methods.ppDestroy(op);
    }
  }

  const candidates = plan.nComponents.map((nComponents) => {
    if (plan.modelType === 'RandomSubspacePLS' && plan.modelParams[1] > XTrain.cols) {
      throw new RangeError(`RandomSubspacePLS features_per_subspace ${plan.modelParams[1]} exceeds ${XTrain.cols} input features.`);
    }
    if (plan.modelType === 'NPLS' &&
        BigInt(plan.modelParams[0]) * BigInt(plan.modelParams[1]) !== BigInt(XTrain.cols)) {
      throw new RangeError(`NPLS mode_j * mode_k must equal ${XTrain.cols} fitted features.`);
    }
    if (plan.modelType === 'MBPLS' &&
        plan.modelParams.reduce((sum, size) => sum + size, 0) !== XTrain.cols) {
      throw new RangeError(`MBPLS block_sizes must sum to ${XTrain.cols} fitted features.`);
    }
    if (plan.modelType === 'GroupSparsePLS' &&
        plan.modelParams.length !== XTrain.cols + 1) {
      throw new RangeError(`GroupSparsePLS group_assignment must contain ${XTrain.cols} fitted features.`);
    }
    const xMatrix = { data: XTrain.data, rows: XTrain.rows, cols: XTrain.cols };
    const yMatrix = { data: yTrain.data, rows: yTrain.rows, cols: 1 };
    const model = plan.modelType === 'PLSRegression'
      ? methods.fitPls(xMatrix, yMatrix, nComponents)
      : methods.fitModel(plan.modelType, xMatrix, yMatrix, nComponents, plan.modelParams);
    const predicted = (plan.modelType === 'PLSRegression' ? methods.predictPls : methods.predictModel)(model, {
      data: XTest.data,
      rows: XTest.rows,
      cols: XTest.cols,
    });
    const predictions = Array.from(predicted.data);
    const targets = Array.from(yTest.data);
    return {
      n_components: nComponents,
      rmse: rmse(predictions, targets),
      predictions,
      model: serializePlsModel(model, nComponents, plan.modelType, plan.modelParams),
    };
  });

  const selected = candidates.reduce((best, item) => (item.rmse < best.rmse ? item : best), candidates[0]);
  const variants = candidates.map(stripVariantModel);

  return {
    name: definition.name,
    rows: input.rows,
    cols: input.cols,
    split,
    preprocessing,
    ...(plan.trainAugmentation ? { train_augmentation: {
      kind: plan.trainAugmentation.kind,
      values: [...plan.trainAugmentation.values],
      seed: plan.trainAugmentation.seed,
    } } : {}),
    variants,
    selected: stripVariantModel(selected),
    model: selected.model,
    targets: Array.from(yTest.data),
    evaluation: {
      scope: split.kind === 'all' ? 'training' : 'selection_validation',
      independent_test: false,
    },
  };
}

export async function predictPortablePipeline(fitted, dataset, options = {}) {
  if (!fitted || typeof fitted !== 'object') {
    throw new TypeError('Portable prediction requires a fitted portable pipeline result.');
  }
  const methods = options.methods ?? await loadMethodsWasm();
  if (typeof methods.loadModule === 'function') {
    await methods.loadModule();
  }

  let X = coerceFeatures(dataset);
  for (const step of fitted.preprocessing ?? []) {
    if (step.type === 'N4MSelector') {
      X = selectColumns(X, sortedSpaIndices(checkedSelectorIndices(step.state, X.cols)));
      continue;
    }
    if (step.type === 'SPA') {
      const topK = integerParam(step.params?.[0], undefined, 'SPA top_k', { min: 1 });
      X = selectColumns(X, sortedSpaIndices(checkedSpaIndices(step.state, X.cols, topK)));
      continue;
    }
    const state = step.state;
    if (!STATELESS_PREPROCESSING.has(step.type) && (!Array.isArray(state) || state.length === 0)) {
      throw new Error(`Portable preprocessing '${step.type}' requires fitted state; this result cannot be replayed safely.`);
    }
    if (step.type === 'MSC' && state.length !== X.cols) {
      throw new RangeError(`Portable preprocessing 'MSC' state length ${state.length} does not match ${X.cols} features.`);
    }
    const op = methods.ppCreate(step.type, step.params ?? []);
    try {
      if (state?.length) {
        if (!Array.isArray(state) || !state.every(Number.isFinite)) {
          throw new TypeError(`Portable preprocessing '${step.type}' has invalid fitted state.`);
        }
        if (typeof methods.ppSetState !== 'function') {
          throw new Error(`Methods runtime cannot restore fitted state for '${step.type}'.`);
        }
        methods.ppSetState(op, Float64Array.from(state));
      }
      X = {
        data: methods.ppTransform(op, X.data, X.rows, X.cols),
        rows: X.rows,
        cols: X.cols,
      };
    } finally {
      methods.ppDestroy(op);
    }
  }

  const model = hydratePlsModel(fitted.model ?? fitted.selected?.model);
  const predicted = (model.type === 'PLSRegression' || model.type == null
    ? methods.predictPls : methods.predictModel)(model, {
    data: X.data,
    rows: X.rows,
    cols: X.cols,
  });
  return {
    data: Array.from(predicted.data),
    rows: predicted.rows,
    cols: predicted.cols,
  };
}

export function parseExecutionPlan(source) {
  const definition = source && Array.isArray(source.pipeline) ? source : loadPipelineDefinition(source);
  let splitter = null;
  const preprocessing = [];
  let trainAugmentation = null;
  let modelStep = null;

  for (const step of definition.pipeline) {
    const roleName = typeof step === 'string' ? step : step?.class;
    if (n4mRoleMethodId(roleName) !== null) {
      throw new Error(`'${roleName}' is an n4m role step: fit role recipes with N4mRolePipeline.fit().`);
    }
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new TypeError('Portable pipeline steps must be mapping objects.');
    }
    if (modelStep) {
      throw new Error('The model must be the final portable pipeline step.');
    }
    if ('class' in step && 'model' in step) {
      throw new Error('A portable step cannot contain both class and model.');
    }

    if (Object.prototype.hasOwnProperty.call(step, 'train_augmentation')) {
      if (trainAugmentation || preprocessing.length > 0) {
        throw new Error('train_augmentation must appear once before preprocessing and the model.');
      }
      trainAugmentation = parseTrainAugmentation(step);
      continue;
    }

    if (typeof step.class === 'string') {
      if (KENNARD_STONE.has(step.class)) {
        if (splitter) {
          throw new Error('The optional splitter must appear once, before the model.');
        }
        const params = { ...step.params, test_size: numberParam(step.params?.test_size, 0.25, 'test_size') };
        splitter = { type: 'KennardStone', params };
      } else if (SNV.has(step.class)) {
        preprocessing.push({ type: 'StandardNormalVariate', params: [] });
      } else if (SAVGOL.has(step.class)) {
        preprocessing.push({ type: 'SavitzkyGolay', params: savgolParams(step.params ?? {}) });
      } else if (MSC.has(step.class)) {
        mscParams(step.params ?? {});
        preprocessing.push({ type: 'MSC', params: [] });
      } else if (SPA.has(step.class)) {
        preprocessing.push({ type: 'SPA', params: spaParams(step.params) });
      } else if (step.class === SELECTOR) {
        preprocessing.push({ type: 'N4MSelector', params: selectorParams(step.params) });
      } else {
        throw new Error(`Portable execution does not support step class '${step.class}'.`);
      }
      continue;
    }

    if (step.model && typeof step.model === 'object') {
      if (modelStep) {
        throw new Error('Portable execution supports exactly one model step.');
      }
      modelStep = step;
      continue;
    }

    throw new Error(`Portable execution does not support pipeline step: ${JSON.stringify(step)}`);
  }

  if (!modelStep) {
    throw new Error('Portable execution requires a supported model step.');
  }
  const model = modelStep.model;
  if (!PLS.has(model.class) && !AFFINE_MODELS.has(model.class)) {
    throw new Error(`Portable execution does not support model class '${model.class}'.`);
  }

  const affine = AFFINE_MODELS.get(model.class);

  return {
    splitter,
    trainAugmentation,
    preprocessing,
    nComponents: componentValues(modelStep),
    modelType: affine?.type ?? 'PLSRegression',
    modelParams: affine ? affineParams(model.params, affine) : [],
  };
}

function affineParams(params = {}, spec) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`${spec.type} params must be a mapping.`);
  }
  const allowed = new Set(['n_components', ...spec.params.map(([name]) => name)]);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) throw new TypeError(`Unsupported ${spec.type} parameter '${key}'.`);
  }
  if (spec.type === 'MBPLS') {
    const blocks = params.block_sizes;
    if (!Array.isArray(blocks) || blocks.length < 2 ||
        blocks.some((size) => typeof size !== 'number' || !Number.isInteger(size) ||
          size < 1 || size > 2147483647)) {
      throw new TypeError('MBPLS block_sizes must contain at least two positive i32 integers.');
    }
    return [...blocks];
  }
  if (spec.type === 'GroupSparsePLS') {
    if (params.group_lambda != null && typeof params.group_lambda !== 'number') {
      throw new TypeError('group_lambda must be numeric.');
    }
    const lambda = numberParam(params.group_lambda, 0.05, 'group_lambda');
    const groups = params.group_assignment;
    if (lambda < 0) throw new RangeError('group_lambda must be non-negative.');
    if (!Array.isArray(groups) || groups.length === 0 ||
        groups.some((id) => typeof id !== 'number' || !Number.isInteger(id) ||
          id < 0 || id > 2147483647)) {
      throw new TypeError('GroupSparsePLS group_assignment must contain non-negative i32 group ids.');
    }
    return [lambda, ...groups];
  }
  return spec.params.map(([name, fallback, kind]) => {
    if (spec.strict && params[name] != null && typeof params[name] !== 'number') {
      throw new TypeError(`${name} must be numeric.`);
    }
    if (kind === 'integer' || kind === 'seed') {
      return integerParam(params[name], fallback, name, { min: kind === 'seed' ? 0 : 1 });
    }
    const value = numberParam(params[name], fallback, name);
    if (kind === 'unitInterval' && !(value > 0 && value <= 1)) {
      throw new RangeError(`${name} must be in (0, 1].`);
    }
    if (spec.type === 'FusedSparsePLS' && value < 0) {
      throw new RangeError(`${name} must be non-negative.`);
    }
    return value;
  });
}

function coerceDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError('Portable execution requires a dataset object.');
  }
  const rows = Number(dataset.rows ?? dataset.n_samples ?? 0);
  const cols = Number(dataset.cols ?? dataset.n_features ?? 0);
  const X = flattenMatrix(dataset.X, rows, cols, 'X');
  const y = flattenMatrix(dataset.y, rows, 1, 'y');
  return { X, y, rows, cols };
}

export function coerceFeatures(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError('Portable prediction requires a feature dataset object.');
  }
  const rows = Number(dataset.rows ?? dataset.n_samples ?? 0);
  const cols = Number(dataset.cols ?? dataset.n_features ?? 0);
  const X = flattenMatrix(dataset.X, rows, cols, 'X');
  return { data: X, rows, cols };
}

function flattenMatrix(value, rows, cols, label) {
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0) {
    throw new TypeError(`Dataset ${label} shape must provide positive integer rows/cols.`);
  }
  if (value instanceof Float64Array) {
    if (value.length !== rows * cols) {
      throw new RangeError(`Dataset ${label} length ${value.length} does not match ${rows}x${cols}.`);
    }
    return value;
  }
  if (Array.isArray(value) && Array.isArray(value[0])) {
    if (value.length !== rows) {
      throw new RangeError(`Dataset ${label} has ${value.length} rows but declares ${rows}.`);
    }
    value.forEach((row, r) => {
      if (!Array.isArray(row) || row.length !== cols) {
        throw new RangeError(`Dataset ${label} row ${r} has ${row?.length} values but declares ${cols} columns.`);
      }
    });
    const out = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        out[r * cols + c] = Number(value[r][c]);
      }
    }
    return out;
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length !== rows * cols) {
      throw new RangeError(`Dataset ${label} length ${value.length} does not match ${rows}x${cols}.`);
    }
    return Float64Array.from(value);
  }
  throw new TypeError(`Dataset ${label} must be a Float64Array, a flat array, or a nested row array.`);
}

function computeSplit(methods, splitter, input) {
  if (!splitter) {
    const indices = Array.from({ length: input.rows }, (_, i) => i);
    return { kind: 'all', trainIndices: indices, testIndices: indices };
  }
  const splitOptions = { testSize: numberParam(splitter.params.test_size, 0.25, 'test_size') };
  if (typeof methods.computeSplitIndices === 'function') {
    const split = methods.computeSplitIndices(
      'KennardStone',
      { data: input.X, rows: input.rows, cols: input.cols },
      null,
      splitOptions,
    );
    return {
      kind: 'KennardStone',
      trainIndices: Array.from(split.trainIndices),
      testIndices: Array.from(split.testIndices),
    };
  }
  const mask = methods.computeSplit(
    'KennardStone',
    { data: input.X, rows: input.rows, cols: input.cols },
    { data: input.y, rows: input.rows, cols: 1 },
    splitOptions,
  );
  const trainIndices = [];
  const testIndices = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) testIndices.push(i);
    else trainIndices.push(i);
  }
  return { kind: 'KennardStone', trainIndices, testIndices };
}

function selectRows(data, rows, cols, indices) {
  const out = new Float64Array(indices.length * cols);
  for (let r = 0; r < indices.length; r += 1) {
    const source = indices[r];
    if (source < 0 || source >= rows) {
      throw new RangeError(`Row index ${source} is outside 0..${rows - 1}.`);
    }
    out.set(data.subarray(source * cols, source * cols + cols), r * cols);
  }
  return { data: out, rows: indices.length, cols };
}

function selectColumns(matrix, indices) {
  const out = new Float64Array(matrix.rows * indices.length);
  for (let row = 0; row < matrix.rows; row += 1) {
    for (let col = 0; col < indices.length; col += 1) {
      out[row * indices.length + col] = matrix.data[row * matrix.cols + indices[col]];
    }
  }
  return { data: out, rows: matrix.rows, cols: indices.length };
}

function checkedSpaIndices(value, cols, topK) {
  let indices;
  try {
    indices = checkedSelectorIndices(value, cols);
  } catch (error) {
    throw new error.constructor(`SPA ${error.message}`);
  }
  if (indices.length !== topK) {
    throw new RangeError(`SPA selected ${indices.length} indices; expected ${topK}.`);
  }
  return indices;
}

function checkedSelectorIndices(value, cols) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value))
      || typeof value[Symbol.iterator] !== 'function') {
    throw new TypeError('Selector requires fitted selected indices.');
  }
  const raw = Array.from(value);
  if (raw.length < 1 || raw.length > cols) {
    throw new RangeError(`Selector returned ${raw.length} indices for ${cols} features.`);
  }
  const indices = raw.map((item) => {
    if (typeof item !== 'bigint' && (!Number.isSafeInteger(item) || item < 0)) {
      throw new TypeError('Selector indices must be non-negative safe integers.');
    }
    const index = typeof item === 'bigint' ? item : BigInt(item);
    if (index < 0n || index >= BigInt(cols)) {
      throw new RangeError(`Selector index ${item} is outside 0..${cols - 1}.`);
    }
    return Number(index);
  });
  if (new Set(indices).size !== indices.length) {
    throw new RangeError('Selector returned duplicate indices.');
  }
  return indices;
}

function sortedSpaIndices(indices) {
  return [...indices].sort((a, b) => a - b);
}

function spaParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('SPA params must be a mapping with top_k.');
  }
  for (const key of Object.keys(params)) {
    if (!['top_k', 'n_components'].includes(key)) {
      throw new TypeError(`Unsupported SPA parameter '${key}'.`);
    }
  }
  return [
    integerParam(params.top_k, undefined, 'SPA top_k', { min: 1 }),
    integerParam(params.n_components, 2, 'SPA n_components', { min: 1 }),
  ];
}

function selectorParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)
      || Object.keys(params).some((key) => !['method', 'n_components', 'method_params'].includes(key))) {
    throw new TypeError('Selector params must contain method, n_components, and method_params.');
  }
  const { method, method_params: methodParams } = params;
  if (typeof method !== 'string' || !SELECTOR_PARAMS.has(method)) {
    throw new TypeError(`Unsupported Selector method '${method}'.`);
  }
  if (typeof params.n_components !== 'number') {
    throw new TypeError('Selector n_components must be numeric.');
  }
  const nComponents = integerParam(params.n_components, undefined, 'Selector n_components', { min: 1 });
  if (!methodParams || typeof methodParams !== 'object' || Array.isArray(methodParams)) {
    throw new TypeError('Selector method_params must be a mapping.');
  }
  const allowed = new Set(SELECTOR_PARAMS.get(method));
  const required = [];
  if (SELECTOR_TOP_K.has(method)) required.push('top_k');
  if (SELECTOR_SEEDS.has(method)) required.push(SELECTOR_SEEDS.get(method));
  if (method === 't2_select') required.push('alpha_thresholds');
  if (method === 'st_select') required.push('thresholds');
  for (const name of required) {
    if (!Object.hasOwn(methodParams, name)) throw new TypeError(`Selector '${method}' requires '${name}'.`);
  }
  const normalized = {};
  for (const [name, value] of Object.entries(methodParams)) {
    if (!allowed.has(name)) throw new TypeError(`Unsupported ${method} parameter '${name}'.`);
    if (name === 'normalize') {
      if (typeof value !== 'boolean') throw new TypeError('Selector normalize must be boolean.');
      normalized[name] = value;
    } else if (name === 'alpha_thresholds' || name === 'thresholds') {
      if (!Array.isArray(value) || value.length === 0 ||
          !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
        throw new TypeError(`Selector ${name} must be a non-empty finite numeric array.`);
      }
      normalized[name] = [...value];
    } else if (SELECTOR_INTEGER_PARAMS.has(name)) {
      normalized[name] = integerParam(value, undefined, name,
        { min: SELECTOR_SEEDS.get(method) === name ? 0 : 1 });
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`Selector ${name} must be finite numeric.`);
      }
      normalized[name] = value;
    }
  }
  return { method, n_components: nComponents, method_params: normalized };
}

function savgolParams(params) {
  const delta = numberParam(params.delta, 1, 'delta');
  if (delta !== 1) {
    throw new Error('Portable Savitzky-Golay execution currently supports delta=1 only.');
  }
  return [
    integerParam(params.window_length ?? params.window, 11, 'window_length', { min: 1 }),
    integerParam(params.polyorder, 3, 'polyorder', { min: 0 }),
    integerParam(params.deriv, 0, 'deriv', { min: 0 }),
    // scipy.signal.savgol_filter, and therefore nirs4all Python, default to interp.
    savgolMode(params.mode ?? 'interp'),
    numberParam(params.cval, 0, 'cval'),
  ];
}

function mscParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('MSC params must be a mapping.');
  }
  for (const [key, value] of Object.entries(params)) {
    if (!['scale', 'copy'].includes(key) || typeof value !== 'boolean') {
      throw new TypeError(`Unsupported MSC parameter '${key}'.`);
    }
  }
}

const SAVGOL_MODES = new Map([
  ['mirror', 0],
  ['constant', 1],
  ['nearest', 2],
  ['wrap', 3],
  ['interp', 4],
]);

function savgolMode(value) {
  if (typeof value === 'string') {
    const mode = SAVGOL_MODES.get(value.toLowerCase());
    if (mode != null) {
      return mode;
    }
    throw new Error(`Unsupported Savitzky-Golay mode: ${value}`);
  }
  const mode = integerParam(value, 4, 'mode', { min: 0 });
  if (Number.isInteger(mode) && mode >= 0 && mode <= 4) {
    return mode;
  }
  throw new Error(`Unsupported Savitzky-Golay mode: ${value}`);
}

function componentValues(step) {
  if ('_range_' in step) {
    if (step.param !== 'n_components') {
      throw new Error("Portable execution only supports _range_ sweeps over 'n_components'.");
    }
    if (!Array.isArray(step._range_) || step._range_.length !== 3) {
      throw new Error('Invalid n_components _range_; expected [start, stop, positive_step].');
    }
    const start = integerParam(step._range_[0], undefined, 'n_components range start', { min: 1 });
    const stop = integerParam(step._range_[1], undefined, 'n_components range stop', { min: 1 });
    const stride = integerParam(step._range_[2], undefined, 'n_components range step', { min: 1 });
    if (start > stop) {
      throw new Error('Invalid n_components _range_; start must be <= stop.');
    }
    const count = Math.floor((stop - start) / stride) + 1;
    if (count > 10_000) {
      throw new Error('Portable n_components sweep exceeds 10000 variants.');
    }
    return Array.from({ length: count }, (_, index) => start + index * stride);
  }
  const params = step.model?.params ?? {};
  return [integerParam(params.n_components, 2, 'n_components', { min: 1 })];
}

function numberParam(value, fallback, label) {
  if (value == null) {
    return fallback;
  }
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value);
  } else {
    throw new TypeError(`${label} must be numeric.`);
  }
  if (!Number.isFinite(n)) {
    throw new RangeError(`${label} must be finite.`);
  }
  return n;
}

function integerParam(value, fallback, label, options = {}) {
  const n = numberParam(value, fallback, label);
  if (!Number.isInteger(n)) {
    throw new RangeError(`${label} must be an integer.`);
  }
  if (n < -2147483648 || n > 2147483647) {
    throw new RangeError(`${label} is outside i32 range.`);
  }
  if (options.min != null && n < options.min) {
    throw new RangeError(`${label} must be >= ${options.min}.`);
  }
  return n;
}

function rmse(predictions, targets) {
  if (predictions.length !== targets.length) {
    throw new RangeError('Prediction/target length mismatch.');
  }
  let sum = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    const diff = predictions[i] - targets[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum / predictions.length);
}

function stripVariantModel(variant) {
  return {
    n_components: variant.n_components,
    rmse: variant.rmse,
    predictions: variant.predictions,
  };
}

function serializePlsModel(model, nComponents, type = 'PLSRegression', params = []) {
  if (!model || typeof model !== 'object') {
    throw new TypeError('nirs4all-methods returned an invalid PLS model.');
  }
  return {
    type,
    n_components: nComponents,
    params,
    coefficients: serializeVector(model.coefficients),
    xMean: serializeVector(model.xMean),
    yMean: serializeVector(model.yMean),
    intercept: model.intercept == null ? null : serializeVector(model.intercept),
    n_features: Number(model.n_features),
    n_targets: Number(model.n_targets),
  };
}

function hydratePlsModel(model) {
  if (!model || typeof model !== 'object') {
    throw new TypeError('Portable prediction requires a serialized PLS model.');
  }
  return {
    type: model.type,
    coefficients: Float64Array.from(model.coefficients ?? []),
    xMean: Float64Array.from(model.xMean ?? model.x_mean ?? []),
    yMean: Float64Array.from(model.yMean ?? model.y_mean ?? []),
    intercept: model.intercept == null ? null : Float64Array.from(model.intercept),
    n_features: Number(model.n_features),
    n_targets: Number(model.n_targets),
  };
}

function serializeVector(value) {
  if (value == null) return [];
  if (typeof value === 'number') return [value];
  return Array.from(value);
}
