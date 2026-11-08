// Contract stubs only: these DTOs are deliberately not numerical parity evidence.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MainEngine } from './main-engine'
import { runResultToRtResultEnvelope } from './rt-result'
import { physicalIdentity } from './relations'
import { exportSingleHoldoutModel, predictSingleHoldout, singleHoldoutCohort, tryRunSingleHoldout } from './single-holdout'
import { buildN4aBundle, deserializeTyped, parseN4a, serializeTyped } from '@/lib/n4a'
import type { MaterializedDataset, PipelineDSL } from './types'

const calls = vi.hoisted(() => ({ split: vi.fn(), loadMethods: vi.fn(), provider: vi.fn(), compile: vi.fn(), build: vi.fn(), bank: vi.fn(), refit: vi.fn(), replay: vi.fn(), validate: vi.fn(), close: vi.fn(), unrelated: vi.fn() }))
vi.mock('./methods/n4m', () => ({ splitRows: calls.split }))
vi.mock('./dagml-engine', () => ({ DagMlEngine: class { run = calls.unrelated } }))
vi.mock('./nirs4all-core', async original => ({ ...await original<typeof import('./nirs4all-core')>(), loadMethodsWasm: calls.loadMethods, loadDatasetsWasm: async () => ({ sha256: () => 'a'.repeat(64) }) }))
vi.mock('./dagml-data', async importOriginal => ({ ...await importOriginal<typeof import('./dagml-data')>(), materializeViaProvider: calls.provider }))
vi.mock('./wasm/dagml/n4m_controller.mjs', () => ({ N4mWasmRegressionController: class {
  callback = vi.fn(() => { throw new Error('Contract tests must not call numerical controllers') })
  manifest() { return { controller_id: 'controller:methods.wasm.regression', controller_version: '1.1.0' } }
  close = calls.close
} }))
vi.mock('./dagml', async original => ({ ...await original<typeof import('./dagml')>(), dagMlAvailable: () => true, loadDagMl: async () => ({
  compile_pipeline_dsl_artifact_with_controllers_json: calls.compile,
  build_execution_plan_json: calls.build, execute_single_holdout_bank_json: calls.bank,
  execute_initial_full_refit_json: calls.refit, replay_initial_full_refit_json: calls.replay,
  validate_initial_full_refit_package_json: calls.validate,
  initial_full_refit_predict_envelope_json: (_pkg: string, cohort: string) => cohort,
}) }))

const dataset = (): MaterializedDataset => ({ X: Float64Array.from({ length: 42 }, (_, i) => i + 1), y: Float64Array.from([2, 4, 8, 16, 32, 64]),
  nSamples: 6, nFeatures: 7, axis: [1000, 1001, 1002, 1003, 1004, 1005, 1006], axisUnit: 'nm',
  featureNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], targetName: 'glucose', taskType: 'regression',
  sampleIds: ['sample#0', 'sample#1', 'sample#2', 'sample#3', 'sample#4', 'sample#5'], observationIds: ['o0', 'o1', 'o2', 'o3', 'o4', 'o5'], partitions: Array(6).fill('train'),
})
const declaration = (): PipelineDSL => ({ name: 'declared', steps: [{ id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {} }, { id: 'sg', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: {} }],
  split: { id: 'ks', type: 'n4m:splitters.kennard_stone', params: {} },
  model: { id: 'pls', type: 'n4m:models.pls.pls_regression', params: { n_components: 1 }, sweeps: { n_components: { type: 'range', from: 1, to: 3, step: 2 } } },
})
const selected = { ordinal: 'ord:00000', variant_id: 'variant:owner', params: { n_components: 1 }, recipe: [] as unknown[] }
const validation = { sample_ids: ['p5', 'p2'], values: [[65], [9]], target_names: ['glucose'] }
const ownerReport = { producer_node: 'model:pls', fold_id: 'fold:holdout', metrics: { rmse: 123.5 }, row_count: 2, metric_profile: 'regression_report.population_rmse_ratios.v1', undefined_metrics: { r2: 'constant_target' } }
let recipe: Record<string, unknown>[]

