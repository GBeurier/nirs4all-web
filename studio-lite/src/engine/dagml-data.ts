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

// dag-ml-data (like dag-ml) restricts SampleId to [A-Za-z0-9_-.:]; studio sample
// ids may contain '#' or other characters. Address the provider with stable
// row-index ids and map blocks back by index — original ds.sampleIds stay for UI.
const canonicalIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i}`)
const rowOfCanonical = (id: string): number => Number(id.slice(1))

function buildSchema(ds: MaterializedDataset) {
  const axisOk = ds.axis && ds.axis.length === ds.nFeatures
  const axisValues = axisOk ? Array.from(ds.axis) : Array.from({ length: ds.nFeatures }, (_, j) => j)
  const featureNames = Array.from({ length: ds.nFeatures }, (_, j) => `w${j}`)
  return {
    schema: {
      dataset_id: ds.targetName ? `web-${ds.targetName}` : 'web-dataset',
      sample_ids: canonicalIds(ds.nSamples),
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
  const cids = canonicalIds(ds.nSamples) // dag-ml-data-safe ids (row-index based)
  const { schema, featureNames } = buildSchema(ds)
  const schemaJson = JSON.stringify(schema)
  m.validate_dataset_schema_json(schemaJson)

  const planRequest = { id: 'nir-to-tabular', source_ids: [SOURCE_ID] }
  const dataPlanJson = m.plan_model_input_json(schemaJson, JSON.stringify(MODEL_INPUT), JSON.stringify(ADAPTER_REGISTRY), JSON.stringify(planRequest))
  const outputRepresentation = JSON.parse(dataPlanJson).output_representation as string

  const sampleRelations = {
    rows: cids.map((sid) => ({
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

  // target table (keyed by sample_id) — small (one value per sample), stays JSON.
  const targetTables = [{ target_id: TARGET_ID, values: cids.map((sid, i) => ({ sample_id: sid, value: ds.y[i] })) }]
  // Feature matrix: only the METADATA goes as JSON; the flat row-major values
  // cross as a typed Float64Array (one memcpy in WASM), never through
  // `JSON.stringify` + a boxed array. ds.X is already row-major in dataset
  // (= observation) order, so it maps 1:1 to `observation_ids` (cids). This is
  // the load-bearing fix for large datasets (e.g. Cassava 3021×1050): the old
  // JSON value-transport peaked at hundreds of MB and crashed the worker.
  const featureMeta = {
    feature_set_id: FEATURE_SET,
    representation_id: 'tabular_numeric',
    feature_names: featureNames,
    observation_ids: cids,
  }

  const provider = m.WasmInMemoryProvider.withF64Features(envelopeJson, JSON.stringify(targetTables), JSON.stringify(featureMeta), ds.X)
  let dataHandle: string | null = null
  let viewHandle: string | null = null
  try {
    const matRequest = {
      run_id: 'run:web',
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
    dataHandle = provider.materialize(JSON.stringify(matRequest))
    viewHandle = provider.make_view(dataHandle, JSON.stringify({ sample_ids: cids, include_augmented: false }))

    // Feature matrix via the TYPED path: a small layout JSON (ids + shape) plus
    // the flat row-major values as a Float64Array — no O(rows×cols) JSON string,
    // and (typed projection upstream) no boxed per-cell values in WASM either.
    // Consume the WASM block IMMEDIATELY (getter then into_values) so no error
    // path can strand the large buffer in WASM memory awaiting finalization.
    const fblock = provider.featureBlockF64(viewHandle, FEATURE_SET)
    const fLayoutStr = fblock.layout
    const fValues = fblock.into_values() // consumes the block; flat row-major, length n_rows*n_cols
    const fLayout = JSON.parse(fLayoutStr) as { sample_ids: string[]; n_rows: number; n_cols: number }
    const tblock = JSON.parse(provider.target_block(viewHandle, TARGET_ID)) as { sample_ids: string[]; values: number[] }

    // reconstruct in dataset order, asserting exact 1:1 coverage — never train on
    // zero-filled rows. Any gap/dup/width mismatch throws → visible degraded path.
    const at = (id: string): number => {
      const i = rowOfCanonical(id)
      if (!Number.isInteger(i) || i < 0 || i >= ds.nSamples) throw new Error(`provider returned unknown sample id ${id}`)
      return i
    }
    if (fLayout.sample_ids.length !== ds.nSamples) throw new Error(`provider feature block covered ${fLayout.sample_ids.length}/${ds.nSamples} samples`)
    if (fLayout.n_cols !== ds.nFeatures) throw new Error(`provider feature block has ${fLayout.n_cols}/${ds.nFeatures} features`)
    if (fValues.length !== ds.nSamples * ds.nFeatures) throw new Error(`provider feature block has ${fValues.length} values, expected ${ds.nSamples * ds.nFeatures}`)
    if (tblock.sample_ids.length !== ds.nSamples) throw new Error(`provider target block covered ${tblock.sample_ids.length}/${ds.nSamples} samples`)

    // The provider serves rows in relation order, which we registered as
    // s0..s{n-1} — when it echoes that identity ordering (the steady state),
    // adopt the served buffer DIRECTLY: zero copy. Anything else falls back to
    // an explicit reorder by sampleId (row-block memcpy), with duplicate
    // detection; full length + no dups ⇒ exact coverage either way.
    let X = fValues
    let identity = true
    for (let r = 0; r < fLayout.sample_ids.length; r++) {
      if (fLayout.sample_ids[r] !== `s${r}`) {
        identity = false
        break
      }
    }
    if (!identity) {
      X = new Float64Array(ds.nSamples * ds.nFeatures)
      const seenX = new Uint8Array(ds.nSamples)
      for (let r = 0; r < fLayout.sample_ids.length; r++) {
        const i = at(fLayout.sample_ids[r])
        if (seenX[i]) throw new Error(`provider returned duplicate sample id ${fLayout.sample_ids[r]}`)
        seenX[i] = 1
        X.set(fValues.subarray(r * ds.nFeatures, (r + 1) * ds.nFeatures), i * ds.nFeatures)
      }
    }
    const y = new Float64Array(ds.nSamples)
    const seenY = new Uint8Array(ds.nSamples)
    for (let r = 0; r < tblock.sample_ids.length; r++) {
      const i = at(tblock.sample_ids[r])
      if (seenY[i]) throw new Error(`provider returned duplicate target sample id ${tblock.sample_ids[r]}`)
      seenY[i] = 1
      y[i] = Number(tblock.values[r])
    }

    return {
      X,
      y,
      fingerprints: { schema: envelope.schema_fingerprint, plan: envelope.plan_fingerprint, relation: envelope.relation_fingerprint ?? null },
      outputRepresentation,
      version: m.dag_ml_data_version(),
    }
  } finally {
    try {
      if (viewHandle !== null) provider.release(viewHandle)
      if (dataHandle !== null) provider.release(dataHandle)
      provider.free?.()
    } catch {
      /* best-effort cleanup */
    }
  }
}
