// dag-ml-data: the typed, sample-aligned DATA-CONTRACT layer of the stack
// (formats → io → dag-ml-data → dag-ml + methods). We hand the materialized
// dataset to dag-ml-data's WasmInMemoryProvider: it builds a CoordinatorDataPlan
// envelope (schema + plan + sample relations, fingerprinted), materializes the
// data, and serves the feature/target blocks the model trains on — by sampleId,
// never by row order. The provider is the single source of truth for the numbers
// that reach dag-ml + nirs4all-methods.
//
// Loaded on demand; if the provider is unavailable the caller proceeds with the
// in-memory matrices and records the degraded status in lineage (never silent).
import type { MaterializedDataset } from './types'

type DagMlDataMod = typeof import('@/engine/wasm/dagml-data/dag_ml_data_wasm.js')

let modPromise: Promise<DagMlDataMod> | null = null
async function mod(): Promise<DagMlDataMod> {
  if (!modPromise) {
    modPromise = (async () => {
      const m = await import('@/engine/wasm/dagml-data/dag_ml_data_wasm.js')
      await m.default()
      return m
    })()
  }
  return modPromise
}

export interface DataProviderResult {
  /** features served by the provider, row-major nSamples×nFeatures, in dataset order */
  X: Float64Array
  /** target served by the provider, in dataset order */
  y: Float64Array
  fingerprints: { schema: string; plan: string; relation: string | null }
  outputRepresentation: string
  version: string
}

/** Is the dag-ml-data provider WASM loadable in this environment? */
export async function dagMlDataAvailable(): Promise<boolean> {
  try {
    await mod()
    return true
  } catch {
    return false
  }
}

const FEATURE_SET = 'X'
const TARGET_ID = 'y'
const SOURCE_ID = 'nir'

function buildSchema(ds: MaterializedDataset) {
  const axisOk = ds.axis && ds.axis.length === ds.nFeatures
  const axisValues = axisOk ? Array.from(ds.axis) : Array.from({ length: ds.nFeatures }, (_, j) => j)
  const featureNames = Array.from({ length: ds.nFeatures }, (_, j) => `w${j}`)
  return {
    schema: {
      dataset_id: ds.targetName ? `lite-${ds.targetName}` : 'lite-dataset',
      sample_ids: ds.sampleIds,
      sources: [
        {
          id: SOURCE_ID,
          name: 'NIR spectrum',
          type_id: 'dense_signal',
          modality: 'spectroscopy',
          native_representation: {
            id: 'signal_1d',
            type_id: 'dense_signal',
            rank: 2,
            axes: [
              { name: 'sample', kind: 'sample', unit: null, size: ds.nSamples, variable: false },
              {
                name: 'wavelength',
                kind: 'wavelength',
                unit: ds.axisUnit || 'index',
                size: ds.nFeatures,
                variable: false,
                coordinate: { dtype: 'numeric', ordered: true, values: { kind: 'explicit', values: axisValues } },
              },
            ],
            container: 'ndarray',
            dtype: 'float64',
            sparse: false,
            ragged: false,
          },
          sample_key: 'sample_id',
          granularity: 'per_sample',
          schema: {},
          tags: {},
        },
      ],
      targets: {
        [TARGET_ID]: {
          id: 'tabular_numeric',
          type_id: 'table',
          rank: 2,
          axes: [
            { name: 'sample', kind: 'sample', unit: null, size: ds.nSamples, variable: false },
            {
              name: 'target',
              kind: 'target',
              unit: null,
              size: 1,
              variable: false,
              coordinate: { dtype: 'categorical', ordered: false, values: { kind: 'explicit', values: [TARGET_ID] } },
            },
          ],
          container: 'dataframe',
          dtype: 'float64',
          sparse: false,
          ragged: false,
        },
      },
      metadata: {},
    },
    featureNames,
  }
}

const MODEL_INPUT = {
  ports: [{ name: 'X', accepted_representations: ['tabular_numeric'], accepted_types: ['table'], rank: 2, multi_source: true, optional: false }],
  default_fusion: { mode: 'concat_features', alignment: 'left', allow_lossy_adapters: false },
}
const ADAPTER_REGISTRY = {
  adapters: [
    {
      id: 'spectra.flatten',
      version: '0.1.0',
      input_type: 'dense_signal',
      input_representation: 'signal_1d',
      output_type: 'table',
      output_representation: 'tabular_numeric',
      cost: 1,
      lossy: false,
      supervised: false,
      stateful: false,
      deterministic: true,
      fit_scope: 'stateless',
      params: {},
    },
  ],
}

