import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRtErrorException, type RtErrorException } from './rt'
import type { MaterializedDataset, NativeRobustnessEvidencePublicationHandoff, PipelineDSL, RunResult } from './types'

const ctrl = vi.hoisted(() => ({
  loadLibn4mBackend: vi.fn(),
  loadMlJsBackend: vi.fn(),
  exportPipeline: vi.fn(),
  predictPipeline: vi.fn(),
  dagMlAvailable: false,
  dagRun: vi.fn(),
}))

vi.mock('./dagml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dagml')>()
  return { ...actual, dagMlAvailable: () => ctrl.dagMlAvailable }
})

vi.mock('./dagml-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dagml-engine')>()
  return { ...actual, DagMlEngine: class { run = ctrl.dagRun } }
})

vi.mock('./portable-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./portable-core')>()
  return { ...actual, tryRunPortableCore: async () => null }
})

vi.mock('./backends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backends')>()
  return { ...actual, loadLibn4mBackend: ctrl.loadLibn4mBackend }
})

vi.mock('./mljs-backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mljs-backend')>()
  return { ...actual, loadMlJsBackend: ctrl.loadMlJsBackend }
})

vi.mock('./orchestrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate')>()
  return { ...actual, predictPipeline: ctrl.predictPipeline, exportPipeline: ctrl.exportPipeline }
})

const ds: MaterializedDataset = {
  X: new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]),
  y: new Float64Array([1, 2, 3, 4]),
  nSamples: 4,
  nFeatures: 2,
  axis: [0, 1],
  axisUnit: 'index',
  targetName: 'y',
  taskType: 'regression',
  sampleIds: ['a', 'b', 'c', 'd'],
  partitions: ['train', 'train', 'train', 'train'],
}

const dsl: PipelineDSL = {
  name: 'runtime-v1',
  steps: [],
  model: { id: 'pls', type: 'n4m:models.pls.pls_regression', params: { n_components: 1 } },
  cv: { folds: 2, seed: 7 },
}

const handoff: NativeRobustnessEvidencePublicationHandoff = {
  kind: 'robustness_evidence_publication_handoff',
  requested: true,
  destination: 'result_metadata.robustness_evidence',
  failClosed: true,
  alignmentStrategies: ['sample_indices'],
  publishedFields: [
    'prediction_arrays.X',
    'result_metadata.robustness_evidence.X',
    'result_metadata.robustness_evidence.predictor_bundle',
  ],
}

const directRun = (): RunResult => ({
  id: 'run:direct',
  pipelineName: dsl.name,
  taskType: 'regression',
  targetName: 'y',
  refit: { id: 'refit', name: 'Refit', kind: 'refit', metrics: { rmse: 0, n: 4 }, predictions: [], status: 'completed' },
  folds: [],
  seed: 7,
  engine: 'direct-libn4m',
  scoreMetric: 'rmse',
  model: { dsl, taskType: 'regression', nFeatures: 2, state: { backendId: 'libn4m-wasm' } },
  createdAt: '2026-07-01T00:00:00.000Z',
})

beforeEach(() => {
  ctrl.loadLibn4mBackend.mockReset()
  ctrl.loadLibn4mBackend.mockResolvedValue({ id: 'libn4m-wasm' })
  ctrl.loadMlJsBackend.mockReset()
  ctrl.exportPipeline.mockReset()
  ctrl.dagMlAvailable = false
  ctrl.dagRun.mockReset()
  ctrl.dagRun.mockResolvedValue(directRun())
  ctrl.predictPipeline.mockReset()
  ctrl.predictPipeline.mockResolvedValue({ predictions: new Float64Array([1]) })
})

