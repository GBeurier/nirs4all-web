/**
 * Host-owned JavaScript models for the multimodal laboratory, behind the
 * native DAG-ML source controller.
 *
 * DAG-ML still owns folds, OOF predictions, refit and replay; Methods still
 * owns every source transform. Only the final model of a branch can be a host
 * model: a random forest (ml.js, via the Core classic-ml adapter) or a CNN
 * trained with TensorFlow.js. They are browser-only models (no Python/R
 * equivalent, no portable Methods state); the maintainer accepted this
 * exception for the training laboratory.
 */
import { summarizeAomFit, type AomSelection } from '../engine/aomSelection'
import { createMlJsEstimator, loadMlJs } from 'nirs4all/classic-ml'

import { BURN_CNN, BURN_CNN_CLASSIFIER, HOST_CLASSIFIERS, HOST_MODELS, RANDOM_FOREST, RANDOM_FOREST_CLASSIFIER, TFJS_CNN } from './hostModelIds'
import initBurn, { CnnRegressor } from '../engine/wasm/lab-burn/lab_burn_cnn.js'

interface Matrix { data: Float64Array; rows: number; cols: number }
interface Step { methodId: string; params: Record<string, unknown> }
type Tf = typeof import('@tensorflow/tfjs')

let tfModule: Tf | null = null
let tfBackend = ''
let mlModule: Record<string, unknown> | null = null
let burnReady = false

/** Loads the host libraries the given heads need, before the synchronous native run. */
export async function loadHostModels(methodIds: Iterable<string>): Promise<Record<string, string>> {
  const ids = new Set(methodIds)
  const versions: Record<string, string> = {}
  if (ids.has(RANDOM_FOREST) || ids.has(RANDOM_FOREST_CLASSIFIER)) {
    mlModule ??= await loadMlJs()
    versions.mljs = 'ml 8.0.0'
  }
  if (ids.has(BURN_CNN) || ids.has(BURN_CNN_CLASSIFIER)) {
    if (!burnReady) { await initBurn(); burnReady = true }
    versions.burn = 'burn 0.16.1 (ndarray, wasm)'
  }
  if (ids.has(TFJS_CNN)) {
    if (!tfModule) {
      const tf = await import('@tensorflow/tfjs')
      // A worker has no DOM canvas: WebGL needs OffscreenCanvas; otherwise the CPU backend.
      // Backend: WebGL only on a hardware GPU (a software rasterizer such as SwiftShader is slower
      // than the CPU backend for these small networks); a build may force one with VITE_LAB_TFJS_BACKEND.
      const forced = import.meta.env.VITE_LAB_TFJS_BACKEND as string | undefined
      const wanted = forced ?? (hardwareGpu() ? 'webgl' : 'cpu')
      let ok = false
      try { ok = wanted === 'webgl' ? typeof OffscreenCanvas !== 'undefined' && await tf.setBackend('webgl') : await tf.setBackend(wanted) } catch { ok = false }
      if (!ok) await tf.setBackend('cpu')
      await tf.ready()
      tfModule = tf
      tfBackend = tf.getBackend()
    }
    versions.tfjs = `${tfModule.version.tfjs} (${tfBackend})`
  }
  return versions
}

/** True when the worker can reach a hardware WebGL renderer. */
function hardwareGpu(): boolean {
  try {
    if (typeof OffscreenCanvas === 'undefined') return false
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2') as WebGL2RenderingContext | null
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer)
  } catch { return false }
}

const rowsOf = (X: Matrix): number[][] => Array.from({ length: X.rows }, (_, r) => Array.from(X.data.subarray(r * X.cols, (r + 1) * X.cols)))
// Targets arrive as a one-column matrix (regression) or a plain list of class ids (classification).
const column = (y: Matrix | ArrayLike<number>): number[] => Array.from('data' in y && (y as Matrix).data ? (y as Matrix).data : y as ArrayLike<number>)
const asMatrix = (values: ArrayLike<number>): Matrix => ({ data: Float64Array.from(values), rows: values.length, cols: 1 })
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))

