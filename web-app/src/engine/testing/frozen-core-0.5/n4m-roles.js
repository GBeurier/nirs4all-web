// Generic n4m role recipes and trained envelopes (nirs4all.n4m.trained_pipeline.v8).
//
// A recipe step is the language-neutral token "n4m:<catalog method id>" (or
// {class: "n4m:<id>", params}), resolved through the @nirs4all/methods
// manifest. The recipe runs in the native role pipeline of Methods
// (RolePipeline, ABI 2.14), which validates the recipe, routes every target
// column to the steps that need it, keeps filters on the training rows, checks
// the input column names and refuses states that contradict the recipe. This
// module only reads and writes the JSON envelope shared with the Python, R and
// Rust bindings: schema, recipe, n_features, feature_names (when the fit had
// names) and, per stateful step, method_id, n4me_base64, sha256,
// contains_training_rows and class_names (classifier trained on label names).
// Envelopes written before feature_names / contains_training_rows still load.
//
// Every input this module reshapes or reads is checked here before it reaches
// the native pipeline: nested X and Y rows must match the declared shape,
// n_features is a positive JSON integer equal to the native width, column
// names hold no NUL character, and class_names is a non-empty table of unique
// strings or finite numbers that labels every fitted class id (index = id; it
// may keep labels a sample filter removed). The recipe is snapshotted at fit
// and import, so the exported recipe is the one the states attest.

import { coerceFeatures } from './execution.js';
import { loadMethodsWasm } from './index.js';

export const N4M_ROLE_PREFIX = 'n4m:';
export const N4M_TRAINED_PIPELINE_SCHEMA = 'nirs4all.n4m.trained_pipeline.v8';

const RECIPE_ROLES = new Set(['sample_filter', 'transformer', 'selector', 'regressor', 'classifier']);

/** Catalog method id of an "n4m:<id>" class name, else null. */
export function n4mRoleMethodId(name) {
  return typeof name === 'string' && name.startsWith(N4M_ROLE_PREFIX) ? name.slice(N4M_ROLE_PREFIX.length) : null;
}

/** True when an "n4m:<id>" class name resolves to a Methods role class. */
export function resolvesN4mRole(name, methods) {
  const methodId = n4mRoleMethodId(name);
  if (methodId === null || typeof methods?.methodClass !== 'function') return false;
  try {
    methods.methodClass(methodId);
    return true;
  } catch {
    return false;
  }
}

/** Manifest-derived recipe steps: every Methods estimator usable in a role recipe. */
export async function n4mRoleCapabilities(options = {}) {
  const methods = await readyMethods(options);
  return methods.manifest().methods
    .filter((item) => item.kind === 'estimator' && item.roles.some((role) => RECIPE_ROLES.has(role)))
    .map((item) => ({
      token: N4M_ROLE_PREFIX + item.method_id,
      methodId: item.method_id,
      roles: [...item.roles],
      nodeKinds: [...item.node_kinds],
      parameters: item.params.map((param) => param.name),
    }));
}

/** A fitted recipe of n4m role steps, portable as N4ME states (envelope v8). */
export class N4mRolePipeline {
  #recipe;
  #digests;

  constructor(recipe, pipeline, digests) {
    this.#recipe = clone(recipe);
    /** The fitted Methods RolePipeline (transform, decisionFunction, predictProba, stepsInfo). */
    this.pipeline = pipeline;
    this.#digests = digests;
  }