describe('MainEngine runtime V1 browser cutover', () => {
  it('refuses the browser/WASM path with RtError when dag-ml is unavailable, without any direct fallback', async () => {
    const { MainEngine } = await import('./main-engine')

    const err = await new MainEngine({ mainThread: false }).run(ds, dsl).then(
      () => {
        throw new Error('run should have refused before the direct runner')
      },
      (e: unknown) => e,
    )

    expect(isRtErrorException(err)).toBe(true)
    const rt = (err as RtErrorException).rtError
    expect(rt).toMatchObject({
      verb: 'run',
      cause: 'unavailable_backend',
    })
    expect(rt.message).toMatch(/refusing to run the browser\/WASM path/i)
    expect(rt.mitigation).toMatch(/HTTP\(S\) or use the single-file build/i)
    expect(ctrl.loadLibn4mBackend).not.toHaveBeenCalled()
    expect(ctrl.dagRun).not.toHaveBeenCalled()
  })

  it('strict product profile rejects an explicit fallback request', async () => {
    const { MainEngine } = await import('./main-engine')

    const err = await new MainEngine({ profile: 'strict-wasm' }).run(ds, dsl, { allowFallback: true }).catch((e: unknown) => e)

    expect(isRtErrorException(err)).toBe(true)
    expect((err as RtErrorException).rtError.cause).toBe('invalid_request')
    expect(ctrl.loadLibn4mBackend).not.toHaveBeenCalled()
    expect(ctrl.dagRun).not.toHaveBeenCalled()
  })

  it('strict product profile predicts with libn4m WASM models but rejects JavaScript-backend models', async () => {
    const { MainEngine } = await import('./main-engine')
    const engine = new MainEngine({ profile: 'strict-wasm' })
    const libn4mModel = directRun().model
    const jsModel = { ...libn4mModel, state: { backendId: 'js-pls' } }

    await expect(engine.predict(libn4mModel, new Float64Array([1, 2]), 1, 2)).resolves.toMatchObject({
      predictions: expect.any(Float64Array),
    })
    expect(ctrl.loadLibn4mBackend).toHaveBeenCalledTimes(1)
    expect(ctrl.predictPipeline).toHaveBeenCalledTimes(1)

    const err = await engine.predict(jsModel, new Float64Array([1, 2]), 1, 2).catch((e: unknown) => e)
    expect(isRtErrorException(err)).toBe(true)
    expect((err as RtErrorException).rtError).toMatchObject({
      cause: 'unsupported_capability',
      unsupported_capability: 'javascript_model_backend',
    })
    expect(ctrl.predictPipeline).toHaveBeenCalledTimes(1)
  })

  it('refuses to predict or export a JavaScript-backend model in every profile', async () => {
    const { MainEngine } = await import('./main-engine')
    const jsModel = { ...directRun().model, state: { backendId: 'js-pls' } }

    for (const profile of ['strict-wasm', 'transitional'] as const) {
      const engine = new MainEngine({ profile })
      const predicted = await engine.predict(jsModel, new Float64Array([1, 2]), 1, 2).catch((e: unknown) => e)
      expect((predicted as RtErrorException).rtError).toMatchObject({ verb: 'predict', cause: 'unsupported_capability', unsupported_capability: 'javascript_model_backend' })
      const exported = await engine.exportModel(jsModel, { allowTrainingRows: false }).catch((e: unknown) => e)
      expect((exported as RtErrorException).rtError).toMatchObject({ verb: 'export', cause: 'unsupported_capability', unsupported_capability: 'javascript_model_backend' })
    }
    expect(ctrl.predictPipeline).not.toHaveBeenCalled()
    expect(ctrl.exportPipeline).not.toHaveBeenCalled()
  })

  it('keeps libn4m and ml.js export for imported non-nativeRefit models', async () => {
    const { MainEngine } = await import('./main-engine')
    const libn4mModel = directRun().model
    ctrl.exportPipeline.mockReturnValue(libn4mModel)
    ctrl.loadMlJsBackend.mockResolvedValue({ id: 'mljs-classic' })

    const engine = new MainEngine({ profile: 'strict-wasm' })
    await expect(engine.exportModel(libn4mModel, { allowTrainingRows: false })).resolves.toBe(libn4mModel)
    await expect(engine.exportModel({ ...libn4mModel, state: { backendId: 'mljs-classic' } }, { allowTrainingRows: true })).resolves.toBe(libn4mModel)
    expect(ctrl.exportPipeline).toHaveBeenCalledTimes(2)
    expect(ctrl.exportPipeline.mock.calls.map((call) => [call[1], call[2]])).toEqual([[false, { id: 'libn4m-wasm' }], [true, { id: 'mljs-classic' }]])
  })

  it('resolves serializable sidecar options on the dag-ml run path', async () => {
    const { MainEngine } = await import('./main-engine')
    ctrl.dagMlAvailable = true

    const result = await new MainEngine({ mainThread: true, profile: 'transitional' }).run(ds, dsl, {
      robustnessEvidencePublicationHandoff: handoff,
      robustnessEvidenceSidecar: {
        kind: 'indexeddb',
        dbName: 'n4a-test',
        storeName: 'arrays',
      },
    })

    expect(result.robustnessEvidencePublicationTrace).toMatchObject({
      kind: 'robustness_evidence_publication_trace',
      publisher: 'nirs4all-web.host-sidecar',
      status: 'failed',
      requested: true,
      destination: 'result_metadata.robustness_evidence',
      reason: 'IndexedDB is unavailable in this runtime',
      missing: handoff.publishedFields,
    })
  })
})
