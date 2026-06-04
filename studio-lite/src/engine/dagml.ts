// dag-ml-wasm participation: compile, validate AND execute the pipeline DSL through
// the real dag-ml coordinator (Rust → WASM). dag-ml is the reproducible ML
// coordinator of the ecosystem; it canonicalizes the linear pipeline into a GraphSpec
// and its SequentialScheduler runs FIT_CV in-browser (see dagml-engine.ts), invoking
// a JS controller that runs the numerics via libn4m. This module is the lighter
// compile/validate entry (used for the badge + as a fallback probe).
import type { PipelineDSL } from './types'

export interface DagMlLineage {
  engine: 'dag-ml-wasm'
  version: string | null
  compiled: boolean
  /** true when dag-ml's scheduler actually executed the phase (not just compiled) */
  executed?: boolean
  graph?: unknown
  nodeCount?: number
  error?: string
  /** the dag-ml-data provider layer that materialized & served the X/y blocks */
  dataProvider?: {
    layer: string
    status: string
    fingerprints?: { schema: string; plan: string; relation: string | null }
    representation?: string
    version?: string
    error?: string
  }
}

export type DagMlMod = typeof import('./wasm/dagml/dag_ml_wasm.js')
let modPromise: Promise<DagMlMod> | null = null
/** Lazily load + init the dag-ml-wasm module (shared by the badge + the executor). */
export async function loadDagMl(): Promise<DagMlMod> {
  if (!modPromise) {
    modPromise = (async () => {
      const m = await import('./wasm/dagml/dag_ml_wasm.js')
      await m.default()
      return m
    })()
  }
  return modPromise
}

export const dagMlAvailable = () => typeof location === 'undefined' || location.protocol !== 'file:'
const canUse = dagMlAvailable

// Map the studio-lite pipeline to dag-ml's nirs4all-compat DSL (accepted by the
// compatibility importer: bare "SNV"/"MSC", {preprocessing,params}, {model,params}).
export function toCompatDsl(dsl: PipelineDSL): object {
  const steps: unknown[] = [{ sources: ['x'] }]
  for (const s of dsl.steps) {
    if (s.type === 'StandardNormalVariate') steps.push('SNV')
    else if (s.type === 'MSC') steps.push('MSC')
    else steps.push({ preprocessing: s.type, params: s.params })
  }
  steps.push({ split: { type: 'KFold', n_splits: dsl.cv.folds } })
  steps.push({ model: dsl.model.type === 'PLSDA' ? 'PLSDA' : 'PLSRegression', params: dsl.model.params })
  return { id: `n4a-lite-${dsl.name}`.replace(/[^A-Za-z0-9_.:-]+/g, '-'), pipeline: steps }
}

/** Compile+validate a pipeline via dag-ml-wasm. Best-effort: never throws. */
export async function compileWithDagMl(dsl: PipelineDSL): Promise<DagMlLineage> {
  if (!canUse()) return { engine: 'dag-ml-wasm', version: null, compiled: false, error: 'dag-ml-wasm not loaded under file://' }
  try {
    const m = await loadDagMl()
    const json = JSON.stringify(toCompatDsl(dsl))
    m.validate_pipeline_dsl_json(json)
    const graphJson = m.compile_pipeline_dsl_graph_json(json)
    const graph = JSON.parse(graphJson) as { nodes?: unknown[] }
    return {
      engine: 'dag-ml-wasm',
      version: m.dag_ml_version(),
      compiled: true,
      graph,
      nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : undefined,
    }
  } catch (e) {
    return { engine: 'dag-ml-wasm', version: null, compiled: false, error: e instanceof Error ? e.message : String(e) }
  }
}
