// Transport/source-authority boundary only. No numerical replacement or fit.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refitWithDagMl } from './dagml-refit'
import { datasetRelations, physicalIdentity } from './relations'
import { IO_RECORD, type MaterializedDataset, type PipelineDSL } from './types'
import type { ModelBackend } from './orchestrate'
import type { ProviderBinding } from './dagml-data'

const calls = vi.hoisted(() => ({ provider: vi.fn(), compile: vi.fn(), build: vi.fn(), execute: vi.fn(), canonical: vi.fn(), fit: vi.fn() }))
vi.mock('./orchestrate', async original => ({ ...await original<typeof import('./orchestrate')>(), trainAndPredict: calls.fit }))
vi.mock('./dagml-data', async original => ({ ...await original<typeof import('./dagml-data')>(), materializeViaProvider: calls.provider }))
vi.mock('./nirs4all-core', async original => ({ ...await original<typeof import('./nirs4all-core')>(),
  loadDatasetsWasm: async () => ({ sha256: () => 'a'.repeat(64) }),
  createDagMlModelManifest: () => ({ capabilities: [], rng_policy: 'ignores_seed' }),
}))
vi.mock('./dagml', () => ({ loadDagMl: async () => ({
  validate_controller_manifest_json: vi.fn(),
  compile_pipeline_dsl_artifact_with_controllers_json: calls.compile,
  build_execution_plan_json: calls.build,
  execute_initial_full_refit_json: calls.execute,
  replay_initial_full_refit_json: vi.fn(),
  initial_full_refit_predict_envelope_json: vi.fn(),
  validate_initial_full_refit_package_json: vi.fn(),
  sample_relation_set_fingerprint_json: calls.canonical,
}) }))

const stop = new Error('Stop at the owner REFIT boundary; do not execute a fit')
const unreachable = () => { throw new Error('No numerical backend operation is permitted in this source-boundary test') }
const backend: ModelBackend = { id: 'unreachable', fit: unreachable, predict: unreachable, share: unreachable,
  preproc: { id: 'unreachable', fit: unreachable, restore: unreachable, resample: unreachable, share: unreachable },
}
const pipeline: PipelineDSL = { name: 'source identity', steps: [], model: { id: 'model', type: 'n4m:models.regularized.ridge', params: { alpha: 1 } } }

beforeEach(() => {
  vi.clearAllMocks()
  calls.canonical.mockImplementation(() => { throw new Error('Web must not compute/assign canonical C as DMD source S') })
  calls.fit.mockImplementation(unreachable)
  calls.execute.mockImplementation(() => { throw stop })
  calls.build.mockImplementation((_id: string, graph: string, campaign: string) => JSON.stringify({ graph: JSON.parse(graph), campaign: JSON.parse(campaign) }))
  calls.compile.mockReturnValue(JSON.stringify({ graph: { nodes: [{ id: 'model:web.pipeline', ports: { inputs: [{ name: 'x', kind: 'data' }] } }] }, campaign_template: { id: 'campaign:source' } }))
  calls.provider.mockImplementation(async (ds: MaterializedDataset, binding?: ProviderBinding) => {
    const identity = binding?.identity ?? physicalIdentity(ds)
    const source = binding?.relationRows ?? datasetRelations(ds, identity)
    // These labelled keys are stubs, not a new fingerprint implementation or parity claim.
    return { X: ds.X, y: ds.y, identity, outputRepresentation: 'tabular_numeric',
      envelopeJson: JSON.stringify({ schema_fingerprint: binding ? 'schema:scoped' : 'schema:full', plan_fingerprint: 'plan:source', relation_fingerprint: binding ? 'S:scoped-source-table' : 'S:full-source-table', coordinator_relations: { records: source } }),
    }
  })
})

describe('composite REFIT uses real scoped DMD authority', () => {
  it('passes scoped source S unchanged and preserves original ordered IDs and full target domain', async () => {
    const retained = { record: 'original complete IO source' }
    const ds: MaterializedDataset = { [IO_RECORD]: retained, nSamples: 4, nFeatures: 2, X: Float64Array.from([100, 101, 1, 2, 3, 4, 5, 6]), y: Float64Array.from([0, 1, 2, 1]),
      sampleIds: ['held', 'train1', 'train2', 'train3'], observationIds: ['o0', 'o1', 'o2', 'o3'], partitions: ['test', 'train', 'train', 'train'],
      groupIds: ['held-group', 'train-A', 'train-B', 'train-A'], classes: ['A', 'B', 'C', 'B'], taskType: 'multiclass', targetName: 'class',
      featureNames: ['near', 'far'], axis: [1100, 1200], axisUnit: 'nm',
    }
    const order = [3, 1, 2], original = datasetRelations(ds)
    await expect(refitWithDagMl(ds, pipeline, backend, order, [0])).rejects.toBe(stop)
    expect(calls.provider).toHaveBeenCalledTimes(2)
    expect(calls.provider.mock.calls[0][0]).toBe(ds) // existing numerical/scoring context
    const [scoped, binding] = calls.provider.mock.calls[1]
    expect(scoped.nSamples).toBe(3)
    expect(scoped.sampleIds).toEqual(['train3', 'train1', 'train2'])
    expect(Array.from(scoped.y)).toEqual([1, 1, 2])
    expect(Array.from(scoped.X)).toEqual([5, 6, 1, 2, 3, 4])
    expect(scoped[IO_RECORD]).toBe(retained)
    expect(binding.identity.handles).toEqual(['p3', 'p1', 'p2'])
    expect(binding.identity.observationHandle).toEqual(['s3', 's1', 's2'])
    expect(binding.relationRows).toEqual(order.map(i => original[i]))
    expect(binding.featureNames).toEqual(['near', 'far'])
    expect(binding.targetNames).toEqual(['class'])
    const envelope = JSON.parse(calls.execute.mock.calls[0][2])
    expect(envelope.relation_fingerprint).toBe('S:scoped-source-table')
    expect(envelope.coordinator_relations.records).toEqual(binding.relationRows)
    const plan = JSON.parse(calls.execute.mock.calls[0][0])
    expect(plan.campaign.data_bindings['model:web.pipeline'][0]).toMatchObject({ relation_fingerprint: 'S:scoped-source-table', schema_fingerprint: 'schema:scoped' })
    expect(JSON.parse(calls.execute.mock.calls[0][3])).toEqual(['p3', 'p1', 'p2'])
    const declaration = JSON.parse(calls.compile.mock.calls[0][0])
    expect(declaration.steps[0].params.web_class_names).toEqual(['A', 'B', 'C'])
    expect(declaration.steps[0].params.web_target_names).toEqual(['A', 'B', 'C'])
    expect(calls.canonical).not.toHaveBeenCalled()
    expect(calls.fit).not.toHaveBeenCalled()
    expect(Array.from(ds.y)).toEqual([0, 1, 2, 1])
  })
})
