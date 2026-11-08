import { loadMethodsWasm } from './index.js';

let archiveNativePromise = null;

/** Load the Core-owned Archive V2 validator compiled from Rust to WASM. */
export async function loadArchiveV2Native() {
  if (!archiveNativePromise) {
    archiveNativePromise = (async () => {
      const module = await import('../native/nirs4all_core_wasm_native.js');
      if (typeof process !== 'undefined' && process?.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(new URL(
          '../native/nirs4all_core_wasm_native_bg.wasm',
          import.meta.url,
        ));
        await module.default({ module_or_path: bytes });
      } else {
        await module.default();
      }
      return module;
    })();
  }
  return archiveNativePromise;
}

/**
 * Read a native Package V2/V3 container through Core's native validator.
 *
 * Core validates the owner-neutral V1 container and the selected native
 * scientific closure (owner, content type, profile, operation, links and fitted
 * states). `package` is the exact root package bytes (a Uint8Array) and
 * `members` holds only the selected verified physical closure. There is no
 * physical-manifest replay map: do not pass this result to an old DAG
 * physical-manifest validator. `trainingOutcome` is the exact outcome evidence
 * of a Package V2 and `null` for a standalone Package V3 child. Only an optional
 * host-authorized working-memory budget bounds the call.
 *
 * @param {ArrayBuffer|ArrayBufferView} archiveBytes
 * @param {{entrypoint?: string, memoryBudgetBytes?: number|bigint}} [options]
 */
export async function readPortableArchiveV2(archiveBytes, options = {}) {
  const bytes = bytesView(archiveBytes, 'native package container');
  const native = await loadArchiveV2Native();
  if (typeof native?.ValidatedPortableArchiveV2?.with_entrypoint !== 'function') {
    throw new TypeError('Core lacks the native package inventory bridge.');
  }
  const archive = native.ValidatedPortableArchiveV2.with_entrypoint(
    bytes, entrypointOption(options), budgetOption(options),
  );
  try {
    const members = Object.create(null);
    for (const path of JSON.parse(archive.member_paths_json())) {
      members[path] = archive.member_bytes(path);
    }
    const view = deepFreeze(JSON.parse(archive.view_json()));
    return Object.freeze({
      archiveId: archive.archive_id,
      archiveSha256: archive.archive_sha256,
      manifest: deepFreeze(JSON.parse(archive.manifest_json())),
      members: Object.freeze(members),
      package: archive.package_bytes(),
      trainingOutcome: view.package_schema_version === 2 ? archive.training_outcome_bytes() : null,
      view,
    });
  } finally {
    archive.free();
  }
}

/**
 * Build a NEW native Package V2 container (owner-neutral Core V1 bytes) from the
 * exact TrainingOutcome and PortablePredictorPackage V2 JSON bytes. Core builds
 * the native scientific closure through DAG-ML.
 */
export async function writeNativePredictorPackage(containerId, outcomeBytes, packageBytes, options = {}) {
  const native = await loadArchiveV2Native();
  if (typeof native?.write_native_predictor_package_bytes !== 'function') {
    throw new TypeError('Core lacks the native Package V2 writer bridge.');
  }
  return native.write_native_predictor_package_bytes(
    containerIdText(containerId),
    bytesView(outcomeBytes, 'TrainingOutcome JSON'),
    bytesView(packageBytes, 'Package V2 JSON'),
    budgetOption(options),
  );
}

/**
 * Calibrate by immutable-base carry: Core admits `calibrate-external` on the verified original
 * container `baseBytes` (the optional `entrypoint` names a calibration entrypoint, never a predict
 * one; omitted, Core selects the unique calibration operation), keeps every unrelated byte,
 * identity, link and entrypoint, and refuses rebinding of a retained reference or any fitted-state
 * change. `outcomeBytes`/`packageBytes` are the exact UTF-8 JSON of the calibrated outcome and package.
 * Never a fresh writer.
 */