  /** The recipe of the fitted states (a copy: editing it changes neither the model nor its export). */
  get recipe() {
    return clone(this.#recipe);
  }

  /** Input width. */
  get nFeatures() {
    return this.pipeline.stepsInfo().find((step) => step.stateIndex >= 0).nFeaturesIn;
  }

  /** Fitted input column names, in order (undefined: positional input). */
  get featureNames() {
    return this.pipeline.featureNames;
  }

  /**
   * Fits `recipe` natively on `dataset` ({X, y, rows, cols, featureNames?}): y holds the
   * responses of a final regressor (a vector, or one row of targets per sample) or the
   * labels of a final classifier.
   */
  static async fit(recipe, dataset, options = {}) {
    const methods = await readyMethods(options);
    const attested = clone(recipe);
    const X = coerceFeatures(dataset);
    checkColumnNames(dataset.featureNames);
    const y = fitTarget(dataset.y, X.rows);
    const pipeline = methods.RolePipeline.fromSteps(recipeSteps(attested));
    try {
      pipeline.fit(X, y, { featureNames: dataset.featureNames });
      return await N4mRolePipeline.#wrap(attested, pipeline);
    } catch (error) {
      pipeline.dispose();
      throw error;
    }
  }

  /** Rebuilds the fitted pipeline of a v8 envelope (object or JSON text) from its N4ME states. */
  static async fromJSON(source, options = {}) {
    const methods = await readyMethods(options);
    const envelope = typeof source === 'string' ? JSON.parse(source) : source;
    if (!envelope || typeof envelope !== 'object' || envelope.schema !== N4M_TRAINED_PIPELINE_SCHEMA) {
      throw new Error('Unsupported trained n4m pipeline envelope.');
    }
    const nFeatures = envelope.n_features;
    if (!Number.isInteger(nFeatures) || nFeatures <= 0) {
      throw new TypeError(`n_features must be a positive JSON integer, got ${JSON.stringify(nFeatures)}.`);
    }
    const states = Array.isArray(envelope.states) ? envelope.states : [];
    const payloads = [];
    for (const state of states) {
      const payload = base64ToBytes(state.n4me_base64);
      if (await sha256Hex(payload) !== state.sha256) {
        throw new Error(`N4ME state of ${state.method_id} fails its checksum.`);
      }
      payloads.push(payload);
    }
    const featureNames = envelope.feature_names;
    if (featureNames !== undefined && !(Array.isArray(featureNames) && featureNames.every((name) => typeof name === 'string'))) {
      throw new TypeError('feature_names must be an array of strings.');
    }
    checkColumnNames(featureNames);
    const last = states.at(-1);
    const classNames = last !== undefined && 'class_names' in last ? last.class_names : undefined;
    if (classNames !== undefined) checkLabelTable(classNames);
    const recipe = clone(envelope.recipe);
    const steps = recipeSteps(recipe);
    let pipeline = methods.RolePipeline.fromStates(steps, payloads, { featureNames });
    try {
      const fitted = pipeline.stepsInfo().filter((step) => step.stateIndex >= 0);
      fitted.forEach((step, i) => {
        const state = states[i];
        if (state.method_id !== step.methodId) {
          throw new Error(`N4ME state ${state.method_id} does not match its recipe step.`);
        }
        if ((state.contains_training_rows ?? step.containsTrainingRows) !== step.containsTrainingRows) {
          throw new Error(`contains_training_rows of ${state.method_id} contradicts its N4ME state.`);
        }
      });
      if (nFeatures !== fitted[0].nFeaturesIn) {
        throw new RangeError(`n_features is ${nFeatures} but the states take ${fitted[0].nFeaturesIn} columns.`);
      }
      if (classNames !== undefined) {
        if (pipeline.stepsInfo().at(-1).role !== 'classifier') {
          throw new Error('class_names label the classes of a final classifier.');
        }
        for (const classId of pipeline.classes()) {
          if (!(classId >= 0 && classId < classNames.length)) {
            throw new RangeError(`class id ${classId} has no entry in class_names (${classNames.length} labels).`);
          }
        }
        const labelled = methods.RolePipeline.fromStates(steps, payloads, { featureNames, classNames });
        pipeline.dispose();
        pipeline = labelled;
      }
      return await N4mRolePipeline.#wrap(recipe, pipeline);
    } catch (error) {
      pipeline.dispose();
      throw error;
    }
  }

  /**
   * The v8 envelope (JSON.stringify(pipeline) writes it). A state that embeds training
   * rows (kernel PLS, LW-PLS, ...) is refused unless `allowTrainingRows` is set.
   */
  toJSON(options) {
    const allowTrainingRows = options?.allowTrainingRows === true; // JSON.stringify passes a key string
    const states = this.pipeline.exportStates({ allowTrainingRows }).map((state) => {
      const n4meBase64 = bytesToBase64(state.n4me);
      return {
        method_id: state.methodId,
        n4me_base64: n4meBase64,
        sha256: this.#digests.get(n4meBase64),
        contains_training_rows: state.containsTrainingRows,
      };
    });
    // Classifier label names (N4ME holds integer class ids only): the facade's label table.
    const classNames = this.pipeline.labelNames();
    if (classNames !== undefined) states.at(-1).class_names = [...classNames];
    const envelope = { schema: N4M_TRAINED_PIPELINE_SCHEMA, recipe: this.recipe, n_features: this.nFeatures };
    if (this.featureNames !== undefined) envelope.feature_names = this.featureNames;
    envelope.states = states;
    return envelope;
  }

  /**
   * Predictions of the final model: {data, rows, cols} for a regressor, {labels, rows}
   * (class names, or ids when trained on integer labels) for a classifier. With
   * `dataset.featureNames`, renamed or reordered columns are refused.
   */
  predict(dataset) {
    const X = coerceFeatures(dataset);
    checkColumnNames(dataset.featureNames);
    if (this.pipeline.stepsInfo().at(-1).role === 'classifier') {
      return { labels: this.pipeline.predictLabels(X, dataset.featureNames), rows: X.rows };
    }
    const predicted = this.pipeline.predict(X, dataset.featureNames);
    return { data: Array.from(predicted.data), rows: predicted.rows, cols: predicted.cols };
  }

  /** Fits the same recipe afresh on new training rows. */
  retrain(dataset, options = {}) {
    return N4mRolePipeline.fit(this.#recipe, dataset, options);
  }

  /** Releases the native pipeline. */
  dispose() {
    this.pipeline.dispose();
  }

  // The SHA-256 of every state is computed once here (WebCrypto is asynchronous), so
  // that toJSON stays synchronous; the exported bytes are deterministic.
  static async #wrap(recipe, pipeline) {
    const digests = new Map();
    for (const state of pipeline.exportStates({ allowTrainingRows: true })) {
      digests.set(bytesToBase64(state.n4me), await sha256Hex(state.n4me));
    }
    return new N4mRolePipeline(recipe, pipeline, digests);
  }
}

async function readyMethods(options) {
  const methods = options.methods ?? await loadMethodsWasm();
  if (typeof methods.loadModule === 'function') {
    await methods.loadModule();
  }
  return methods;
}

function recipeSteps(recipe) {
  const pipeline = recipe?.pipeline;
  if (!Array.isArray(pipeline)) {
    throw new TypeError('An n4m role recipe is {pipeline: [n4m:<method id> steps]}.');
  }
  for (const token of pipeline) {
    if (n4mRoleMethodId(token && typeof token === 'object' ? token.class : token) === null) {
      throw new Error(`n4m role recipes contain n4m:<method id> steps only, got ${JSON.stringify(token)}.`);
    }
  }
  return pipeline;
}

// One row of targets per sample becomes a row-major response matrix once every row is
// checked; vectors and labels pass as they are (Methods checks their length).
function fitTarget(y, rows) {
  if (!(Array.isArray(y) && Array.isArray(y[0]))) return y;
  const cols = y[0].length;
  if (y.length !== rows) {
    throw new RangeError(`y has ${y.length} rows but X has ${rows}.`);
  }
  if (cols === 0) throw new RangeError('y rows must hold at least one target.');
  y.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new RangeError(`y row ${r} has ${row?.length} targets but row 0 has ${cols}.`);
    }
  });
  return { data: Float64Array.from(y.flat()), rows, cols };
}

