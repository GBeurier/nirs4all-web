// Provider boundary stubs only; Root's actual WASM gate supplies native evidence.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { materializeViaProvider, providerCohort } from './dagml-data'
import { datasetRelations, physicalIdentity } from './relations'
import { IO_RECORD, type MaterializedDataset } from './types'

const native = vi.hoisted(() => ({ schema: vi.fn(), envelope: vi.fn(), relations: vi.fn(), metadata: vi.fn() }))
vi.mock('./nirs4all-core', async original => ({ ...await original<typeof import('./nirs4all-core')>(), loadDagMlDataWasm: async () => ({
  validate_dataset_schema_json: native.schema,
  plan_model_input_json: () => JSON.stringify({ output_representation: 'tabular_numeric' }),
  validate_sample_relation_table_json: native.relations,
  build_coordinator_data_plan_envelope_json: native.envelope.mockImplementation((schema: string, _plan: string, relations: string) => JSON.stringify({ schema_fingerprint: schema, plan_fingerprint: 'native-plan', relation_fingerprint: relations })),
  validate_coordinator_data_plan_envelope_json: vi.fn(), dag_ml_data_version: () => 'stub',
  WasmInMemoryProvider: { withF64Features: (_envelope: string, targets: string, metadata: string, values: Float64Array) => {
    native.metadata(metadata)
    const meta = JSON.parse(metadata), table = JSON.parse(targets)[0].values
    return {
      materialize: () => 'data', make_view: () => 'view', release: vi.fn(), free: vi.fn(),
      featureBlockF64: () => ({ layout: JSON.stringify({ observation_ids: meta.observation_ids, n_cols: meta.feature_names.length }), into_values: () => values }),
      target_block: () => JSON.stringify({ sample_ids: table.map((v: { sample_id: string }) => v.sample_id), values: table.map((v: { value: number }) => v.value) }),
    }
  } },
}) }))

beforeEach(() => vi.clearAllMocks())

describe('native provider original-handle binding', () => {
  it('uses supplied names, axes and stable subcohort handles to build fresh native authority', async () => {
    const ds: MaterializedDataset = { nSamples: 2, nFeatures: 2, X: Float64Array.from([1, 2, 3, 4]), y: Float64Array.from([7, 9]),
      sampleIds: ['original-B', 'original-A'], observationIds: ['obs-B', 'obs-A'], partitions: ['train', 'train'],
      axis: [1100, 1200], axisUnit: 'nm', targetName: 'glucose', taskType: 'regression', featureNames: ['near', 'far'],
    }
    const identity = { ...physicalIdentity(ds), sampleHandle: ['p4', 'p1'], handles: ['p4', 'p1'], observationHandle: ['s4', 's1'], rowsOf: new Map([['p4', [0]], ['p1', [1]]]) }
    const served = await materializeViaProvider(ds, { identity, featureNames: ['near', 'far'], targetNames: ['glucose'] })
    const schema = JSON.parse(native.schema.mock.calls[0][0])
    expect(schema.sample_ids).toEqual(['p4', 'p1'])
    expect(schema.sources[0].native_representation.axes[1]).toMatchObject({ unit: 'nm', coordinate: { values: { values: [1100, 1200] } } })
    expect(schema.targets.y.axes[1].coordinate.values.values).toEqual(['glucose'])
    const rows = JSON.parse(native.relations.mock.calls[0][0]).rows
    expect(rows.map((r: { observation_id: string; sample_id: string }) => [r.observation_id, r.sample_id])).toEqual([['s4', 'p4'], ['s1', 'p1']])
    expect(rows.map((r: { metadata: { original_sample_id: string } }) => r.metadata.original_sample_id)).toEqual(ds.sampleIds)
    expect(JSON.parse(native.metadata.mock.calls[0][0]).feature_names).toEqual(['near', 'far'])
    expect(served.identity).toBe(identity)
    expect(Array.from(served.X)).toEqual([1, 2, 3, 4])
    expect(Array.from(served.y)).toEqual([7, 9])
    expect(native.envelope).toHaveBeenCalledTimes(1)
    expect(served.envelopeJson).toContain('p4')
  })
})

describe('DMD scoped source materialization', () => {
  it('keeps ordered original sample/observation/group/origin handles and source while excluding held-out targets', async () => {
    const retained = { original: 'complete original source remains outside training authority' }
    const ds: MaterializedDataset = { [IO_RECORD]: retained, nSamples: 6, nFeatures: 2,
      X: Float64Array.from([100, 101, 1, 2, 3, 4, 5, 6, 7, 8, 200, 201]), y: Float64Array.from([1000, 7, 9, 7, 9, 2000]),
      sampleIds: ['held-A', 'repeat', 'parent', 'repeat', 'child', 'held-B'], observationIds: ['obs0', 'obs1', 'obs2', 'obs3', 'obs4', 'obs5'],
      partitions: ['test', 'train', 'train', 'train', 'train', 'test'], partitionNames: ['validation', 'cal', 'cal', 'cal', 'cal', 'validation'],
      groupIds: ['a-held', 'z-train', 'y-train', 'z-train', 'y-train', 'b-held'],
      originIds: [null, null, null, null, 'parent', null], augmented: [false, false, false, false, true, false],
      repetitionIds: ['r-heldA', 'r-repeat', 'r-parent', 'r-repeat', 'r-child', 'r-heldB'],
      axis: [1100, 1200], axisUnit: 'nm', featureNames: ['near', 'far'], targetName: 'glucose', taskType: 'regression',
    }
    const identity = physicalIdentity(ds), sourceRows = datasetRelations(ds, identity), ordered = [3, 1, 4, 2]
    const cohort = providerCohort(ds, identity, ordered)
    const served = await materializeViaProvider(cohort.ds, { identity: cohort.identity, featureNames: ds.featureNames!, targetNames: ['glucose'], relationRows: ordered.map(i => sourceRows[i]) })
    expect(cohort.identity.handles).toEqual(['p1', 'p3', 'p2'])
    expect(cohort.identity.sampleHandle).toEqual(['p1', 'p1', 'p3', 'p2'])
    expect(cohort.identity.observationHandle).toEqual(['s3', 's1', 's4', 's2'])
    expect(cohort.identity.repeated).toBe(true)
    expect(cohort.identity.rowsOf.get('p1')).toEqual([0, 1])
    expect(cohort.ds[IO_RECORD]).toBe(retained)
    expect(cohort.ds.axis).toBe(ds.axis)
    expect(cohort.ds.axisUnit).toBe('nm')
    expect(cohort.ds.partitionNames).toEqual(['cal', 'cal', 'cal', 'cal'])
    expect(Array.from(served.y)).toEqual([7, 7, 9, 9])
    expect(Array.from(served.X)).toEqual([5, 6, 1, 2, 7, 8, 3, 4])
    const rows = JSON.parse(native.relations.mock.calls[0][0]).rows
    expect(rows).toEqual(ordered.map(i => sourceRows[i]))
    expect(rows.map((row: { group_id: string }) => row.group_id)).toEqual(['g1', 'g1', 'g2', 'g2'])
    expect(rows[2].origin_id).toBe('s2')
    expect(rows.map((row: { repetition_id: string }) => row.repetition_id)).toEqual(ordered.map(i => sourceRows[i].repetition_id))
    expect(JSON.parse(native.schema.mock.calls[0][0]).sample_ids).toEqual(['p1', 'p3', 'p2'])
    expect(native.envelope).toHaveBeenCalledTimes(1)
    expect(served.envelopeJson).not.toContain('held-A')
    expect(Array.from(ds.y)).toEqual([1000, 7, 9, 7, 9, 2000])
  })
})