/** Deterministic PRNG for minibatch order. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seed32 = (value: unknown) => Number(BigInt.asUintN(32, BigInt(String(value ?? 0))))

interface HostModel {
  fit(X: Matrix, y: Matrix | ArrayLike<number>, blocks?: number[]): void
  predict(X: Matrix): Matrix
  /** Classifiers: class probabilities, column j = class id j (rows sum to 1). */
  predictProba?(X: Matrix): Matrix
  state(): unknown
  dispose(): void
}

/** The class ids a classifier saw at fit: the controller refuses a fit scope that lacks a class. */
const seenClasses = (y: Matrix | ArrayLike<number>): number[] => [...new Set(column(y))].sort((a, b) => a - b)
const nClasses = (params: Record<string, unknown>): number => {
  const k = Number(params.n_classes)
  if (!Number.isInteger(k) || k < 2) throw new Error('A host classifier needs the declared number of classes (n_classes >= 2)')
  return k
}

function randomForest(params: Record<string, unknown>, classifier: boolean, saved?: unknown): HostModel {
  if (!mlModule) throw new Error('Random forest requested before ml.js was loaded')
  const options = {
    nEstimators: Number(params.n_estimators ?? 100),
    maxFeatures: Number(params.max_features ?? 0.33),
    replacement: true,
    useSampleBagging: true,
    seed: seed32(params.seed),
    treeOptions: { maxDepth: Number(params.max_depth ?? 12), minNumSamples: Number(params.min_samples_leaf ?? 3) },
  }
  const estimator = createMlJsEstimator({ ml: mlModule, estimatorName: classifier ? 'RandomForestClassifier' : 'RandomForestRegressor', params: options })
  if (saved !== undefined) estimator.load(saved)
  // Class ids 0..k-1 of the declared vocabulary; probabilities are tree-vote shares (Core adapter).
  const ids = classifier ? Array.from({ length: nClasses(params) }, (_, id) => id) : []
  return {
    fit(X, y) { estimator.fit(rowsOf(X), column(y)) },
    predict(X) { return asMatrix((estimator.predict(rowsOf(X)) as number[]).map(Number)) },
    ...(classifier ? { predictProba(X: Matrix): Matrix {
      const rows = (estimator as unknown as { predictProba(X: number[][], classes: number[]): number[][] }).predictProba(rowsOf(X), ids)
      return { data: Float64Array.from(rows.flat()), rows: rows.length, cols: ids.length }
    } } : {}),
    state() { return estimator.toJSON() },
    dispose() { /* plain JS */ },
  }
}

interface CnnState {
  mean: number[]; scale: number[]; yMean: number; yScale: number
  shapes: number[][]; values: number[][]
}

