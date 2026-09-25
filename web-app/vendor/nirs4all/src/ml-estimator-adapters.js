/** Optional classical-ML libraries. Numerical work stays in the selected library. */

import { createJsEstimatorController } from './js-estimator-controller.js';

const MLJS_MODELS = Object.freeze({
  RandomForestRegressor: { exportName: 'RandomForestRegression', training: 'train' },
  RandomForestClassifier: { exportName: 'RandomForestClassifier', training: 'train' },
  DecisionTreeRegressor: { exportName: 'DecisionTreeRegression', training: 'train' },
  DecisionTreeClassifier: { exportName: 'DecisionTreeClassifier', training: 'train' },
  KNeighborsClassifier: { exportName: 'KNN', training: 'constructor' },
});

const SCIKITJS_SYNC_MODELS = new Set(['DecisionTreeRegressor', 'DecisionTreeClassifier']);

function normalizeOutput(output, method) {
  if (output && typeof output.then === 'function') {
    return output.then((value) => normalizeOutput(value, method));
  }
  if (output && typeof output.arraySync === 'function') {
    const values = output.arraySync();
    output.dispose?.();
    return values;
  }
  if (output && typeof output.to2DArray === 'function') return output.to2DArray();
  if (ArrayBuffer.isView(output)) return Array.from(output);
  if (!Array.isArray(output)) throw new TypeError(`${method}() must return an array or tensor.`);
  return output;
}

function resolved(name, value) {
  if (typeof value !== 'function') throw new TypeError(`The selected library has no ${name} estimator.`);
  return value;
}

// Worker postMessage/structuredClone strips ml-matrix prototypes from CART
// leaves. ml-cart.load accepts a dense array and rebuilds the matrix itself.
function restoreClassifierLeaves(payload) {
  const restoreNode = (node) => {
    if (!node || typeof node !== 'object') return node;
    const distribution = node.distribution;
    let repaired = distribution;
    if (distribution && !Array.isArray(distribution)
      && typeof distribution.maxRowIndex !== 'function'
      && Number.isInteger(distribution.rows) && Number.isInteger(distribution.columns)
      && Array.isArray(distribution.data)) {
      repaired = distribution.data.map((row) => Array.from(
        { length: distribution.columns }, (_, column) => row[column],
      ));
      if (repaired.length !== distribution.rows
        || repaired.some((row) => row.some((value) => !Number.isFinite(value)))) {
        throw new TypeError('Invalid ml.js classifier leaf distribution.');
      }
    }
    return { ...node, ...(repaired !== distribution ? { distribution: repaired } : {}),
      ...(node.left ? { left: restoreNode(node.left) } : {}),
      ...(node.right ? { right: restoreNode(node.right) } : {}) };
  };
  if (payload?.name === 'RFClassifier') {
    return { ...payload, baseModel: { ...payload.baseModel,
      estimators: payload.baseModel.estimators.map((tree) => ({
        ...tree, root: restoreNode(tree.root),
      })) } };
  }
  if (payload?.name === 'DTClassifier') return { ...payload, root: restoreNode(payload.root) };
  return payload;
}

/** Load the browser-oriented ml.js collection only when a consumer needs it. */
export async function loadMlJs() {
  try {
    return await import('ml');
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw new Error('Install the optional ml package to use ml.js estimators.', { cause: error });
  }
}

/**
 * Scikitjs 1.x needs TensorFlow.js 3.x. Its ESM package has extensionless
 * imports that Node cannot resolve, so Node uses its published CJS entrypoint.
 */
export async function loadScikitJs(tensorflow = null) {
  let sk;
  try {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    sk = isNode ? await import(/* @vite-ignore */ 'scikitjs/node') : await import('scikitjs');
    const tfModule = tensorflow ?? await import('@tensorflow/tfjs');
    sk = sk.default ?? sk;
    sk.setBackend(tfModule.default ?? tfModule);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw new Error('Install optional scikitjs and @tensorflow/tfjs packages.', { cause: error });
  }
  return sk;
}

/** Structural sklearn-style estimator: get/set parameters, fit, predict, transform. */
export function createMlJsEstimator({ ml, estimatorName, params = {} }) {
  const spec = MLJS_MODELS[estimatorName];
  if (!spec) throw new RangeError(`Unsupported ml.js estimator '${estimatorName}'.`);
  const Constructor = resolved(spec.exportName, ml?.[spec.exportName]);
  let options = { ...params };
  let model = null;
  const api = {
    getParams() { return { ...options }; },
    setParams(next) { options = { ...options, ...next }; model = null; return api; },
    clone() { return createMlJsEstimator({ ml, estimatorName, params: options }); },
    fit(X, y) {
      if (spec.training === 'constructor') {
        model = new Constructor(X, y, options);
      } else {
        model = new Constructor(options);
        model.train(X, y);
      }
      return api;
    },
    predict(X) {
      if (!model) throw new Error('Fit or restore this ml.js estimator first.');
      return normalizeOutput(model.predict(X), 'predict');
    },
    toJSON() {
      if (!model) throw new Error('Fit this ml.js estimator before export.');
      return model.toJSON();
    },
    load(payload) { model = Constructor.load(restoreClassifierLeaves(payload)); return api; },
  };
  return api;
}

