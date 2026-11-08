import type { ChainPredictions, InspectorChain, ScoreRef } from 'nirs4all-ui/inspector'
import type { MaterializedDataset, Metrics, PredRow, RunResult } from '@/engine/types'
import { variantChains } from './_helpers'

const DIRECTIONS = { rmse: true, mae: true, r2: false, accuracy: false, f1: false } as const
type Metric = keyof typeof DIRECTIONS
const knownMetric = (key: string): key is Metric => Object.hasOwn(DIRECTIONS, key)
const valueOf = (metrics: Metrics | undefined, metric: Metric): number | null => {
  const value = metrics?.[metric]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Same owner score-node context used by engine/rt-result.ts; no row inference. */
const selectionValidation = (run: RunResult): boolean => run.refit.scoreContext?.evaluation === 'selection_validation'
export const refitIsTest = (run: RunResult): boolean => !selectionValidation(run) && /test/i.test(run.refit.name)

/** Project owner results only; no scoring, selection, averaging or row joins by position. */
export function inspectorResults(runs: readonly RunResult[], dataset: MaterializedDataset | null, datasetName: string) {
  const metrics: Metric[] = []
  const offer = (key: string) => { if (knownMetric(key) && !metrics.includes(key)) metrics.push(key) }
  for (const run of runs) offer(run.scoreMetric)
  for (const run of runs) {
    for (const node of [run.cv, run.refit, ...run.folds]) if (node) Object.keys(node.metrics).forEach(offer)
    for (const variant of run.variants ?? []) Object.keys(variant.metrics).forEach(offer)
  }
  const scoreRefs: ScoreRef[] = []
  const addRefs = (suffix: string, partition: string, protocol: string, label: string) => {
    for (const metric of metrics) scoreRefs.push({ key: `${metric}:${suffix}`, metric, partition, protocol,
      label: `${metric.toUpperCase()} · ${label}`, lowerIsBetter: DIRECTIONS[metric] })
  }
  if (runs.some((run) => run.cv)) addRefs('cv', 'validation', 'cv', 'CV validation')
  if (runs.some(selectionValidation)) addRefs('selection-validation', 'validation', 'selection_validation', 'Selection validation')
  if (runs.some(refitIsTest)) addRefs('refit', 'test', 'final', 'Refit · test')
  if (runs.some((run) => !refitIsTest(run) && !selectionValidation(run))) addRefs(runs.some(refitIsTest) ? 'refit-resubstitution' : 'refit', 'train', 'refit-resubstitution', 'Refit · train (resubstitution)')
  // A refit-only training score requires an explicit host opt-in to display.
  const defaultScoreRef = scoreRefs.find((ref) => ref.protocol === 'cv')?.key
    ?? scoreRefs.find((ref) => ref.protocol === 'selection_validation')?.key
    ?? scoreRefs.find((ref) => ref.protocol === 'final')?.key ?? null
  const chains: InspectorChain[] = []
  const predictions: Record<string, ChainPredictions> = {}
  const unavailablePredictions: Record<string, string> = {}
  const defaultCompare: string[] = []
  const chainRuns = new Map<string, RunResult>()
  const warnings: string[] = []
  let sampleLinking = !dataset || new Set(dataset.sampleIds).size === dataset.sampleIds.length
  for (const run of runs) {
    const hasVariants = Boolean(run.variants?.length)
    const variants = hasVariants ? run.variants! : [{
      variantId: 'single', label: run.pipelineName, selected: true, pipeline: run.model.dsl, metrics: run.cv?.metrics ?? (selectionValidation(run) ? run.refit.metrics : {}),
    }]
    const projected = variantChains(variants, run.taskType).chains
    for (const variant of variants) {
      const id = JSON.stringify([run.id, variant.variantId])
      const base = projected.get(variant.variantId)!
      const scores: Record<string, number | null> = {}
      const foldScores: Record<string, readonly number[]> = {}
      for (const ref of scoreRefs) {
        const metric = ref.metric as Metric
        const contextMatches = ref.protocol === 'selection_validation' ? selectionValidation(run)
          : ref.protocol === 'final' ? refitIsTest(run)
          : ref.protocol === 'refit-resubstitution' ? !refitIsTest(run) && !selectionValidation(run) : Boolean(run.cv)
        scores[ref.key] = !contextMatches ? null : ref.protocol === 'selection_validation'
          ? valueOf(variant.metrics, metric) : ref.protocol === 'cv'
          ? valueOf(hasVariants ? variant.metrics : run.cv?.metrics, metric)
          : variant.selected ? valueOf(run.refit.metrics, metric) : null
        if (variant.selected && ref.protocol === 'cv' && run.folds.length > 0) {
          const values = run.folds.map((fold) => valueOf(fold.metrics, metric))
          // The UI fold contract cannot carry nulls. Omit an incomplete vector;
          // never change its fold alignment by filtering or fill with zeros.
          if (values.every((value): value is number => value !== null)) foldScores[ref.key] = values
        }
      }
      const nodes = variant.selected ? [run.cv, run.refit] : [run.cv ?? run.refit]
      const status: InspectorChain['status'] = nodes.some((node) => node?.status === 'failed') ? 'failed'
        : nodes.some((node) => node?.status === 'running') ? 'partial' : 'ok'
      chains.push({ ...base, id, runId: run.id, runLabel: run.pipelineName,
        dataset: datasetName, target: run.targetName, scores, foldScores,
        params: variant.pipeline?.model ? Object.fromEntries(Object.entries(variant.pipeline.model.params)
          .map(([name, value]) => [name, typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
            ? value : value == null ? null : JSON.stringify(value) ?? null])) : undefined,
        status,
        attributes: { selection: variant.selected ? 'dag-ml selected' : 'evaluated variant' },
      })
      chainRuns.set(id, run)
      if (!variant.selected) {
        unavailablePredictions[id] = 'Predictions unavailable in Web for a non-selected variant; only owner scores were retained.'
        continue
      }
      defaultCompare.push(id)
      const rows: { row: PredRow; partition: string; fold: string | null }[] = []
      const foldBySample = new Map<string, string | null>()
      for (const fold of run.folds) for (const row of fold.predictions) {
        foldBySample.set(row.sampleId, foldBySample.has(row.sampleId) ? null : fold.id)
      }
      for (const row of run.cv?.predictions ?? []) rows.push({ row, partition: 'validation', fold: foldBySample.get(row.sampleId) ?? null })
      if (selectionValidation(run)) for (const row of run.refit.predictions) rows.push({ row, partition: 'validation', fold: null })
      if (refitIsTest(run)) for (const row of run.refit.predictions) rows.push({ row, partition: 'test', fold: null })
      const unique = new Set(rows.map(({ row }) => row.sampleId)).size === rows.length
      const linkable = sampleLinking && unique
      if (!unique) sampleLinking = false
      if (rows.length === 0) {
        unavailablePredictions[id] = 'Predictions unavailable in Web: no owner CV or held-out test predictions; train resubstitution is excluded.'
        continue
      }
      predictions[id] = {
        chainId: id,
        // Local keys keep every observation visible; they are never used for
        // cross-chain linking when canonical observation identity is missing.
        sampleKeys: rows.map(({ row, partition }, index) => linkable ? row.sampleId : JSON.stringify([run.id, partition, index])),
        yTrue: rows.map(({ row }) => run.taskType === 'regression' ? row.actual : row.actualLabel ?? run.model.classes?.[row.actual] ?? row.actual),
        yPred: rows.map(({ row }) => run.taskType === 'regression' ? row.predicted : row.predictedLabel ?? run.model.classes?.[row.predicted] ?? row.predicted),
        partition: rows.map(({ partition }) => partition),
        fold: rows.map(({ fold }) => linkable ? fold : null),
        classes: run.model.classes,
      }
    }
  }
  if (!sampleLinking) warnings.push('Cross-chain agreement and sample linking are unavailable in Web: repeated sample IDs have no canonical row identity in owner predictions. Every prediction is retained separately.')
  return { chains, scoreRefs, defaultScoreRef, predictions, unavailablePredictions, defaultCompare, chainRuns, sampleLinking, warnings }
}