function tfjsCnn(params: Record<string, unknown>, saved?: CnnState): HostModel {
  const tf = tfModule
  if (!tf) throw new Error('TensorFlow.js CNN requested before TensorFlow.js was loaded')
  const kinds = (params.branch_kinds as number[]) ?? []
  const shapes = (params.branch_shapes as number[]) ?? []
  const filters = Number(params.filters ?? 8), kernel = Number(params.kernel_size ?? 5), embedding = Number(params.embedding_dim ?? 16)
  const hidden = Number(params.head_hidden ?? 16), epochs = Number(params.epochs ?? 150), batch = Number(params.batch_size ?? 16)
  const rate = Number(params.learning_rate ?? 0.005), seed = seed32(params.seed), pool = Number(params.pool_size ?? 2)
  // 'nicon' reproduces the nirs4all NICON 1-D CNN (TensorFlow version) for each sequence branch,
  // with its sigmoid head on a target min-max scaled to [0, 1] on the training rows.
  const nicon = String(params.architecture ?? 'compact') === 'nicon'
  let initSeed = seed
  const init = () => tf.initializers.glorotUniform({ seed: initSeed++ })
  const branches = kinds.map((kind, index) => {
    const [d0, d1, d2] = shapes.slice(index * 3, index * 3 + 3)
    return { kind, shape: kind === 2 ? [d0, d1, d2] : kind === 1 ? [d0, 1] : [d0], width: d0 * d1 * d2 }
  })
  // One input per source block: 1-D convolution for sequences (spectra, ordered markers),
  // 2-D convolution for images, dense for unordered tables; embeddings concatenated mid-network.
  const inputs = branches.map(branch => tf.input({ shape: branch.shape }))
  const embeddings = branches.map((branch, index) => {
    let h: any = inputs[index]
    if (nicon && branch.kind === 1) {
      if (branch.shape[0] < 175) throw new Error(`NICON needs at least 175 points per sequence; a branch has ${branch.shape[0]}. Use the compact CNN or longer spectra.`)
      h = tf.layers.spatialDropout1d({ rate: 0.08, seed: initSeed++ }).apply(h)
      h = tf.layers.conv1d({ filters: 8, kernelSize: 15, strides: 5, activation: 'selu', kernelInitializer: init() }).apply(h)
      h = tf.layers.dropout({ rate: 0.2, seed: initSeed++ }).apply(h)
      h = tf.layers.conv1d({ filters: 64, kernelSize: 21, strides: 3, activation: 'relu', kernelInitializer: init() }).apply(h)
      h = tf.layers.batchNormalization().apply(h)
      h = tf.layers.conv1d({ filters: 32, kernelSize: 5, strides: 3, activation: 'elu', kernelInitializer: init() }).apply(h)
      h = tf.layers.batchNormalization().apply(h)
      return tf.layers.flatten().apply(h)
    }
    if (branch.kind === 1) {
      h = tf.layers.conv1d({ filters, kernelSize: Math.min(kernel, branch.shape[0]), activation: 'relu', kernelInitializer: init() }).apply(h)
      h = tf.layers.averagePooling1d({ poolSize: Math.min(pool, branch.shape[0]) }).apply(h)
      h = tf.layers.flatten().apply(h)
    } else if (branch.kind === 2) {
      h = tf.layers.conv2d({ filters, kernelSize: Math.min(kernel, branch.shape[0], branch.shape[1]), activation: 'relu', kernelInitializer: init() }).apply(h)
      h = tf.layers.averagePooling2d({ poolSize: Math.min(pool, branch.shape[0], branch.shape[1]) }).apply(h)
      h = tf.layers.flatten().apply(h)
    }
    return tf.layers.dense({ units: embedding, activation: 'relu', kernelInitializer: init() }).apply(h)
  })
  let head: any = embeddings.length > 1 ? tf.layers.concatenate().apply(embeddings as any) : embeddings[0]
  head = tf.layers.dense({ units: nicon ? 16 : hidden, activation: nicon ? 'sigmoid' : 'relu', kernelInitializer: init() }).apply(head)
  const output = tf.layers.dense({ units: 1, activation: nicon ? 'sigmoid' : 'linear', kernelInitializer: init() }).apply(head)
  const model = tf.model({ inputs, outputs: output as any })
  let norm = { mean: [] as number[], scale: [] as number[], yMean: 0, yScale: 1 }
  if (saved) {
    norm = { mean: saved.mean, scale: saved.scale, yMean: saved.yMean, yScale: saved.yScale }
    model.setWeights(saved.values.map((values, i) => tf.tensor(values, saved.shapes[i])))
  }
  const split = (X: Matrix) => {
    let offset = 0
    return branches.map(branch => {
      const data = new Float32Array(X.rows * branch.width)
      for (let r = 0; r < X.rows; r++) for (let c = 0; c < branch.width; c++) {
        const j = offset + c
        data[r * branch.width + c] = (X.data[r * X.cols + j] - norm.mean[j]) / norm.scale[j]
      }
      offset += branch.width
      return tf.tensor(data, [X.rows, ...branch.shape])
    })
  }
  return {
    fit(X, y) {
      if (branches.reduce((n, branch) => n + branch.width, 0) !== X.cols) throw new Error('CNN branch geometry disagrees with the source blocks')
      const target = column(y)
      norm.mean = Array.from({ length: X.cols }, (_, j) => { let s = 0; for (let r = 0; r < X.rows; r++) s += X.data[r * X.cols + j]; return s / X.rows })
      norm.scale = norm.mean.map((m, j) => { let s = 0; for (let r = 0; r < X.rows; r++) s += (X.data[r * X.cols + j] - m) ** 2; return Math.sqrt(s / X.rows) || 1 })
      if (nicon) {
        // Sigmoid output: min-max scale the training target into [0, 1].
        norm.yMean = Math.min(...target)
        norm.yScale = (Math.max(...target) - norm.yMean) || 1
      } else {
        norm.yMean = target.reduce((a, b) => a + b, 0) / target.length
        norm.yScale = Math.sqrt(target.reduce((a, b) => a + (b - norm.yMean) ** 2, 0) / target.length) || 1
      }
      const xs = split(X)
      const ys = tf.tensor2d(target.map(v => (v - norm.yMean) / norm.yScale), [target.length, 1])
      const optimizer = tf.train.adam(rate)
      const random = mulberry32(seed)
      const order = Array.from({ length: X.rows }, (_, i) => i)
      for (let epoch = 0; epoch < epochs; epoch++) {
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
        for (let start = 0; start < order.length; start += batch) {
          const index = tf.tensor1d(order.slice(start, start + batch), 'int32')
          tf.tidy(() => {
            const bx = xs.map(x => tf.gather(x, index))
            const by = tf.gather(ys, index)
            optimizer.minimize(() => tf.losses.meanSquaredError(by, model.apply(bx, { training: true }) as any) as any)
          })
          index.dispose()
        }
      }
      optimizer.dispose(); xs.forEach(x => x.dispose()); ys.dispose()
    },
    predict(X) {
      const xs = split(X)
      const out = tf.tidy(() => (model.predict(xs) as any).dataSync() as Float32Array)
      xs.forEach(x => x.dispose())
      return asMatrix(Array.from(out, v => v * norm.yScale + norm.yMean))
    },
    state() {
      const weights = model.getWeights()
      return { ...norm, shapes: weights.map(w => w.shape), values: weights.map(w => Array.from(w.dataSync())) } satisfies CnnState
    },
    dispose() { model.dispose() },
  }
}