export async function calibrateNativePackage(baseBytes, outcomeBytes, packageBytes, containerId, options = {}) {
  const native = await loadArchiveV2Native();
  if (typeof native?.calibrate_native_package_bytes !== 'function') {
    throw new TypeError('Core lacks the native package calibration carry bridge.');
  }
  return native.calibrate_native_package_bytes(
    bytesView(baseBytes, 'base native package container'),
    entrypointOption(options),
    bytesView(outcomeBytes, 'calibrated TrainingOutcome JSON'),
    bytesView(packageBytes, 'calibrated Package V2 JSON'),
    containerIdText(containerId),
    budgetOption(options),
  );
}

/**
 * Build a NEW native Package V3 container (storage and inspection only; WASM
 * execution of Package V3 is refused) from the exact PortableRefitPackage V3 JSON
 * bytes. No parent outcome, refit-of link or score is invented.
 */
export async function writeNativeRefitPackage(containerId, packageBytes, options = {}) {
  const native = await loadArchiveV2Native();
  if (typeof native?.write_native_refit_package_bytes !== 'function') {
    throw new TypeError('Core lacks the native Package V3 writer bridge.');
  }
  return native.write_native_refit_package_bytes(
    containerIdText(containerId),
    bytesView(packageBytes, 'Package V3 JSON'),
    budgetOption(options),
  );
}

/**
 * Replay the Methods-only Package V2 contract through libn4m WASM.
 *
 * Core Rust/WASM validates the owner-neutral container and the selected native
 * closure, including the DAG-ML package, before releasing opaque N4MM bytes. This JavaScript layer only validates host
 * arrays, marshals them into the public Methods C ABI and shapes the returned
 * multi-target result. It contains no estimator or prediction implementation.
 */
export async function replayMethodsArchiveV2(archiveBytes, dataset, options = {}) {
  const bytes = bytesView(archiveBytes, 'native package container');
  const input = features(dataset);
  const archiveNative = await loadArchiveV2Native();
  if (typeof archiveNative?.ValidatedMethodsArchiveV2?.with_entrypoint !== 'function') {
    throw new TypeError('Archive V2 native validator is unavailable or incompatible.');
  }

  // The native constructor validates the selected closure before any package/model byte is exposed.
  const archive = archiveNative.ValidatedMethodsArchiveV2.with_entrypoint(
    bytes, entrypointOption(options), budgetOption(options),
  );
  try {
    const targetNames = JSON.parse(archive.target_names_json());
    if (!Array.isArray(targetNames) || targetNames.length === 0
      || new Set(targetNames).size !== targetNames.length
      || targetNames.some((name) => typeof name !== 'string' || name.length === 0
        || /[\u0000-\u001f\u007f]/.test(name))) {
      throw new Error('Archive V2 target names must be distinct non-empty strings without control characters.');
    }
    const methods = options.methods ?? await loadMethodsWasm();
    if (typeof methods.loadModule === 'function') {
      await methods.loadModule();
    }
    const modelBytes = archive.model_bytes();
    const nativePredictorDescriptor = bindNativePredictorDescriptor(
      methods,
      archive,
      modelBytes,
    );
    const predicted = predictN4mm(
      methods,
      modelBytes,
      input,
      targetNames.length,
      archive.abi_min_minor,
      nativePredictorDescriptor,
    );
    return Object.freeze({
      schema: 'nirs4all.core.archive-v2-replay.v1',
      engine: 'nirs4all-methods-wasm',
      fallback: false,
      archiveId: archive.archive_id,
      archiveSha256: archive.archive_sha256,
      artifactId: archive.artifact_id,
      bindingId: archive.binding_id,
      nodeId: archive.node_id,
      portName: archive.port_name,
      nativePredictorDescriptor,
      sampleIds: Object.freeze([...input.sampleIds]),
      targetNames: Object.freeze([...targetNames]),
      data: Object.freeze(Array.from(predicted.data)),
      rows: predicted.rows,
      cols: predicted.cols,
    });
  } finally {
    archive.free();
  }
}

