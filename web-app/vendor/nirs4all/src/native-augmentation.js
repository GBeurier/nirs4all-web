export const NATIVE_X_AUGMENTATION_CLASS = 'n4m.NativeXAugmentation';

// This closed table mirrors Methods ABI 2.11. The public definition uses the
// R binding's snake_case names; Methods JS uses PascalCase and positional values.
const KINDS = Object.freeze({
  gaussian_noise: ['GaussianNoise', 1],
  multiplicative_noise: ['MultiplicativeNoise', 1],
  spike_noise: ['SpikeNoise', 4],
  hetero_noise: ['HeteroNoise', 2],
  linear_drift: ['LinearDrift', 4],
  path_length: ['PathLength', 2],
  band_perturb: ['BandPerturb', 7],
  band_mask: ['BandMask', 5],
  channel_dropout: ['ChannelDropout', 2],
  gauss_jitter: ['GaussJitter', 3],
  unsharp_mask: ['UnsharpMask', 4],
  local_clip: ['LocalClip', 3],
  rotate_translate: ['RotateTranslate', 2],
  random_x_op: ['RandomXOp', 3],
  scatter_sim_msc: ['ScatterSimMSC', 4],
  dead_band: ['DeadBand', 6],
  batch_effect: ['BatchEffect', 4],
  spline_smoothing: ['SplineSmoothing', 0],
  spline_x_perturb: ['SplineXPerturb', 4],
  spline_y_perturb: ['SplineYPerturb', 2],
  spline_x_simplify: ['SplineXSimplify', 2],
  spline_curve_simplify: ['SplineCurveSimplify', 2],
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label} does not support '${key}'.`);
    }
  }
}

export function parseTrainAugmentation(step) {
  if (!record(step) || !record(step.train_augmentation)) {
    throw new TypeError('train_augmentation must be a mapping object.');
  }
  onlyKeys(step, ['train_augmentation'], 'train_augmentation step');
  const spec = step.train_augmentation;
  onlyKeys(spec, ['class', 'params'], 'train_augmentation');
  if (spec.class !== NATIVE_X_AUGMENTATION_CLASS || !record(spec.params)) {
    throw new Error('train_augmentation requires class n4m.NativeXAugmentation and params.');
  }
  const params = spec.params;
  onlyKeys(params, ['kind', 'values', 'seed'], 'train_augmentation params');
  const entry = Object.prototype.hasOwnProperty.call(KINDS, params.kind) ? KINDS[params.kind] : null;
  if (!entry) {
    throw new Error(`Unsupported native X augmentation kind '${String(params.kind)}'.`);
  }
  if (!Array.isArray(params.values) || params.values.length !== entry[1]
      || !params.values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`${params.kind} requires ${entry[1]} finite positional values.`);
  }
  if (!Number.isSafeInteger(params.seed) || params.seed < 0) {
    throw new Error('train_augmentation seed must be a nonnegative safe integer.');
  }
  return { kind: params.kind, methodsKind: entry[0], values: [...params.values], seed: params.seed };
}