/** CNN trained with Burn (Rust, NdArray CPU backend compiled to WebAssembly). */
function burnCnn(params: Record<string, unknown>, classifier: boolean, saved?: string): HostModel {
  if (!burnReady) throw new Error('Burn CNN requested before its WebAssembly module was loaded')
  const config = JSON.stringify({ ...params, seed: Number(BigInt.asUintN(53, BigInt(String(params.seed ?? 0)))) })
  let model: CnnRegressor | null = saved ? CnnRegressor.from_state(Uint8Array.from(atob(saved), c => c.charCodeAt(0))) : null
  return {
    fit(X, y) {
      model?.free()
      model = new CnnRegressor(config)
      model.fit(X.data, X.rows, X.cols, Float64Array.from(column(y)))
    },
    predict(X) {
      if (!model) throw new Error('Fit the Burn CNN first')
      return asMatrix(model.predict(X.data, X.rows, X.cols))
    },
    ...(classifier ? { predictProba(X: Matrix): Matrix {
      if (!model) throw new Error('Fit the Burn CNN first')
      const k = nClasses(params)
      return { data: Float64Array.from(model.predict_proba(X.data, X.rows, X.cols)), rows: X.rows, cols: k }
    } } : {}),
    state() {
      if (!model) throw new Error('Fit the Burn CNN first')
      const bytes = model.export_state()
      let text = ''
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(text)
    },
    dispose() { model?.free(); model = null },
  }
}