/**
 * Run the dataset through the dag-ml-data provider and return the feature/target
 * blocks it serves (reconstructed in dataset order). Throws if the provider is
 * unavailable or rejects the contract — the caller decides how to degrade.
 */
export async function materializeViaProvider(ds: MaterializedDataset): Promise<DataProviderResult> {
  const m = await mod()
  const { schema, featureNames } = buildSchema(ds)
  const schemaJson = JSON.stringify(schema)
  m.validate_dataset_schema_json(schemaJson)

  const planRequest = { id: 'nir-to-tabular', source_ids: [SOURCE_ID] }
  const dataPlanJson = m.plan_model_input_json(schemaJson, JSON.stringify(MODEL_INPUT), JSON.stringify(ADAPTER_REGISTRY), JSON.stringify(planRequest))
  const outputRepresentation = JSON.parse(dataPlanJson).output_representation as string

  const sampleRelations = {
    rows: ds.sampleIds.map((sid) => ({
      observation_id: sid,
      sample_id: sid,
      source_id: SOURCE_ID,
      target_id: TARGET_ID,
      group_id: null,
      origin_id: null,
      repetition_id: 'rep.0',
      augmented: false,
      excluded: false,
      metadata: {},
    })),
  }
  const sampleRelationsJson = JSON.stringify(sampleRelations)
  m.validate_sample_relation_table_json(sampleRelationsJson)

  const envelopeJson = m.build_coordinator_data_plan_envelope_json(schemaJson, dataPlanJson, sampleRelationsJson)
  m.validate_coordinator_data_plan_envelope_json(envelopeJson)
  const envelope = JSON.parse(envelopeJson)

  // target table (keyed by sample_id) + numeric feature matrix (keyed by observation_id)
  const targetTables = [{ target_id: TARGET_ID, values: ds.sampleIds.map((sid, i) => ({ sample_id: sid, value: ds.y[i] })) }]
  const featureMatrices = [
    {
      feature_set_id: FEATURE_SET,
      representation_id: 'tabular_numeric',
      feature_names: featureNames,
      observation_ids: ds.sampleIds,
      values: Array.from(ds.X),
    },
  ]

  const provider = new m.WasmInMemoryProvider(envelopeJson, JSON.stringify(targetTables), null, JSON.stringify(featureMatrices))
  try {
    const matRequest = {
      run_id: 'run:lite',
      node_id: 'model:base',
      input_name: 'x',
      phase: 'FIT_CV',
      variant_id: 'variant:base',
      fold_id: 'fold:all',
      request_id: 'nir-to-tabular',
      schema_fingerprint: envelope.schema_fingerprint,
      plan_fingerprint: envelope.plan_fingerprint,
      relation_fingerprint: envelope.relation_fingerprint,
      output_representation: outputRepresentation,
      source_ids: [SOURCE_ID],
      require_relations: true,
    }
    const dataHandle = provider.materialize(JSON.stringify(matRequest))
    const viewHandle = provider.make_view(dataHandle, JSON.stringify({ sample_ids: ds.sampleIds, include_augmented: false }))

    const fblock = JSON.parse(provider.feature_block(viewHandle, FEATURE_SET)) as { sample_ids: string[]; values: number[][] }
    const tblock = JSON.parse(provider.target_block(viewHandle, TARGET_ID)) as { sample_ids: string[]; values: number[] }

    // reconstruct in dataset order (provider blocks are aligned to their own sample_ids)
    const pos = new Map(ds.sampleIds.map((s, i) => [s, i]))
    const X = new Float64Array(ds.nSamples * ds.nFeatures)
    for (let r = 0; r < fblock.sample_ids.length; r++) {
      const i = pos.get(fblock.sample_ids[r])
      if (i === undefined) continue
      const row = fblock.values[r]
      for (let j = 0; j < ds.nFeatures; j++) X[i * ds.nFeatures + j] = Number(row[j])
    }
    const y = new Float64Array(ds.nSamples)
    for (let r = 0; r < tblock.sample_ids.length; r++) {
      const i = pos.get(tblock.sample_ids[r])
      if (i === undefined) continue
      y[i] = Number(tblock.values[r])
    }

    provider.release(viewHandle)
    provider.release(dataHandle)

    return {
      X,
      y,
      fingerprints: { schema: envelope.schema_fingerprint, plan: envelope.plan_fingerprint, relation: envelope.relation_fingerprint ?? null },
      outputRepresentation,
      version: m.dag_ml_data_version(),
    }
  } catch (e) {
    try {
      provider.free?.()
    } catch {
      /* ignore */
    }
    throw e
  }
}