/**
 * Inspect and expose the native predictor descriptor without running predict.
 *
 * Historical Archive V2 packages without an embedded descriptor are accepted:
 * the result is derived from their inventoried N4MM bytes. New packages are
 * refused unless their embedded DAG-ML descriptor matches the same inspection.
 */
export async function inspectMethodsArchiveV2Predictors(archiveBytes, options = {}) {
  const bytes = bytesView(archiveBytes, 'native package container');
  const archiveNative = await loadArchiveV2Native();
  if (typeof archiveNative?.ValidatedMethodsArchiveV2?.with_entrypoint !== 'function') {
    throw new TypeError('Archive V2 native validator is unavailable or incompatible.');
  }
  const archive = archiveNative.ValidatedMethodsArchiveV2.with_entrypoint(
    bytes, entrypointOption(options), budgetOption(options),
  );
  try {
    const methods = await loadMethodsWasm();
    if (typeof methods.loadModule === 'function') {
      await methods.loadModule();
    }
    return Object.freeze([
      bindNativePredictorDescriptor(methods, archive, archive.model_bytes()),
    ]);
  } finally {
    archive.free();
  }
}

function bindNativePredictorDescriptor(methods, archive, modelBytes) {
  if (typeof methods?.inspectN4mm !== 'function') {
    throw new TypeError('Methods WASM lacks authoritative N4MM inspection.');
  }
  const info = methods.inspectN4mm(bytesView(modelBytes, 'N4MM model'));
  const pipeline = info.pipeline;
  const json = archive.bind_inspected_native_predictor_v1(
    info.schemaVersion,
    info.formatVersion,
    info.writerAbi[0],
    info.writerAbi[1],
    info.writerAbi[2],
    info.algorithm,
    info.trainingSamples,
    info.nFeatures,
    info.nTargets,
    info.nComponents,
    info.capabilities,
    pipeline !== null,
    pipeline?.schemaVersion ?? 0,
    pipeline?.operatorCount ?? 0,
    pipeline?.operators?.[0] ?? 0,
    pipeline?.operators?.[1] ?? 0,
    pipeline?.savgolWindow ?? 0,
    pipeline?.savgolPolyDegree ?? 0,
    pipeline?.savgolDerivative ?? 0,
    pipeline?.semanticProfile ?? 0,
    pipeline?.savgolDelta ?? 0,
    pipeline?.rawNFeatures ?? 0,
    pipeline?.modelNFeatures ?? 0,
    pipeline?.fingerprintAlgorithm ?? 0,
    pipeline?.fingerprint ?? 0n,
    pipeline?.snvAxis ?? 0,
    pipeline?.snvWithMean ?? false,
    pipeline?.snvWithStd ?? false,
    pipeline?.snvDdof ?? 0,
    pipeline?.savgolMode ?? 0,
    pipeline?.savgolCval ?? 0,
  );
  const descriptor = JSON.parse(json);
  Object.freeze(descriptor.writer_abi);
  Object.freeze(descriptor.dimensions);
  return Object.freeze(descriptor);
}