function build(step: Step, saved?: unknown): HostModel {
  // The method id alone decides regression or classification (never a parameter).
  if (step.methodId === BURN_CNN || step.methodId === BURN_CNN_CLASSIFIER) {
    const classifier = step.methodId === BURN_CNN_CLASSIFIER
    if (classifier) nClasses(step.params)
    else if (step.params.n_classes !== undefined) throw new Error('A regression CNN takes no n_classes')
    return burnCnn(step.params, classifier, saved as string | undefined)
  }
  if (step.methodId === RANDOM_FOREST || step.methodId === RANDOM_FOREST_CLASSIFIER) {
    if (step.methodId === RANDOM_FOREST && step.params.n_classes !== undefined) throw new Error('A regression forest takes no n_classes')
    return randomForest(step.params, step.methodId === RANDOM_FOREST_CLASSIFIER, saved)
  }
  if (step.methodId === TFJS_CNN) return tfjsCnn(step.params, saved as CnnState | undefined)
  throw new Error(`Unknown host model ${step.methodId}`)
}

/** RolePipeline-compatible wrapper around one host model. */
class HostPipeline {
  private names: string[] | undefined
  /** Classifiers: class ids seen at fit (restored models report the full declared vocabulary). */
  private fitted: number[] = []
  constructor(private readonly steps: Step[], private model: HostModel) {
    if (HOST_CLASSIFIERS.has(steps[0].methodId) && model.predictProba) this.fitted = Array.from({ length: nClasses(steps[0].params) }, (_, id) => id)
  }
  fit(X: Matrix, y: Matrix | ArrayLike<number>, inputs: { featureNames?: string[]; blocks?: number[] } = {}) {
    this.names = inputs.featureNames ? [...inputs.featureNames] : undefined
    this.model.fit(X, y, inputs.blocks)
    if (HOST_CLASSIFIERS.has(this.steps[0].methodId)) this.fitted = seenClasses(y)
    return this
  }
  private checkNames(featureNames?: string[]) {
    if (this.names && featureNames && (featureNames.length !== this.names.length || featureNames.some((name, i) => name !== this.names![i]))) {
      throw new Error('Prediction features differ from the fitted host model features')
    }
  }
  predict(X: Matrix, featureNames?: string[]) {
    this.checkNames(featureNames)
    return this.model.predict(X)
  }
  /** Classifier API used by the native source controller in classification mode. */
  predictLabels(X: Matrix, featureNames?: string[]) {
    this.checkNames(featureNames)
    if (!this.model.predictProba) return Array.from(this.model.predict(X).data, Math.round)
    // The most probable class, lowest class id on ties: labels always agree with the probabilities.
    const proba = this.model.predictProba(X)
    return Array.from({ length: proba.rows }, (_, row) => {
      let best = 0
      for (let column = 1; column < proba.cols; column++) if (proba.data[row * proba.cols + column] > proba.data[row * proba.cols + best]) best = column
      return best
    })
  }
  predictProba(X: Matrix, featureNames?: string[]) {
    this.checkNames(featureNames)
    if (!this.model.predictProba) throw new Error('This host model has no class probabilities')
    return this.model.predictProba(X)
  }
  classes() { return [...this.fitted] }
  exportStates() { return [{ n4me: encode({ schema: 'nirs4all.lab-host-model.v1', methodId: this.steps[0].methodId, state: this.model.state() }) }] }
  dispose() { this.model.dispose() }
}

const isHost = (steps: Step[]) => steps.some(step => HOST_MODELS.has(step.methodId))

/** Internal selection a native head reports after a fit (Methods `fitResult`), in fit order. */
export interface ModelSelection { methodId: string; sourceIds: string[]; values: Record<string, number>; aom?: AomSelection }
let selections: ModelSelection[] = []
/** Selections recorded since the last call (the last one per source is the refit's). */
export function takeModelSelections(): ModelSelection[] { const taken = selections; selections = []; return taken }
const SELECTING_HEADS = new Set(['aom_pop.calibration'])
const SELECTION_KEYS = ['selected_branch', 'selected_chain_index', 'selected_n_components', 'selected_alpha']

/**
 * A native head fitted as the Methods estimator itself so that its fit result
 * (the preprocessing branch, chain and components AOM selected inside the
 * training fold) can be shown. Same estimator, parameters and N4ME state as the
 * native pipeline; replay and held-out prediction use the native pipeline.
 */
