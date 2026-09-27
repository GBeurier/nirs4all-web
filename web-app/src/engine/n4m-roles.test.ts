// The generic n4m role path in the web engine (portability L2 in the browser):
//  1. the shared cross-language N4ME fixture (fitted by the Python binding, also
//     replayed by R and the JS binding) predicts / transforms identically through
//     the web engine's loaders, and web fits reproduce the Python fits;
//  2. a web-trained pipeline exports its n4m states as N4ME inside a .n4a bundle,
//     reloads from the serialized bundle and predicts bit-identically.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { n4mToken } from '@/catalog/native'
import { loadSampleDataset } from '@/data/samples'
import { buildN4aBundle, parseN4a, serializeTyped } from '@/lib/n4a'
import type { Mat } from './algo/linalg'
import { loadLibn4mBackend } from './backends'
import { augmentRows, loadEstimator, splitRows } from './methods/n4m'
import { libn4mPreprocessor } from './methods/preproc'
import { type FittedState, type ModelBackend, predictPipeline, runPipeline } from './orchestrate'
import type { MaterializedDataset, PipelineDSL } from './types'
import type { Classifier, NativeEstimator, SampleFilter } from './wasm/methods/index.js'

interface FixtureCase {
  method_id: string
  params: Record<string, unknown>
  n4me_base64: string
  predict?: number[]
  transform?: number[][]
  classes?: number[]
  predict_labels?: number[]
  mask?: number[]
}
interface FixtureProcedure {
  method_id: string
  params: Record<string, unknown>
  inputs: string[]
  folds?: [number[], number[]][]
  X?: number[][]
  Y?: number[]
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/n4m-roles/estimator_roles_n4me.subset.json', import.meta.url), 'utf8')) as {
  x_train: number[][]
  y_train: number[]
  labels_train: number[]
  x_test: number[][]
  y_test: number[]
  axis: number[]
  cases: FixtureCase[]
  procedures: FixtureProcedure[]
}

const matrix = (rows: number[][]): Mat => ({ data: Float64Array.from(rows.flat()), rows: rows.length, cols: rows[0].length })
const column = (values: number[]): Mat => ({ data: Float64Array.from(values), rows: values.length, cols: 1 })
const oneHot = (labels: number[], k: number): Mat => {
  const m: Mat = { data: new Float64Array(labels.length * k), rows: labels.length, cols: k }
  labels.forEach((c, r) => (m.data[r * k + c] = 1))
  return m
}
const argmax = (m: Mat): number[] =>
  Array.from({ length: m.rows }, (_, r) => {
    let best = 0
    for (let k = 1; k < m.cols; k++) if (m.data[r * m.cols + k] > m.data[r * m.cols + best]) best = k
    return best
  })
const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))
// Fixture outputs come from Linux x86-64; the n4m replays compare at 1e-9.
const expectClose = (actual: ArrayLike<number>, expected: number[], label: string) => {
  expect(actual.length, label).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i] - expected[i]), `${label}[${i}]`).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(expected[i])))
  }
}

const xTrain = matrix(fixture.x_train)
const xTest = matrix(fixture.x_test)
const yTrain = column(fixture.y_train)
let backend: ModelBackend

beforeAll(async () => {
  backend = await loadLibn4mBackend()
})

