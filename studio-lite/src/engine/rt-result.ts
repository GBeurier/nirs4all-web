import { rtErrorToWire, type RtErrorWire } from './rt'
import type { Metrics, PredRow, RunResult, ScoreNode } from './types'

export type RtExecutionBackend = 'local-python' | 'wasm-local' | 'cluster'
export type RtPredictionPartition = 'train' | 'validation' | 'test' | 'final'

export interface RtMetricReportWire {
  prediction_id?: string | null
  variant_id?: string | null
  variant_label?: string | null
  producer_node: string
  partition: RtPredictionPartition
  fold_id: string | null
  level: 'sample'
  row_count: number
  target_width: number
  target_names: string[]
  metrics: Record<string, number>
}

export interface RtPredictionBlockWire {
  partition: RtPredictionPartition
  fold_id: string | null
  variant_id: string | null
  model_name: string
  sample_indices: number[]
  y_true: number[]
  y_pred: number[]
  scores: Record<string, number>
  metric: string
  task_type: string
}

export interface RtResultWire {
  schema_version: 1
  run_id: string | null
  plan_id: string | null
  selection: { selected_variant: string | null } | null
  reports: RtMetricReportWire[]
  predictions: RtPredictionBlockWire[]
  manifest: {
    engine: string
    fingerprints: Record<string, unknown>
    capabilities: Record<string, unknown>
    portable_level: string | null
    files: Record<string, unknown>
  }
  artifacts?: unknown[] | null
  diagnostics?: RtErrorWire[]
}

export interface RtResultOptions {
  executionBackend?: RtExecutionBackend
  allowFallback?: boolean
  planId?: string | null
  portableLevel?: string | null
}

type LineageLike = {
  selectedVariant?: unknown
  schedulerFallback?: unknown
  dataProvider?: unknown
}

type DataProviderLike = {
  fingerprints?: unknown
}

type FingerprintsLike = {
  schema?: unknown
  plan?: unknown
  relation?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteMetrics = (metrics: Metrics): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(metrics)) {
    if (key === 'n') continue
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

const lineageOf = (run: RunResult): LineageLike =>
  isRecord(run.lineage) ? (run.lineage as LineageLike) : {}

const dataProviderFingerprints = (lineage: LineageLike): FingerprintsLike => {
  const provider = isRecord(lineage.dataProvider) ? (lineage.dataProvider as DataProviderLike) : {}
  return isRecord(provider.fingerprints) ? (provider.fingerprints as FingerprintsLike) : {}
}

const selectedVariantOf = (run: RunResult): string | null => {
  const lineage = lineageOf(run)
  if (typeof lineage.selectedVariant === 'string') return lineage.selectedVariant
  const selected = run.variants?.find((v) => v.selected)
  return selected?.variantId ?? null
}

const producerNodeOf = (run: RunResult): string => {
  const stepCount = run.model.dsl.steps.length
  return `model:compat.${stepCount}`
}

const partitionOf = (score: ScoreNode): RtPredictionPartition => {
  if (score.kind === 'cv' || score.kind === 'fold') return 'validation'
  return /test/i.test(score.name) ? 'test' : 'train'
}

const foldIdOf = (score: ScoreNode): string | null => {
  if (score.kind === 'cv') return 'avg'
  if (score.kind === 'fold') return score.id
  return 'final'
}

const predictionIdOf = (producerNode: string, variantId: string | null, foldId: string | null): string =>
  `pred:${producerNode}:${variantId ?? 'base'}:${foldId ?? 'none'}`

const targetWidthOf = (run: RunResult): number =>
  run.taskType === 'regression' ? 1 : Math.max(1, run.model.classes?.length ?? 1)

const scoreNodesOf = (run: RunResult): ScoreNode[] => [
  ...(run.cv ? [run.cv] : []),
  ...run.folds,
  run.refit,
]

const sampleIndexOf = (run: RunResult): Map<string, number> => {
  const map = new Map<string, number>()
  for (const score of scoreNodesOf(run)) {
    for (const row of score.predictions) {
      if (!map.has(row.sampleId)) map.set(row.sampleId, map.size)
    }
  }
  return map
}

const rowIndices = (rows: PredRow[], index: Map<string, number>): number[] =>
  rows.map((row) => index.get(row.sampleId) ?? -1)

/**
 * Project Web's nested RunResult view into the neutral RtResult v1 wire envelope.
 *
 * This is intentionally a projection, not a new execution path: dag-ml/Python own
 * the native score/prediction contracts, while Web keeps its UI-friendly RunResult.
 * The projection gives tests and export consumers the same top-level semantics:
 * schema_version belongs to RtResult, diagnostics are RtError wire dictionaries
 * with no in-memory detail, and fallback state is explicit metadata rather than a
 * silent successful run.
 */
export function runResultToRtResultEnvelope(run: RunResult, opts: RtResultOptions = {}): RtResultWire {
  const lineage = lineageOf(run)
  const fingerprints = dataProviderFingerprints(lineage)
  const selectedVariant = selectedVariantOf(run)
  const reportVariantId = (run.variantCount ?? 1) > 1 ? selectedVariant : null
  const producerNode = producerNodeOf(run)
  const targetWidth = targetWidthOf(run)
  const sampleIndex = sampleIndexOf(run)
  const scoreNodes = scoreNodesOf(run)
  const planId = opts.planId ?? null
  const schedulerFallback = lineage.schedulerFallback === true

  const reports = scoreNodes.map((score) => {
    const partition = partitionOf(score)
    const foldId = foldIdOf(score)
    const metrics = finiteMetrics(score.metrics)
    return {
      prediction_id: predictionIdOf(producerNode, reportVariantId, foldId),
      variant_id: reportVariantId,
      producer_node: producerNode,
      partition,
      fold_id: foldId,
      level: 'sample' as const,
      row_count: Math.trunc(score.metrics.n ?? score.predictions.length),
      target_width: targetWidth,
      target_names: [run.targetName],
      metrics,
    }
  })

  const predictions = scoreNodes.map((score) => {
    const partition = partitionOf(score)
    const foldId = foldIdOf(score)
    return {
      partition,
      fold_id: foldId,
      variant_id: reportVariantId,
      model_name: run.pipelineName,
      sample_indices: rowIndices(score.predictions, sampleIndex),
      y_true: score.predictions.map((row) => row.actual),
      y_pred: score.predictions.map((row) => row.predicted),
      scores: finiteMetrics(score.metrics),
      metric: String(run.scoreMetric),
      task_type: run.taskType,
    }
  })

  return {
    schema_version: 1,
    run_id: run.id ?? null,
    plan_id: planId,
    selection: selectedVariant ? { selected_variant: selectedVariant } : null,
    reports,
    predictions,
    manifest: {
      engine: run.engine,
      fingerprints: {
        run_id: run.id,
        plan_id: planId,
        schema: typeof fingerprints.schema === 'string' ? fingerprints.schema : null,
        plan: typeof fingerprints.plan === 'string' ? fingerprints.plan : null,
        relation: typeof fingerprints.relation === 'string' ? fingerprints.relation : null,
      },
      capabilities: {
        execution_backend: opts.executionBackend ?? 'wasm-local',
        task_type: run.taskType,
        score_metric: run.scoreMetric,
        allow_fallback: opts.allowFallback ?? true,
        scheduler_fallback: schedulerFallback,
        diagnostics: run.diagnostics?.length ?? 0,
      },
      portable_level: opts.portableLevel ?? null,
      files: {},
    },
    ...(run.diagnostics?.length ? { diagnostics: run.diagnostics.map(rtErrorToWire) } : {}),
  }
}