beforeEach(() => {
  vi.clearAllMocks()
  calls.loadMethods.mockResolvedValue({})
  calls.split.mockReturnValue([{ train: [4, 1, 0, 3], test: [5, 2] }])
  calls.provider.mockImplementation(async (ds: MaterializedDataset, binding) => ({ X: ds.X, y: ds.y, identity: binding.identity, outputRepresentation: 'tabular_numeric', version: 'stub', fingerprints: {},
    envelopeJson: JSON.stringify({ schema_fingerprint: `schema:${binding.identity.handles.join(',')}`, plan_fingerprint: 'plan', relation_fingerprint: `relations:${binding.identity.handles.join(',')}` }),
  }))
  calls.compile.mockImplementation((text: string) => {
    recipe = JSON.parse(text).steps[0].params.pipeline_steps_v1
    return JSON.stringify({ graph: { nodes: [{ id: 'model:pls', ports: { inputs: [{ kind: 'data', name: 'x' }] } }] }, campaign_template: { id: 'campaign:stub' } })
  })
  calls.build.mockImplementation((_id: string, graph: string, campaign: string) => JSON.stringify({ graph: JSON.parse(graph), campaign: JSON.parse(campaign) }))
  calls.bank.mockImplementation(() => JSON.stringify({ status: 'selected', chain_issues: [],
    selected: { identity: { ...selected, recipe }, selected_graph: { nodes: ['owner-selected-graph'] }, training_sample_ids: ['p4', 'p1', 'p0', 'p3'], validation_sample_ids: ['p5', 'p2'] },
    variants: [{ identity: { ...selected, recipe }, eligible: true, report: ownerReport, validation_predictions: validation, validation_targets: { unit_ids: [{ id: 'p2' }, { id: 'p5' }], values: [[8], [64]] } }],
  }))
  calls.refit.mockImplementation(() => JSON.stringify({ initial_full_refit_package_json: JSON.stringify({
    execution_root_seed: 0, effective_plan: { node_plans: { 'model:pls': { controller_id: 'controller:methods.wasm.regression', controller_version: '1.1.0', params: { pipeline_steps_v1: recipe, n_components: 1 } } } },
    artifacts: [{ load_mode: 'native_portable', record: { artifact: { kind: 'methods_role_pipeline', backend: 'raw' } } }],
    outputs: [{ output_id: 'output:prediction' }], training_sample_ids: ['p4', 'p1', 'p0', 'p3'],
  }) }))
  calls.replay.mockImplementation(() => JSON.stringify({ node_results: [{ predictions: [{ sample_ids: ['predict:s1', 'predict:s0'], values: [[9], [65]], target_names: ['glucose'] }] }] }))
})