describe('shared N4ME fixture through the web engine', () => {
  it.each(fixture.cases.map((c) => [c.method_id, c] as const))('%s', (methodId, c) => {
    const type = n4mToken(methodId)
    const payload = bytes(c.n4me_base64)
    if (c.transform) {
      // preprocessing: the saved step state reloads through the predict-later path
      const restored = libn4mPreprocessor.restore(type, c.params, payload)
      expectClose(restored.apply(xTest).data, c.transform.flat(), `${methodId} transform`)
      restored.free()
      const fitted = libn4mPreprocessor.fit(type, c.params, xTrain, { Y: yTrain, axis: fixture.axis })
      expectClose(fitted.apply(xTest).data, c.transform.flat(), `${methodId} web fit`)
      fitted.free()
    }
    if (c.predict) {
      expectClose(backend.predict({ n4me: payload }, xTest).data, c.predict, `${methodId} predict`)
      const nComp = typeof c.params.n_components === 'number' ? c.params.n_components : 2
      const model = backend.fit({ type, params: c.params }, xTrain, yTrain, nComp)
      expectClose(backend.predict(model, xTest).data, c.predict, `${methodId} web fit`)
    }
    if (c.predict_labels) {
      // the fixture's class ids are arbitrary (10/20/30); the web encodes classes 0..K-1
      const classes = c.classes!
      const replayed = loadEstimator(payload) as NativeEstimator & Classifier
      expect(replayed.predictLabels(xTest)).toEqual(c.predict_labels)
      replayed.dispose()
      const encoded = fixture.labels_train.map((label) => classes.indexOf(label))
      const model = backend.fit({ type, params: c.params }, xTrain, oneHot(encoded, classes.length), 2)
      expect(argmax(backend.predict(model, xTest)).map((k) => classes[k])).toEqual(c.predict_labels)
    }
    if (c.mask) {
      const filter = loadEstimator(payload) as NativeEstimator & SampleFilter
      expect(filter.getMask(xTest, Float64Array.from(fixture.y_test))).toEqual(c.mask.map((v) => v === 1))
      filter.dispose()
    }
  })

  it.each(fixture.procedures.map((p) => [p.method_id, p] as const))('%s', (methodId, p) => {
    const type = n4mToken(methodId)
    if (p.folds) {
      const folds = splitRows(type, p.params, xTrain, Float64Array.from(fixture.y_train))
      expect(folds.map((f) => [f.train, f.test])).toEqual(p.folds)
    }
    if (p.X) {
      const out = augmentRows(type, p.params, xTrain, yTrain, p.inputs.includes('axis') ? fixture.axis : undefined)
      expectClose(out.X.data, p.X.flat(), `${methodId} X`)
      if (p.Y) expectClose(out.Y.data, p.Y, `${methodId} Y`)
    }
  })
})

describe('web-trained n4m pipelines round-trip as N4ME', () => {
  const testRows = (ds: MaterializedDataset): { X: Float64Array; rows: number[] } => {
    const rows = ds.partitions.flatMap((part, i) => (part === 'test' ? [i] : []))
    const X = new Float64Array(rows.length * ds.nFeatures)
    rows.forEach((r, i) => X.set(ds.X.subarray(r * ds.nFeatures, (r + 1) * ds.nFeatures), i * ds.nFeatures))
    return { X, rows }
  }

  it.each([
    ['corn', n4mToken('models.pls.pls_regression'), { n_components: 8 }],
    ['meat', n4mToken('models.classification.pls_lda'), { n_components: 6 }],
  ] as const)('%s: trains, exports N4ME, reloads from the .n4a text and predicts identically', async (sample, model, params) => {
    const ds = await loadSampleDataset(sample)
    const dsl: PipelineDSL = {
      name: `${sample} n4m roles`,
      steps: [
        { id: 'snv', type: n4mToken('preprocessing.scatter.snv'), params: {} },
        { id: 'sg', type: n4mToken('preprocessing.derivatives.savitzky_golay'), params: { window_length: 11, polyorder: 2, deriv: 1 } },
        { id: 'aug', type: n4mToken('augmentation.noise.gaussian_noise'), params: {} },
      ],
      model: { id: 'model', type: model, params },
    }
    const run = await runPipeline(ds, dsl, {}, backend)
    const state = run.model.state as FittedState
    // every fitted n4m state is portable N4ME; the train-only augmenter stores none
    expect(state.chain.map((s) => s.state instanceof Uint8Array)).toEqual([true, true, false])
    expect((state.model as { n4me: unknown }).n4me).toBeInstanceOf(Uint8Array)

    const loaded = parseN4a(serializeTyped(buildN4aBundle(run)))
    const { X, rows } = testRows(ds)
    const replay = predictPipeline(loaded.model, X, rows.length, ds.nFeatures, backend)
    const live = predictPipeline(run.model, X, rows.length, ds.nFeatures, backend)
    expect(Array.from(replay.values)).toEqual(Array.from(live.values))
    expect(Array.from(replay.values)).toEqual(run.refit.predictions.map((p) => p.predicted))
  })

  it('refuses a v1 bundle that stored per-method number arrays', () => {
    expect(() => parseN4a(JSON.stringify({ format: 'nirs4all-web/n4a', version: 1, model: {} }))).toThrow(/retrain/)
  })
})