/** PCA is fitted by its constructor in ml.js; expose a TransformerMixin-like API. */
export function createMlJsPca({ ml, params = {} }) {
  const Constructor = resolved('PCA', ml?.PCA);
  let options = { ...params };
  let model = null;
  const api = {
    getParams() { return { ...options }; },
    setParams(next) { options = { ...options, ...next }; model = null; return api; },
    clone() { return createMlJsPca({ ml, params: options }); },
    fit(X) { model = new Constructor(X, options); return api; },
    transform(X) {
      if (!model) throw new Error('Fit or restore PCA before transform.');
      return normalizeOutput(model.predict(X), 'transform');
    },
    fitTransform(X) { return api.fit(X).transform(X); },
    inverseTransform(X) {
      if (!model) throw new Error('Fit or restore PCA before inverseTransform.');
      return normalizeOutput(model.invert(X), 'inverseTransform');
    },
    toJSON() {
      if (!model) throw new Error('Fit PCA before export.');
      return model.toJSON();
    },
    load(payload) { model = Constructor.load(payload); return api; },
  };
  return api;
}

/** Bind a supported ml.js classifier/regressor to native DAG-ML folds and phases. */
export function createMlJsController({ ml, estimatorName, controllerId, ...options }) {
  if (!ml) throw new TypeError('Load ml.js once with loadMlJs(), then pass the module to this synchronous controller factory.');
  const module = ml;
  if (!MLJS_MODELS[estimatorName]) throw new RangeError(`Unsupported ml.js estimator '${estimatorName}'.`);
  return createJsEstimatorController({
    ...options,
    controllerId: controllerId ?? `controller:mljs.${estimatorName.toLowerCase()}`,
    createEstimator: ({ params, seed }) => {
      const { n_estimators, n_neighbors, ...rest } = params;
      return createMlJsEstimator({
        ml: module, estimatorName,
        params: {
          ...rest,
          ...(n_estimators == null ? {} : { nEstimators: n_estimators }),
          ...(n_neighbors == null ? {} : { k: n_neighbors }),
          seed,
        },
      });
    },
    restoreEstimator: (payload) => createMlJsEstimator({ ml: module, estimatorName }).load(payload),
  });
}

/**
 * Scikitjs host facade. Its sync and async estimators keep their own fit
 * semantics; output tensors are converted to arrays at the JS boundary.
 */
export function createScikitJsEstimator({ scikitJs, estimatorName, params = {} }) {
  const Constructor = resolved(estimatorName, scikitJs?.[estimatorName]);
  let options = { ...params };
  let model = new Constructor(options);
  const api = {
    getParams() { return { ...options }; },
    setParams(next) { options = { ...options, ...next }; model = new Constructor(options); return api; },
    clone() { return createScikitJsEstimator({ scikitJs, estimatorName, params: options }); },
    fit(X, y) {
      const result = model.fit(X, y);
      return result && typeof result.then === 'function' ? result.then(() => api) : api;
    },
    predict(X) {
      if (typeof model.predict !== 'function') throw new TypeError(`${estimatorName} has no predict().`);
      return normalizeOutput(model.predict(X), 'predict');
    },
    transform(X) {
      if (typeof model.transform !== 'function') throw new TypeError(`${estimatorName} has no transform().`);
      return normalizeOutput(model.transform(X), 'transform');
    },
    fitTransform(X, y) {
      const trained = api.fit(X, y);
      return trained && typeof trained.then === 'function'
        ? trained.then(() => api.transform(X)) : api.transform(X);
    },
    toJSON() { return model.toJSON(); },
    async load(payload) { model = await scikitJs.fromJSON(payload); return api; },
  };
  return api;
}

/** Only synchronous scikitjs estimators can enter DAG-ML's current WASM callback. */
export function createScikitJsController({ scikitJs, estimatorName, controllerId, ...options }) {
  if (!SCIKITJS_SYNC_MODELS.has(estimatorName)) {
    throw new RangeError(`${estimatorName} cannot use the synchronous DAG-ML WASM callback; use the scikitjs host estimator API.`);
  }
  if (!scikitJs) throw new TypeError('Load scikitjs once with loadScikitJs(), then pass the module to this synchronous controller factory.');
  const module = scikitJs;
  return createJsEstimatorController({
    ...options,
    controllerId: controllerId ?? `controller:scikitjs.${estimatorName.toLowerCase()}`,
    createEstimator: ({ params, seed }) => createScikitJsEstimator({
      scikitJs: module, estimatorName, params: { ...params, randomState: seed },
    }),
    restoreEstimator: (payload) => createScikitJsEstimator({ scikitJs: module, estimatorName }).load(payload),
  });
}