describe('restricted owner single-holdout adapter', () => {
  it.each(['no-split', 'retained-test', 'count', 'zero-count', 'false-count', 'conflict', 'unknown', 'delta'] as const)('refuses %s before any split, preprocessing or fit', async kind => {
    const ds = dataset(), dsl = declaration()
    if (kind === 'no-split') delete dsl.split
    if (kind === 'retained-test') ds.partitions[5] = 'test'
    if (kind === 'count') dsl.split!.params.n_train = 4
    if (kind === 'zero-count') dsl.split!.params.n_train = 0
    if (kind === 'false-count') dsl.split!.params.n_train = false
    if (kind === 'conflict') dsl.model!.params.solver = 'nipals'
    if (kind === 'unknown') dsl.model!.params.unrecognized = true
    if (kind === 'delta') dsl.steps[1].params.delta = 2
    await expect(tryRunSingleHoldout(ds, dsl)).rejects.toMatchObject({ rtError: { cause: 'unsupported_capability' } })
    expect(calls.loadMethods).not.toHaveBeenCalled()
    expect(calls.split).not.toHaveBeenCalled()
    expect(calls.bank).not.toHaveBeenCalled()
    expect(calls.refit).not.toHaveBeenCalled()
  })

  it('refuses the complete over-bound declaration after one native split, without clamp or salvage', async () => {
    const dsl = declaration()
    dsl.model!.sweeps!.n_components.to = 5
    await expect(tryRunSingleHoldout(dataset(), dsl)).rejects.toThrow(/no values are clamped or dropped/)
    expect(calls.split).toHaveBeenCalledTimes(1)
    expect(calls.provider).not.toHaveBeenCalled()
    expect(calls.bank).not.toHaveBeenCalled()
  })

  it.each([undefined, null, ''])('forwards fractional default for unset test_size=%s and retains full owner evidence', async testSize => {
    const ds = dataset(), dsl = declaration()
    dsl.split!.params.test_size = testSize
    dsl.split!.params.n_train = testSize
    dsl.model!.sweeps!.n_components.to = 4 // non-divisible end: declare [1,3], never append4
    const original = structuredClone(dsl)
    const run = (await tryRunSingleHoldout(ds, dsl))!
    expect(calls.split).toHaveBeenCalledTimes(1)
    expect(calls.split).toHaveBeenCalledWith('n4m:splitters.kennard_stone', { test_size: .25 }, { data: ds.X, rows: 6, cols: 7 }, ds.y)
    const bankPlan = JSON.parse(calls.bank.mock.calls[0][0])
    expect(bankPlan.campaign.generation.dimensions.map((axis: { name: string }) => axis.name)).toEqual(['chain', 'components'])
    expect(bankPlan.campaign.generation.dimensions[1].choices.map((c: { param_overrides: { params: { n_components: number } }[] }) => c.param_overrides[0].params.n_components)).toEqual([1, 3])
    expect(recipe).toEqual([
      { methodId: 'preprocessing.scatter.snv', params: { with_mean: true, with_std: true, ddof: 0 } },
      { methodId: 'preprocessing.derivatives.savitzky_golay', params: { window_length: 11, polyorder: 3, deriv: 0, delta: 1, mode: 'interp', cval: 0 } },
      { methodId: 'models.pls.pls_regression', params: { n_components: 1, solver: 'simpls', center_x: true, scale_x: true, center_y: true, scale_y: true } },
    ])
    const train = calls.provider.mock.calls[1]
    expect(train[1].identity.handles).toEqual(['p4', 'p1', 'p0', 'p3'])
    expect(train[1].identity.observationHandle).toEqual(['s4', 's1', 's0', 's3'])
    expect(train[0].sampleIds).toEqual(['sample#4', 'sample#1', 'sample#0', 'sample#3'])
    expect(train[0].axis).toEqual(ds.axis)
    expect(train[0].axisUnit).toBe('nm')
    expect(train[1].featureNames).toEqual(ds.featureNames)
    expect(train[1].targetNames).toEqual(['glucose'])
    const refitPlan = JSON.parse(calls.refit.mock.calls[0][0])
    expect(refitPlan.graph).toEqual({ nodes: ['owner-selected-graph'] })
    expect(refitPlan.campaign.split_invocation).toBeNull()
    expect(refitPlan.campaign.generation.strategy).toBe('none')
    expect(refitPlan.campaign.data_bindings['model:pls'][0].schema_fingerprint).not.toBe(bankPlan.campaign.data_bindings['model:pls'][0].schema_fingerprint)
    expect(JSON.parse(calls.refit.mock.calls[0][3])).toEqual(['p4', 'p1', 'p0', 'p3'])
    expect(calls.bank.mock.calls[0][5]).toBe('0')
    expect(calls.refit.mock.calls[0][6]).toBe('0')
    expect(run.refit.name).toBe('Selection validation')
    const wire = runResultToRtResultEnvelope(run)
    expect(wire.reports[0]).toMatchObject({ partition: 'validation', producer_node: 'model:pls', fold_id: 'fold:holdout' })
    expect(wire.manifest.files.owner_score_context).toEqual(run.refit.scoreContext)
    expect(wire.manifest.files.owner_bank_json).toBe(run.bundleJson)
    expect(run.refit.metrics.rmse).toBe(123.5) // deliberately differs from any locally recomputed score
    expect(run.refit.metrics.r2).toBeUndefined()
    expect(run.refit.scoreContext).toMatchObject({ evaluation: 'selection_validation', independent_test: false, undefined_metrics: { r2: 'constant_target' } })
    expect(run.refit.predictions.map(row => [row.sampleId, row.actual, row.predicted])).toEqual([['sample#5', 64, 65], ['sample#2', 8, 9]])
    expect((run.model.state as { originalDeclaration: PipelineDSL }).originalDeclaration).toEqual(original)
    expect((run.model.state as { inputIdentity: unknown }).inputIdentity).toEqual({ basis: 'declared', axis: ds.axis, axisUnit: 'nm' })
    expect(dsl).toEqual(original)
    expect(calls.bank).toHaveBeenCalledTimes(1)
    expect(calls.refit).toHaveBeenCalledTimes(1)
    expect(calls.replay).toHaveBeenCalledTimes(1)
  })

  it('retains exact package bytes through existing opaque host serialization and owner replay', async () => {
    const run = (await tryRunSingleHoldout(dataset(), declaration()))!
    const shareable = await exportSingleHoldoutModel(run.model)
    const loaded = parseN4a(serializeTyped(buildN4aBundle({ ...run, model: shareable })))
    expect(serializeTyped(loaded.model.state)).toBe(serializeTyped(run.model.state))
    const before = calls.refit.mock.calls.length
    const predicted = await predictSingleHoldout(loaded.model, dataset().X.slice(0, 14), 2, 7, dataset().featureNames)
    expect(Array.from(predicted.values)).toEqual([65, 9])
    expect(calls.refit).toHaveBeenCalledTimes(before)
    expect(calls.replay.mock.calls.at(-1)![3]).toBe('{}')
    await expect(predictSingleHoldout(loaded.model, new Float64Array(14), 2, 7, [...dataset().featureNames!].reverse())).rejects.toThrow(/different order/)
    const detached = deserializeTyped<typeof shareable>(serializeTyped(shareable))
    expect(detached.state).toEqual(shareable.state)
  })

  it('preserves explicit supported SG values and refuses a mismatched detached replay', async () => {
    const dsl = declaration()
    dsl.steps[1].params = { window_length: 7, polyorder: 2, deriv: 1, delta: 1, mode: 'mirror', cval: .25 }
    await tryRunSingleHoldout(dataset(), dsl)
    expect(recipe[1].params).toEqual(dsl.steps[1].params)
    calls.replay.mockReturnValue(JSON.stringify({ node_results: [{ predictions: [{ sample_ids: ['predict:s0', 'predict:s1'], values: [[65], [10]], target_names: ['glucose'] }] }] }))
    await expect(tryRunSingleHoldout(dataset(), dsl)).rejects.toThrow(/differ from the selected FIT_CV/)
  })

  it('propagates an owner error without using the unrelated DAG route', async () => {
    const failure = new TypeError('owner contract failed')
    calls.bank.mockImplementation(() => { throw failure })
    await expect(new MainEngine({ profile: 'strict-wasm', mainThread: false }).run(dataset(), declaration())).rejects.toBe(failure)
    expect(calls.unrelated).not.toHaveBeenCalled()
    expect(calls.refit).not.toHaveBeenCalled()
    expect(calls.close).toHaveBeenCalledTimes(1)
  })

  it('exposes all-chain refusal reasons without selecting or refitting another component', async () => {
    calls.bank.mockReturnValue(JSON.stringify({ status: 'refused', selected: null, refusal: 'owner refused bank', chain_issues: [{ chain_label: 'declared recipe', failures: { 'ord:00001': 'nonfinite native prediction' } }], variants: [] }))
    await expect(tryRunSingleHoldout(dataset(), declaration())).rejects.toThrow(/nonfinite native prediction/)
    expect(calls.refit).not.toHaveBeenCalled()
  })

  it('leaves old-ineligible CV and other model routes unchanged', async () => {
    const dsl = declaration(); dsl.cv = { folds: 2, seed: 9 }
    expect(await tryRunSingleHoldout(dataset(), dsl)).toBeNull()
    dsl.cv = undefined; dsl.model!.type = 'n4m:models.regularized.ridge'
    expect(await tryRunSingleHoldout(dataset(), dsl)).toBeNull()
    expect(calls.split).not.toHaveBeenCalled()
  })

  it.each(['strict-wasm', 'transitional'] as const)('refuses historical coefficients in %s without changing raw data', async profile => {
    const model = { dsl: declaration(), nFeatures: 7, taskType: 'regression' as const, state: { backendId: 'nirs4all-core-wasm', source: 'original', result: { model: { coefficients: [1, 2] } } } }
    const original = serializeTyped(model)
    const engine = new MainEngine({ profile, mainThread: false })
    await expect(engine.predict(model, new Float64Array(14), 2, 7)).rejects.toThrow(/historical portable Core coefficient states/)
    await expect(engine.exportModel(model, { allowTrainingRows: false })).rejects.toThrow(/historical portable Core coefficient states/)
    expect(serializeTyped(model)).toBe(original)
    expect(calls.replay).not.toHaveBeenCalled()
  })

  it('preserves invalid/missing cells in ordered projections for owner refusal, never fills them', () => {
    const ds = dataset(); ds.X[4 * 7] = NaN; ds.y[1] = NaN
    const subset = singleHoldoutCohort(ds, physicalIdentity(ds), [4, 1])
    expect(Number.isNaN(subset.ds.X[0])).toBe(true)
    expect(Number.isNaN(subset.ds.y[1])).toBe(true)
    expect(subset.identity.sampleHandle).toEqual(['p4', 'p1'])
  })
})
