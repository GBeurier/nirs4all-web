// FORCED-FAILURE coverage for the B-018 RtError runtime diagnostics (RT_spec §RT-003).
//
// The happy path (a clean dag-ml run surfaces NO fallback) is asserted end-to-end by
// tests/rt-fallback-smoke.mjs in a real browser. The *negative* half — that a dag-ml
// scheduler/planning failure degrades LOUDLY (a typed RtError, not a silent success) —
// can only be proven by FORCING the WASM coordinator to fail, which the served smoke
// cannot do deterministically without a product test-hook. So it is pinned here at the
// engine layer: we substitute the dag-ml module with a synthetic one whose
// `execute_campaign_phase_json` / `build_execution_plan_json` throw on demand, and drive
// the REAL `DagMlEngine.runViaDagMl` fallback bookkeeping (no product code is changed).
//
// Two invariants, at BOTH degrade sites (scheduler + variant planning), in BOTH modes:
//   • default (allowFallback omitted/true): the run STILL completes with valid CV/refit
//     scores AND records a typed `RtError` on `RunResult.diagnostics`, flipping
//     `lineage.schedulerFallback` — never a silent "executed by dag-ml".
//   • strict  (allowFallback:false): the engine THROWS a typed `RtErrorException`
//     instead of degrading — no misleading RunResult is returned at all.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRtErrorException, RtErrorException } from './rt'
import type { MaterializedDataset, PipelineDSL } from './types'

// Shared, mutable control for the synthetic dag-ml module. `vi.hoisted` runs before the
// hoisted `vi.mock` factories, so both the factory and the test bodies can read/flip it.
const ctrl = vi.hoisted(() => ({
  failPlanning: false,
  failScheduler: true,
  SCHEDULER_ERROR: 'execute_campaign_phase_json crashed: scheduler boom',
  PLANNING_ERROR: 'no controller registered for model node',
}))

// dag-ml WASM coordinator → a synthetic module. compile/split return valid-enough shapes
// for a 2-fold single-variant model-only regression run; planning + scheduler fail on
// demand. When the scheduler is allowed to run it echoes each fold's validation block so
// the non-degraded path also assembles OOF (used by the planning-only case).
vi.mock('./dagml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dagml')>()
  const fakeMod = {
    dag_ml_version: () => '0.0.0-test',
    kfold_split_json: (_spec: string, idsJson: string) => {
      const ids: string[] = JSON.parse(idsJson)
      const half = Math.max(1, Math.floor(ids.length / 2))
      const a = ids.slice(0, half)
      const b = ids.slice(half)
      return JSON.stringify({
        id: 'fs:test',
        sample_ids: ids,
        sample_groups: {},
        folds: [
          { fold_id: 'fold-0', train_sample_ids: a, validation_sample_ids: b },
          { fold_id: 'fold-1', train_sample_ids: b, validation_sample_ids: a },
        ],
      })
    },
    stratified_kfold_split_json: () => {
      throw new Error('regression path uses kfold_split_json')
    },
    compile_pipeline_dsl_artifact_json: () => JSON.stringify({ graph: { nodes: [] }, campaign_template: { split_invocation: {} } }),
    build_execution_plan_json: () => {
      if (ctrl.failPlanning) throw new Error(ctrl.PLANNING_ERROR)
      return JSON.stringify({ variants: [] }) // → the engine's base variant
    },
    execute_campaign_phase_json: (_plan: string, _graph: string, campaignJson: string) => {
      if (ctrl.failScheduler) throw new Error(ctrl.SCHEDULER_ERROR)
      const campaign = JSON.parse(campaignJson) as { split_invocation: { fold_set: { folds: { fold_id: string; validation_sample_ids: string[] }[] } } }
      const predictions = campaign.split_invocation.fold_set.folds.map((f) => ({
        partition: 'validation',
        fold_id: f.fold_id,
        sample_ids: f.validation_sample_ids,
        values: f.validation_sample_ids.map(() => [0]),
      }))
      return JSON.stringify([{ predictions, lineage: { variant_id: 'variant:base' } }])
    },
    select_candidates_json: () => JSON.stringify({ selected_candidate_id: 'variant:base' }),
  }
  return { ...actual, loadDagMl: async () => fakeMod }
})

// dag-ml-data provider: serve the in-memory blocks straight back (no WASM init in node).
vi.mock('./dagml-data', () => ({
  materializeViaProvider: async (ds: MaterializedDataset) => ({
    X: ds.X,
    y: ds.y,
    fingerprints: { schema: 'sch', plan: 'pln', relation: null },
    outputRepresentation: 'tabular_numeric',
    version: '0.0.0-test',
  }),
}))

// libn4m backend: identity stand-in — the numerics are exercised through the mocked
// `trainAndPredict` below, so the backend object only needs to exist.
vi.mock('./backends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backends')>()
  return {
    ...actual,
    loadLibn4mBackend: async () => ({ id: 'libn4m-wasm', fit: () => ({}), predict: () => ({ data: new Float64Array(), rows: 0, cols: 1 }), preproc: {} }),
  }
})

