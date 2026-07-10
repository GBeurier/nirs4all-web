import { rtErrorToWire, type RtErrorWire } from './rt'
import type { FittedPipeline, Metrics, PipelineDSL, PredRow, RunResult, ScoreKind, ScoreNode, TaskType } from './types'

export type RtExecutionBackend = 'local-python' | 'wasm-local' | 'cluster'
export type RtPredictionPartition = 'train' | 'validation' | 'test' | 'final'
export type RtPredictionArrayWire = number[] | number[][] | null

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
  y_true: RtPredictionArrayWire
  y_pred: RtPredictionArrayWire
  y_proba: RtPredictionArrayWire
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
      y_proba: null,
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
        allow_fallback: opts.allowFallback === true,
        scheduler_fallback: schedulerFallback,
        diagnostics: run.diagnostics?.length ?? 0,
      },
      portable_level: opts.portableLevel ?? null,
      files: {},
    },
    ...(run.diagnostics?.length ? { diagnostics: run.diagnostics.map(rtErrorToWire) } : {}),
  }
}

const TASK_TYPES = new Set<TaskType>(['regression', 'binary', 'multiclass'])
const METRIC_KEYS = new Set<keyof Metrics>(['rmse', 'r2', 'mae', 'accuracy', 'f1', 'n'])

const predictionKey = (block: RtPredictionBlockWire): string =>
  `${block.partition}:${block.fold_id ?? 'none'}:${block.variant_id ?? 'base'}`

const reportKey = (report: RtMetricReportWire): string =>
  `${report.partition}:${report.fold_id ?? 'none'}:${report.variant_id ?? 'base'}`

const asTaskType = (value: string): TaskType => {
  if (TASK_TYPES.has(value as TaskType)) return value as TaskType
  throw new Error(`unsupported rt_result task_type ${JSON.stringify(value)}`)
}

const asMetricKey = (value: string, taskType: TaskType): keyof Metrics => {
  if (METRIC_KEYS.has(value as keyof Metrics) && value !== 'n') return value as keyof Metrics
  return taskType === 'regression' ? 'rmse' : 'accuracy'
}

const firstFinite = (value: unknown, label: string): number => {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`${label} must contain finite numeric values for Web result rendering`)
  }
  return candidate
}

const scoreKindOf = (block: RtPredictionBlockWire): ScoreKind => {
  if (block.fold_id === 'avg') return 'cv'
  if (block.fold_id && block.fold_id !== 'final') return 'fold'
  return 'refit'
}

const scoreNameOf = (block: RtPredictionBlockWire, kind: ScoreKind): string => {
  if (kind === 'cv') return 'CV Scores'
  if (kind === 'fold') return String(block.fold_id ?? 'Fold').replace(/^fold[-_]?/i, 'Fold ')
  return block.partition === 'test' ? 'Refit test' : 'Refit'
}

const scoreNodeFromRtPrediction = (
  block: RtPredictionBlockWire,
  report: RtMetricReportWire | undefined,
): ScoreNode => {
  if (!Array.isArray(block.y_pred)) throw new Error(`rt_result prediction ${predictionKey(block)} has no y_pred array`)
  if (!Array.isArray(block.y_true)) throw new Error(`rt_result prediction ${predictionKey(block)} has no y_true array`)
  if (block.sample_indices.length !== block.y_pred.length || block.sample_indices.length !== block.y_true.length) {
    throw new Error(`rt_result prediction ${predictionKey(block)} row counts do not match`)
  }
  const metrics: Metrics = { ...(report?.metrics ?? {}), ...block.scores, n: block.sample_indices.length }
  const predictions = block.sample_indices.map((sampleIndex, index) => {
    const actual = firstFinite(block.y_true?.[index], `y_true[${index}]`)
    const predicted = firstFinite(block.y_pred?.[index], `y_pred[${index}]`)
    return {
      sampleId: `sample:${sampleIndex}`,
      actual,
      predicted,
      residual: actual - predicted,
    }
  })
  const kind = scoreKindOf(block)
  return {
    id: block.fold_id ? String(block.fold_id) : `score:${block.partition}`,
    name: scoreNameOf(block, kind),
    kind,
    metrics,
    predictions,
    status: 'completed',
  }
}

/**
 * Rehydrate a neutral RtResult envelope into Web's display-oriented RunResult.
 *
 * This does not invent a new execution path: it is used by import/smoke flows to
 * render externally-produced predictions through the same React results
 * components as a normal browser run.
 */
export function rtResultEnvelopeToDisplayRunResult(wire: RtResultWire): RunResult {
  if (wire.schema_version !== 1) throw new Error(`unsupported rt_result schema_version ${JSON.stringify(wire.schema_version)}`)
  if (!wire.predictions.length) throw new Error('rt_result must contain at least one prediction block')

  const reports = new Map(wire.reports.map((report) => [reportKey(report), report]))
  const scoreNodes = wire.predictions.map((block) => scoreNodeFromRtPrediction(block, reports.get(predictionKey(block))))
  const refit = scoreNodes.find((node) => node.kind === 'refit') ?? scoreNodes[scoreNodes.length - 1]
  const cv = scoreNodes.find((node) => node.kind === 'cv')
  const folds = scoreNodes.filter((node) => node.kind === 'fold')
  const firstPrediction = wire.predictions[0]
  const taskType = asTaskType(firstPrediction.task_type)
  for (const block of wire.predictions) {
    if (asTaskType(block.task_type) !== taskType) throw new Error('rt_result mixes task_type values')
  }

  const pipelineName = firstPrediction.model_name || wire.run_id || 'Imported RtResult'
  const dsl: PipelineDSL = {
    name: pipelineName,
    steps: [],
    model: {
      id: 'rt-result-imported-model',
      type: 'RtResultImported',
      params: { engine: wire.manifest.engine, plan_id: wire.plan_id },
    },
    ...(cv ? { cv: { folds: Math.max(1, folds.length), seed: 0 } } : {}),
  }
  const model: FittedPipeline = {
    dsl,
    taskType,
    nFeatures: 0,
    state: { importedRtResult: true, engine: wire.manifest.engine },
  }
  const variantIds = [...new Set(wire.predictions.map((block) => block.variant_id).filter((id): id is string => typeof id === 'string' && id.length > 0))]

  return {
    id: wire.run_id ?? `rt-result:${Date.now()}`,
    pipelineName,
    taskType,
    targetName: wire.reports[0]?.target_names?.[0] ?? 'target',
    refit,
    ...(cv ? { cv } : {}),
    folds,
    seed: 0,
    engine: wire.manifest.engine,
    scoreMetric: asMetricKey(firstPrediction.metric, taskType),
    lineage: {
      engine: wire.manifest.engine,
      planId: wire.plan_id,
      selectedVariant: wire.selection?.selected_variant ?? undefined,
      dataProvider: {
        layer: 'rt-result',
        status: 'materialized',
        fingerprints: wire.manifest.fingerprints,
      },
      importedRtResult: true,
    },
    model,
    createdAt: new Date().toISOString(),
    variantCount: variantIds.length || undefined,
    variants:
      variantIds.length > 1
        ? variantIds.map((variantId) => ({
            variantId,
            label: variantId,
            metrics: cv?.metrics ?? refit.metrics,
            selected: variantId === wire.selection?.selected_variant,
          }))
        : undefined,
    diagnostics: wire.diagnostics,
    rtResult: wire,
  }
}
