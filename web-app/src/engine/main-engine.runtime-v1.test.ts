import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRtErrorException, type RtErrorException } from './rt'
import type { MaterializedDataset, NativeRobustnessEvidencePublicationHandoff, PipelineDSL, RunResult } from './types'

const ctrl = vi.hoisted(() => ({
  loadLibn4mBackend: vi.fn(),
  runPipeline: vi.fn(),
}))

vi.mock('./dagml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dagml')>()
  return { ...actual, dagMlAvailable: () => false }
})

vi.mock('./portable-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./portable-core')>()
  return { ...actual, tryRunPortableCore: async () => null }
})

vi.mock('./backends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backends')>()
  return { ...actual, loadLibn4mBackend: ctrl.loadLibn4mBackend }
})

vi.mock('./orchestrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate')>()
  return { ...actual, runPipeline: ctrl.runPipeline }
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
  model: { id: 'pls', type: 'PLS', params: { n_components: 1 } },
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
  ctrl.runPipeline.mockReset()
  ctrl.runPipeline.mockResolvedValue(directRun())
})

describe('MainEngine runtime V1 browser cutover', () => {
  it('refuses the browser/WASM path with RtError when dag-ml is unavailable, without silently running the direct pipeline', async () => {
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
    expect(rt.mitigation).toMatch(/useDagMl:false/i)
    expect(ctrl.loadLibn4mBackend).not.toHaveBeenCalled()
    expect(ctrl.runPipeline).not.toHaveBeenCalled()
  })

  it('keeps the direct runner available only when explicitly selected', async () => {
    const { MainEngine } = await import('./main-engine')

    await expect(new MainEngine({ mainThread: true, useDagMl: false }).run(ds, dsl)).resolves.toMatchObject({
      id: 'run:direct',
      engine: 'direct-libn4m',
    })
    expect(ctrl.loadLibn4mBackend).toHaveBeenCalledTimes(1)
    expect(ctrl.runPipeline).toHaveBeenCalledTimes(1)
  })

  it('resolves serializable sidecar options in MainEngine direct mode', async () => {
    const { MainEngine } = await import('./main-engine')

    const result = await new MainEngine({ mainThread: true, useDagMl: false }).run(ds, dsl, {
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