function predictN4mm(
  methods,
  modelBytes,
  input,
  expectedTargets,
  abiMinMinor,
  nativePredictorDescriptor,
) {
  const required = ['abiVersion', 'Context', 'getModule', 'makeMatrixView', 'readArrayView'];
  const missing = required.filter((key) => methods?.[key] == null);
  if (missing.length > 0) {
    throw new TypeError(`Methods WASM lacks Archive V2 ABI helpers: ${missing.join(', ')}.`);
  }
  const abi = methods.abiVersion();
  if (!Number.isInteger(abiMinMinor) || abiMinMinor < 0
    || !Array.isArray(abi) || abi[0] !== 2
    || !Number.isInteger(abi[1]) || abi[1] < abiMinMinor) {
    throw new Error(
      `Archive V2 requires Methods ABI 2.${String(abiMinMinor)} or newer within major 2; received ${String(abi)}.`,
    );
  }
  const module = methods.getModule();
  const context = methods.Context.create();
  const raw = bytesView(modelBytes, 'N4MM model');
  let modelBuffer = 0;
  let modelOut = 0;
  let model = 0;
  let output = 0;
  let matrix = null;
  try {
    modelBuffer = allocate(module, Math.max(1, raw.byteLength), 'N4MM input');
    modelOut = allocate(module, 4, 'N4MM model handle');
    module.HEAPU8.set(raw, modelBuffer);
    module.setValue(modelOut, 0, 'i32');
    checkStatus(module, context.handle, module.ccall(
      'n4m_model_import_from_buffer',
      'number',
      ['number', 'number', 'number', 'number'],
      [context.handle, modelBuffer, raw.byteLength, modelOut],
    ), 'N4MM import');
    model = module.getValue(modelOut, 'i32');
    if (!Number.isInteger(model) || model === 0) {
      throw new Error('Methods returned a null model for validated N4MM bytes.');
    }

    const nFeatures = modelDimension(module, model, 'n4m_model_get_n_features', 'features');
    const nTargets = modelDimension(module, model, 'n4m_model_get_n_targets', 'targets');
    if (nativePredictorDescriptor.dimensions.n_features !== nFeatures
      || nativePredictorDescriptor.dimensions.n_targets !== nTargets) {
      throw new Error('Imported N4MM dimensions differ from its native predictor descriptor.');
    }
    if (nativePredictorDescriptor.dimensions.n_features !== input.cols) {
      throw new RangeError(`Archive model expects ${nFeatures} features; received ${input.cols}.`);
    }
    if (nativePredictorDescriptor.dimensions.n_targets !== expectedTargets) {
      throw new RangeError(
        `Archive output binding declares ${expectedTargets} targets; N4MM contains ${nTargets}.`,
      );
    }
    const outputCells = input.rows * nTargets;
    if (!Number.isSafeInteger(outputCells)) {
      throw new RangeError('Archive V2 prediction shape exceeds the safe integer range.');
    }

    matrix = methods.makeMatrixView(input.X, input.rows, input.cols);
    const outputOut = allocate(module, 4, 'N4MM prediction handle');
    try {
      module.setValue(outputOut, 0, 'i32');
      checkStatus(module, context.handle, module.ccall(
        'n4m_model_predict_alloc',
        'number',
        ['number', 'number', 'number', 'number'],
        [context.handle, model, matrix.viewPtr, outputOut],
      ), 'N4MM prediction');
      output = module.getValue(outputOut, 'i32');
    } finally {
      module._free(outputOut);
    }
    if (!Number.isInteger(output) || output === 0) {
      throw new Error('Methods returned a null prediction array.');
    }
    const result = methods.readArrayView(output);
    if (result.rows !== input.rows || result.cols !== expectedTargets
      || result.data.length !== input.rows * expectedTargets
      || hasNonFinite(result.data)) {
      throw new Error('Methods returned an invalid or non-finite multi-target prediction matrix.');
    }
    return result;
  } finally {
    if (output !== 0) {
      module.ccall('n4m_array_free', null, ['number'], [output]);
    }
    matrix?.free();
    if (model !== 0) {
      module.ccall('n4m_model_destroy', null, ['number'], [model]);
    }
    if (modelOut !== 0) module._free(modelOut);
    if (modelBuffer !== 0) module._free(modelBuffer);
    context.destroy();
  }
}