// Keep the REAL scoring/decoding (classInfo/decodeRows/scoreNode) so CV/refit metrics are
// genuinely computed; only substitute the fit/predict with deterministic perfect
// regression predictions sized to the requested rows, so a completed run yields finite
// scores (proving the degrade is not a hidden failure).
vi.mock('./orchestrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate')>()
  const trainAndPredict = (ds: { y: Float64Array }, _dsl: unknown, _backend: unknown, _trainIdx: number[], predictIdx: number[]) => {
    const data = new Float64Array(predictIdx.length)
    for (let i = 0; i < predictIdx.length; i++) data[i] = ds.y[predictIdx[i]]
    return { pred: { data, rows: predictIdx.length, cols: 1 }, descriptors: [], branch: undefined, model: {}, classNames: [] }
  }
  return { ...actual, trainAndPredict }
})

// Import AFTER the mocks so DagMlEngine binds to the synthetic collaborators.
const { DagMlEngine } = await import('./dagml-engine')

function regressionDataset(): MaterializedDataset {
  const nSamples = 6
  const nFeatures = 2
  return {
    X: new Float64Array(nSamples * nFeatures),
    y: Float64Array.from([1, 2, 3, 4, 5, 6]),
    nSamples,
    nFeatures,
    axis: [0, 1],
    axisUnit: 'index',
    targetName: 'y',
    taskType: 'regression',
    sampleIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    partitions: ['train', 'train', 'train', 'train', 'train', 'train'],
  } as unknown as MaterializedDataset
}

const modelOnlyPipeline = (): PipelineDSL =>
  ({ name: 'rt-fallback', steps: [], model: { id: 'm', type: 'PLS', params: { n_components: 2 } }, cv: { folds: 2, seed: 7 } }) as unknown as PipelineDSL

beforeEach(() => {
  // default: the historically-silent scheduler degrade; planning succeeds.
  ctrl.failPlanning = false
  ctrl.failScheduler = true
})

describe('DagMlEngine — scheduler fallback surfaces a typed RtError (B-018)', () => {
  it('default mode: records a diagnostic + flips schedulerFallback, and STILL returns valid CV scores', async () => {
    const res = await new DagMlEngine().run(regressionDataset(), modelOnlyPipeline())

    // the run completed with real scores — this is a loud degrade, not a hidden failure
    expect(res.cv).toBeDefined()
    expect(Number.isFinite(res.cv!.metrics[res.scoreMetric] as number)).toBe(true)
    expect(res.folds).toHaveLength(2)
    expect(res.engine).toBe('dag-ml-wasm + libn4m')

    // …but it is explicitly marked as a fallback, not a clean native execution
    const lineage = res.lineage as { engine: string; executed: boolean; schedulerFallback?: boolean }
    expect(lineage.schedulerFallback).toBe(true)

    expect(res.diagnostics).toHaveLength(1)
    const d = res.diagnostics![0]
    expect(d.verb).toBe('run')
    expect(d.cause).toBe('runtime_error')
    expect(d.message).toContain('scheduler boom')
    expect(d.mitigation).toMatch(/libn4m chain/i)
    expect(d.detail).toBeDefined() // in-memory debug aid, stripped on the wire
  })

  it('strict mode (allowFallback:false): THROWS a typed RtErrorException instead of degrading', async () => {
    let caught: unknown
    try {
      await new DagMlEngine().run(regressionDataset(), modelOnlyPipeline(), { allowFallback: false })
    } catch (e) {
      caught = e
    }
    expect(isRtErrorException(caught)).toBe(true)
    const ex = caught as RtErrorException
    expect(ex.rtError.verb).toBe('run')
    expect(ex.rtError.cause).toBe('runtime_error')
    expect(ex.message).toContain('scheduler boom')
  })
})

describe('DagMlEngine — variant-planning fallback surfaces a typed RtError (B-018)', () => {
  it('default mode: a planning failure records an unsupported_shape diagnostic (search not silently dropped)', async () => {
    ctrl.failPlanning = true
    ctrl.failScheduler = false // isolate the planning site: let the scheduler run cleanly
    const res = await new DagMlEngine().run(regressionDataset(), modelOnlyPipeline())

    expect(res.cv).toBeDefined() // still ran (on the base variant)
    const lineage = res.lineage as { schedulerFallback?: boolean }
    expect(lineage.schedulerFallback).toBeFalsy() // the SCHEDULER did run — only planning degraded

    expect(res.diagnostics).toHaveLength(1)
    const d = res.diagnostics![0]
    expect(d.verb).toBe('run')
    expect(d.cause).toBe('unsupported_shape')
    expect(d.message).toMatch(/variant search/i)
    expect(d.mitigation).toMatch(/sweep was skipped/i)
  })

  it('strict mode (allowFallback:false): a planning failure THROWS an unsupported_shape RtErrorException', async () => {
    ctrl.failPlanning = true
    ctrl.failScheduler = false
    let caught: unknown
    try {
      await new DagMlEngine().run(regressionDataset(), modelOnlyPipeline(), { allowFallback: false })
    } catch (e) {
      caught = e
    }
    expect(isRtErrorException(caught)).toBe(true)
    expect((caught as RtErrorException).rtError.cause).toBe('unsupported_shape')
  })
})