class SelectingHead {
  private names: string[] | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private estimator: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly methods: any, private readonly step: Step) {}
  fit(X: Matrix, y: Matrix | Float64Array, inputs: { featureNames?: string[] } = {}) {
    this.names = inputs.featureNames ? [...inputs.featureNames] : undefined
    const Estimator = this.methods.methodClass(this.step.methodId)
    const estimator = new Estimator(this.step.params)
    estimator.fit(X, y)
    this.estimator?.dispose()
    this.estimator = estimator
    const result = (estimator.fitResult() ?? {}) as Record<string, unknown>
    const values = Object.fromEntries(SELECTION_KEYS.filter(key => typeof result[key] === 'number').map(key => [key, result[key] as number]))
    const sourceIds = [...new Set((this.names ?? []).map(name => /^source:([^/]+)\//.exec(name)?.[1]).filter((id): id is string => Boolean(id)))]
    const aom = summarizeAomFit(this.step.methodId, result)
    selections.push({ methodId: this.step.methodId, sourceIds, values, ...(aom ? { aom } : {}) })
    return this
  }
  predict(X: Matrix, featureNames?: string[]) {
    if (this.names && featureNames && (featureNames.length !== this.names.length || featureNames.some((name, i) => name !== this.names![i]))) {
      throw new Error('Prediction features differ from the fitted features')
    }
    return this.estimator.predict(X)
  }
  exportStates() {
    return [{ methodId: this.step.methodId, n4me: this.estimator.toN4me(), containsTrainingRows: this.estimator.containsTrainingRows() }]
  }
  dispose() { this.estimator?.dispose(); this.estimator = null }
}

/**
 * The Methods facade handed to the native source controller: unchanged for
 * native steps, host pipelines for a host model head.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withHostModels<M extends { manifest(): { methods: any[] }; RolePipeline: any }>(methods: M): M {
  const manifest = methods.manifest()
  const hosted = [
    { method_id: RANDOM_FOREST, role: 'regressor', inputs: { X: 'required', y: 'required' } },
    { method_id: TFJS_CNN, role: 'regressor', inputs: { X: 'required', y: 'required', blocks: 'required' } },
    { method_id: BURN_CNN, role: 'regressor', inputs: { X: 'required', y: 'required', blocks: 'required' } },
    { method_id: RANDOM_FOREST_CLASSIFIER, role: 'classifier', roles: ['classifier'], capabilities: ['predict_proba', 'predict_labels'],
      inputs: { X: 'required', labels: 'required' } },
    { method_id: BURN_CNN_CLASSIFIER, role: 'classifier', roles: ['classifier'], capabilities: ['predict_proba', 'predict_labels'],
      inputs: { X: 'required', labels: 'required', blocks: 'required' } },
  ]
  const RolePipeline = {
    fromSteps(steps: Step[]) {
      if (steps.length === 1 && SELECTING_HEADS.has(steps[0].methodId)) return new SelectingHead(methods, steps[0])
      if (!isHost(steps)) return methods.RolePipeline.fromSteps(steps)
      if (steps.length !== 1) throw new Error('A host model must be the only head step')
      return new HostPipeline(steps, build(steps[0]))
    },
    fromStates(steps: Step[], states: Array<Uint8Array | { n4me: Uint8Array }>, options: { featureNames?: string[] } = {}) {
      if (!isHost(steps)) return methods.RolePipeline.fromStates(steps, states, options)
      const payload = decode(states[0] instanceof Uint8Array ? states[0] : states[0].n4me)
      if (payload.schema !== 'nirs4all.lab-host-model.v1' || payload.methodId !== steps[0].methodId) throw new Error('Saved host model belongs to another method')
      const pipeline = new HostPipeline(steps, build(steps[0], payload.state))
      ;(pipeline as unknown as { names?: string[] }).names = options.featureNames
      return pipeline
    },
  }
  return Object.assign(Object.create(null), methods, { RolePipeline, manifest: () => ({ ...manifest, methods: [...manifest.methods, ...hosted] }) })
}