function modelDimension(module, model, symbol, label) {
  const output = allocate(module, 4, `N4MM ${label}`);
  try {
    module.setValue(output, 0, 'i32');
    checkStatus(module, 0, module.ccall(
      symbol,
      'number',
      ['number', 'number'],
      [model, output],
    ), `N4MM ${label}`);
    const value = module.getValue(output, 'i32');
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Methods returned invalid N4MM ${label}: ${value}.`);
    }
    return value;
  } finally {
    module._free(output);
  }
}

function allocate(module, bytes, label) {
  const pointer = module._malloc(bytes);
  if (!Number.isInteger(pointer) || pointer === 0) {
    throw new Error(`Methods could not allocate ${label}.`);
  }
  return pointer;
}

function checkStatus(module, context, status, label) {
  if (status === 0) return;
  let detail = '';
  if (context !== 0) {
    const pointer = module.ccall(
      'n4m_context_last_error', 'number', ['number'], [context],
    );
    if (pointer !== 0) detail = module.UTF8ToString(pointer);
  }
  if (!detail) {
    const pointer = module.ccall('n4m_status_to_string', 'number', ['number'], [status]);
    if (pointer !== 0) detail = module.UTF8ToString(pointer);
  }
  throw new Error(`${label} failed with Methods status ${status}${detail ? `: ${detail}` : ''}.`);
}

function features(dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
    throw new TypeError('Archive V2 replay requires a feature dataset object.');
  }
  const allowed = new Set(['X', 'rows', 'cols', 'n_samples', 'n_features', 'sampleIds', 'sample_ids']);
  const unknown = Object.keys(dataset).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`Archive V2 replay dataset has unknown fields: ${unknown.join(', ')}.`);
  }
  const rows = Number(dataset.rows ?? dataset.n_samples);
  const cols = Number(dataset.cols ?? dataset.n_features);
  if (!Number.isSafeInteger(rows) || rows <= 0
    || !Number.isSafeInteger(cols) || cols <= 0
    || !Number.isSafeInteger(rows * cols)) {
    throw new RangeError('Archive V2 replay shape requires positive safe integer dimensions and cell count.');
  }
  const X = numericMatrix(dataset.X, rows, cols);
  const supplied = dataset.sampleIds ?? dataset.sample_ids;
  if (supplied != null && (!Array.isArray(supplied) || supplied.length !== rows)) {
    throw new TypeError('Archive V2 sample IDs must be an array matching the row count.');
  }
  const sampleIds = supplied == null
    ? Array.from({ length: rows }, (_, index) => `sample.${index}`)
    : supplied.slice();
  if (new Set(sampleIds).size !== rows
    || sampleIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128
      || !/^[A-Za-z0-9_.:-]+$/.test(id))) {
    throw new TypeError('Archive V2 sample IDs must be distinct bounded identity strings.');
  }
  return { X, rows, cols, sampleIds };
}

function numericMatrix(value, rows, cols) {
  const expected = rows * cols;
  let result;
  if (value instanceof Float64Array) {
    if (value.length !== expected) {
      throw new RangeError('Archive V2 feature matrix shape or finite-value contract is invalid.');
    }
    result = new Float64Array(value);
  } else if (Array.isArray(value) && value.length === rows && value.every(Array.isArray)) {
    if (value.some((row) => row.length !== cols)) {
      throw new RangeError('Archive V2 feature matrix is ragged.');
    }
    result = Float64Array.from(value.flat());
  } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (!Number.isInteger(value.length) || value.length !== expected) {
      throw new RangeError('Archive V2 feature matrix shape or finite-value contract is invalid.');
    }
    result = Float64Array.from(value);
  } else {
    throw new TypeError('Archive V2 feature matrix must be numeric array data.');
  }
  if (result.length !== expected || hasNonFinite(result)) {
    throw new RangeError('Archive V2 feature matrix shape or finite-value contract is invalid.');
  }
  return result;
}

function hasNonFinite(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) return true;
  }
  return false;
}

function entrypointOption(options) {
  const entrypoint = options?.entrypoint;
  if (entrypoint === undefined || entrypoint === null) return undefined;
  if (typeof entrypoint !== 'string' || entrypoint.length === 0) {
    throw new TypeError('entrypoint must be a non-empty string when supplied.');
  }
  return entrypoint;
}

/** The only bound on a call is the host-authorized working-memory budget (BigInt for Core's u64). */
function budgetOption(options) {
  const budget = options?.memoryBudgetBytes;
  if (budget === undefined || budget === null) return undefined;
  if ((typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0)
    && (typeof budget !== 'bigint' || budget < 0n)) {
    throw new TypeError('memoryBudgetBytes must be a non-negative integer when supplied.');
  }
  return BigInt(budget);
}

function containerIdText(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('A native package container id must be a non-empty string.');
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function bytesView(value, label) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`${label} must be an ArrayBuffer or byte view.`);
}
