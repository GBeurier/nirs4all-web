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
import { loadDagMlDataWasm } from './nirs4all-core'
import type { MaterializedDataset } from './types'
import { datasetRelations, physicalIdentity, type PhysicalIdentity } from './relations'

type DagMlDataMod = typeof import('@/engine/wasm/dagml-data/dag_ml_data_wasm.js')

let modPromise: Promise<DagMlDataMod> | null = null
async function mod(): Promise<DagMlDataMod> {
  if (!modPromise) {
    modPromise = loadDagMlDataWasm()
  }
  return modPromise
}

export interface DataProviderResult {
  /** features served by the provider, row-major nSamples×nFeatures, in dataset order */
  X: Float64Array
  /** target served by the provider, in dataset order; NaN where the target is
   *  missing (those rows are `excluded` and absent from the target table) */
  y: Float64Array
  fingerprints: { schema: string; plan: string; relation: string | null }
  outputRepresentation: string
  version: string
  /** Validated native data-plan authority, not a host reconstruction. */
  envelopeJson: string
  /** The physical-sample (`p{k}`) / observation (`s{i}`) handles the envelope was built with. */
  identity: PhysicalIdentity
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

// dag-ml-data (like dag-ml) restricts ids to [A-Za-z0-9_-.:]; original sample ids may
// contain '#' or other characters. The provider is addressed with execution handles:
// observation `s{i}` (row i) and physical sample `p{k}`; blocks map back through the exact
// handle tables, and the original ids stay in ds.sampleIds and the relation metadata.
/** Internal binding for a restricted cohort; names and handles come from its original cohort. */
export interface ProviderBinding {
  identity: PhysicalIdentity
  featureNames: string[]
  targetNames: [string]
  /** Unchanged original source-table rows, selected before DMD builds S/records.
   *  Keeps global group/repetition/origin handles when restricting a cohort. */
  relationRows?: ReturnType<typeof datasetRelations>
}

/** Project already-validated row selections without changing execution handles.
 *  Callers retain the complete original source; no missing value is filled here. */
export function providerCohort(ds: MaterializedDataset, identity: PhysicalIdentity, indices: number[]): { ds: MaterializedDataset; identity: PhysicalIdentity } {
  const select = <T>(values: T[] | undefined) => values && indices.map(i => values[i])
  const X = new Float64Array(indices.length * ds.nFeatures)
  indices.forEach((row, i) => X.set(ds.X.subarray(row * ds.nFeatures, (row + 1) * ds.nFeatures), i * ds.nFeatures))
  const sampleHandle = indices.map(i => identity.sampleHandle[i])
  const rowsOf = new Map<string, number[]>()
  sampleHandle.forEach((id, i) => {
    const rows = rowsOf.get(id)
    if (rows) rows.push(i)
    else rowsOf.set(id, [i])
  })
  const cohort: MaterializedDataset = { ...ds, X, y: Float64Array.from(indices, i => ds.y[i]), nSamples: indices.length,
    sampleIds: indices.map(i => ds.sampleIds[i]), partitions: indices.map(i => ds.partitions[i]),
    observationIds: select(ds.observationIds), partitionNames: select(ds.partitionNames),
    yRaw: ds.yRaw && Float64Array.from(indices, i => ds.yRaw![i]), labelsRaw: select(ds.labelsRaw), classes: select(ds.classes),
    groupIds: select(ds.groupIds), originIds: select(ds.originIds), repetitionIds: select(ds.repetitionIds), augmented: select(ds.augmented),
    metadata: ds.metadata?.map(column => ({ ...column, values: indices.map(i => column.values[i]) })), folds: undefined,
  }
  const labels = (predict: boolean) => new Set(indices.flatMap(i => {
    const label = identity.physicalLabel[i]
    return label !== null && !ds.augmented?.[i] && (ds.partitions[i] === 'predict') === predict ? [label] : []
  }))
  const scored = labels(false), predicted = labels(true)
  return { ds: cohort, identity: { ...identity, sampleHandle, handles: [...rowsOf.keys()], rowsOf,
    observationHandle: indices.map(i => identity.observationHandle[i]), physicalLabel: indices.map(i => identity.physicalLabel[i]),
    repeated: [...rowsOf.values()].some(rows => rows.filter(i => !cohort.augmented?.[i]).length > 1),
    predictReuse: identity.predictReuse.filter(label => scored.has(label) && predicted.has(label)),
  } }
}

function buildSchema(ds: MaterializedDataset, identity: PhysicalIdentity, binding?: ProviderBinding) {
  const axisOk = ds.axis && ds.axis.length === ds.nFeatures
  const axisValues = axisOk ? Array.from(ds.axis) : Array.from({ length: ds.nFeatures }, (_, j) => j)
  const featureNames = binding?.featureNames ?? Array.from({ length: ds.nFeatures }, (_, j) => `w${j}`)
  return {
    schema: {
      dataset_id: ds.targetName ? `web-${ds.targetName}` : 'web-dataset',
      sample_ids: [...identity.handles],
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
              coordinate: { dtype: 'categorical', ordered: false, values: { kind: 'explicit', values: binding?.targetNames ?? [TARGET_ID] } },
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
export async function materializeViaProvider(ds: MaterializedDataset, binding?: ProviderBinding): Promise<DataProviderResult> {
  const m = await mod()
  const identity = binding?.identity ?? physicalIdentity(ds)
  const observationIds = identity.observationHandle
  const rowOfObservation = new Map(observationIds.map((id, i) => [id, i]))
  const { schema, featureNames } = buildSchema(ds, identity, binding)
  const schemaJson = JSON.stringify(schema)
  m.validate_dataset_schema_json(schemaJson)

  const planRequest = { id: 'nir-to-tabular', source_ids: [SOURCE_ID] }
  const dataPlanJson = m.plan_model_input_json(schemaJson, JSON.stringify(MODEL_INPUT), JSON.stringify(ADAPTER_REGISTRY), JSON.stringify(planRequest))
  const outputRepresentation = JSON.parse(dataPlanJson).output_representation as string

  const sampleRelations = {
    rows: binding?.relationRows ?? datasetRelations(ds, identity),
  }
  const sampleRelationsJson = JSON.stringify(sampleRelations)
  m.validate_sample_relation_table_json(sampleRelationsJson)

  const envelopeJson = m.build_coordinator_data_plan_envelope_json(schemaJson, dataPlanJson, sampleRelationsJson)
  m.validate_coordinator_data_plan_envelope_json(envelopeJson)
  const envelope = JSON.parse(envelopeJson)

  // target table (keyed by the physical sample p{k}) — one value per sample, the
  // dag-ml-data target grain (physicalIdentity refuses a sample whose scans disagree).
  // Only finite targets enter it: a missing target never crosses the boundary
  // (JSON would turn NaN into null). Its rows are `excluded` in the relations, so
  // the training view below drops them while the feature view keeps them.
  const labeled = identity.handles.filter((handle) => Number.isFinite(ds.y[identity.rowsOf.get(handle)![0]]))
  const targetTables = labeled.length ? [{ target_id: TARGET_ID, values: labeled.map((handle) => ({ sample_id: handle, value: ds.y[identity.rowsOf.get(handle)![0]] })) }] : null
  // Feature matrix: only the METADATA goes as JSON; the flat row-major values
  // cross as a typed Float64Array (one memcpy in WASM), never through
  // `JSON.stringify` + a boxed array. ds.X is already row-major in dataset
  // (= observation) order, so it maps 1:1 to `observation_ids` (s{i}). This is
  // the load-bearing fix for large datasets (e.g. Cassava 3021×1050): the old
  // JSON value-transport peaked at hundreds of MB and crashed the worker.
  const featureMeta = {
    feature_set_id: FEATURE_SET,
    representation_id: 'tabular_numeric',
    feature_names: featureNames,
    observation_ids: observationIds,
  }

  const provider = m.WasmInMemoryProvider.withF64Features(envelopeJson, targetTables && JSON.stringify(targetTables), JSON.stringify(featureMeta), ds.X)
  let dataHandle: string | null = null
  let viewHandle: string | null = null
  let trainingViewHandle: string | null = null
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
    viewHandle = provider.make_view(dataHandle, JSON.stringify({ sample_ids: identity.handles, include_augmented: true, include_excluded: true }))

    // Feature matrix via the TYPED path: a small layout JSON (ids + shape) plus
    // the flat row-major values as a Float64Array — no O(rows×cols) JSON string,
    // and (typed projection upstream) no boxed per-cell values in WASM either.
    // Consume the WASM block IMMEDIATELY (getter then into_values) so no error
    // path can strand the large buffer in WASM memory awaiting finalization.
    const fblock = provider.featureBlockF64(viewHandle, FEATURE_SET)
    const fLayoutStr = fblock.layout
    const fValues = fblock.into_values() // consumes the block; flat row-major, length n_rows*n_cols
    const fLayout = JSON.parse(fLayoutStr) as { observation_ids: string[]; sample_ids: string[]; n_rows: number; n_cols: number }

    // reconstruct in dataset order by OBSERVATION identity, asserting exact 1:1 coverage —
    // never train on zero-filled rows. A view over p{k} serves rows grouped by physical
    // sample, so the served order is not the dataset order once a sample repeats.
    const at = (id: string): number => {
      const i = rowOfObservation.get(id)
      if (i === undefined) throw new Error(`provider returned unknown observation id ${id}`)
      return i
    }
    if (fLayout.observation_ids.length !== ds.nSamples) throw new Error(`provider feature block covered ${fLayout.observation_ids.length}/${ds.nSamples} observations`)
    if (fLayout.n_cols !== ds.nFeatures) throw new Error(`provider feature block has ${fLayout.n_cols}/${ds.nFeatures} features`)
    if (fValues.length !== ds.nSamples * ds.nFeatures) throw new Error(`provider feature block has ${fValues.length} values, expected ${ds.nSamples * ds.nFeatures}`)

    // When the provider echoes dataset order (the steady state without repeats), adopt
    // the served buffer DIRECTLY: zero copy. Otherwise reorder by observation id
    // (row-block memcpy) with duplicate detection; full length + no dups ⇒ exact coverage.
    let X = fValues
    let inOrder = true
    for (let r = 0; r < fLayout.observation_ids.length; r++) {
      if (fLayout.observation_ids[r] !== observationIds[r]) {
        inOrder = false
        break
      }
    }
    if (!inOrder) {
      X = new Float64Array(ds.nSamples * ds.nFeatures)
      const seenX = new Uint8Array(ds.nSamples)
      for (let r = 0; r < fLayout.observation_ids.length; r++) {
        const i = at(fLayout.observation_ids[r])
        if (seenX[i]) throw new Error(`provider returned duplicate observation id ${fLayout.observation_ids[r]}`)
        seenX[i] = 1
        X.set(fValues.subarray(r * ds.nFeatures, (r + 1) * ds.nFeatures), i * ds.nFeatures)
      }
    }
    // Targets come from the training view (excluded rows dropped natively): one value per
    // labeled physical sample, served to every scan of that sample — never coerced.
    const y = new Float64Array(ds.nSamples).fill(NaN)
    if (labeled.length) {
      trainingViewHandle = provider.make_view(dataHandle, JSON.stringify({ sample_ids: identity.handles, include_augmented: true, include_excluded: false }))
      const tblock = JSON.parse(provider.target_block(trainingViewHandle, TARGET_ID)) as { sample_ids: string[]; values: unknown[] }
      if (tblock.sample_ids.length !== labeled.length) throw new Error(`provider target block covered ${tblock.sample_ids.length}/${labeled.length} labeled samples`)
      const seenY = new Set<string>()
      for (let r = 0; r < tblock.sample_ids.length; r++) {
        const handle = tblock.sample_ids[r]
        const rows = identity.rowsOf.get(handle)
        const value = tblock.values[r]
        if (!rows) throw new Error(`provider returned unknown sample id ${handle}`)
        if (seenY.has(handle)) throw new Error(`provider returned duplicate target sample id ${handle}`)
        if (typeof value !== 'number' || !Number.isFinite(value) || rows.some((i) => !Number.isFinite(ds.y[i]))) throw new Error(`provider served an invalid target for sample ${handle}`)
        seenY.add(handle)
        for (const i of rows) y[i] = value
      }
    }

    return {
      X,
      y,
      fingerprints: { schema: envelope.schema_fingerprint, plan: envelope.plan_fingerprint, relation: envelope.relation_fingerprint ?? null },
      outputRepresentation,
      version: m.dag_ml_data_version(),
      envelopeJson,
      identity,
    }
  } finally {
    try {
      if (trainingViewHandle !== null) provider.release(trainingViewHandle)
      if (viewHandle !== null) provider.release(viewHandle)
      if (dataHandle !== null) provider.release(dataHandle)
      provider.free?.()
    } catch {
      /* best-effort cleanup */
    }
  }
}