// Column names reach the native pipeline as C strings: refuse NUL first.
function checkColumnNames(names) {
  for (const name of names ?? []) {
    if (typeof name === 'string' && name.includes('\0')) {
      throw new TypeError(`column name ${JSON.stringify(name)} contains a NUL character.`);
    }
  }
}

// A label table (index = class id): non-empty, unique, all strings or all finite numbers.
function checkLabelTable(names) {
  if (!Array.isArray(names) || names.length === 0) {
    throw new TypeError('class_names must be a non-empty list of labels.');
  }
  const seen = new Set();
  for (const name of names) {
    if (typeof name !== 'string' && !(typeof name === 'number' && Number.isFinite(name))) {
      throw new TypeError(`class label ${String(name)} is not a string or a finite number.`);
    }
    if (seen.has(name)) throw new TypeError(`class label ${JSON.stringify(name)} is duplicated.`);
    seen.add(name);
  }
  if (new Set(names.map((name) => typeof name)).size > 1) {
    throw new TypeError('class_names mixes strings and numbers.');
  }
  const inexact = names.find((name) => Number.isInteger(name) && Math.abs(name) > 2 ** 53);
  if (inexact !== undefined) {
    throw new RangeError(`class label ${inexact} is not exactly representable as float64 (beyond ±2^53).`);
  }
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  if (typeof text !== 'string') throw new TypeError('n4me_base64 must be a base64 string.');
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
