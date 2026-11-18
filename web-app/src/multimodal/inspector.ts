import type { ChainPredictions, InspectorChain, ScoreRef } from 'nirs4all-ui/inspector'
import type { LabCandidateResult, LabDataset, LabPipelineDocument, LabRunResult } from './types'
import { FUSION_LEVEL_LABEL, fusionLevel, operatorName } from './fusion'

/**
 * Projection of completed laboratory runs onto the shared Inspector contract.
 * Scores and predictions are the native owner outputs; nothing is rescored,
 * averaged or joined by position here.
 */

/** One completed pipeline run kept for comparison. */
export interface LabRunRecord {
  /** Unique within the page session. */
  id: string
  index: number
  /** Short recipe name (the preset label, or "Edited pipeline"). */
  name: string
  document: LabPipelineDocument
  /** Canonical pipeline as edited (bypass wrappers removed). */
  canonical: unknown
  candidate: LabCandidateResult
  /** Native cohorts and folds of the execution that produced the run. */
  protocol: Pick<LabRunResult, 'calibrationIds' | 'holdoutIds' | 'folds' | 'foldsFingerprint' | 'validation' | 'ownerVersions'>
  datasetFingerprint: string
  finishedAt: string
}

export const LAB_SCORE_REFS: readonly ScoreRef[] = [
  { key: 'oof_rmse', label: 'RMSE · cross-validation (OOF)', metric: 'rmse', partition: 'validation', protocol: 'cv', lowerIsBetter: true },
  { key: 'oof_r2', label: 'R² · cross-validation (OOF)', metric: 'r2', partition: 'validation', protocol: 'cv', lowerIsBetter: false },
  { key: 'oof_mae', label: 'MAE · cross-validation (OOF)', metric: 'mae', partition: 'validation', protocol: 'cv', lowerIsBetter: true },
  { key: 'test_rmse', label: 'RMSE · held-out test', metric: 'rmse', partition: 'test', protocol: 'final', lowerIsBetter: true },
  { key: 'test_r2', label: 'R² · held-out test', metric: 'r2', partition: 'test', protocol: 'final', lowerIsBetter: false },
]

const TOKENS: Record<string, string> = {
  'preprocessing.scatter.snv': 'snv', 'preprocessing.scatter.msc': 'msc', 'preprocessing.derivatives.savitzky_golay': 'savgol',
  'preprocessing.baselines.detrend': 'detrend', 'preprocessing.scaling.standard_scale': 'scale', 'preprocessing.scaling.block_rms': 'block_rms',
  'preprocessing.feature_selection.flexible_pca': 'pca',
}

function sourceLabel(dataset: LabDataset, id: string): string {
  return dataset.sources.find(source => source.id === id)?.label ?? id
}

/** Steps shown by the Inspector: per-source preprocessing tokens, then the fused model. */
function chainSteps(document: LabPipelineDocument): InspectorChain['steps'] {
  const level = fusionLevel(document)
  const steps: Array<InspectorChain['steps'][number]> = []
  const seen = new Set<string>()
  for (const branch of document.branches) for (const chain of branch.sourceChains) for (const step of chain.steps) {
    const token = TOKENS[step.methodId] ?? step.methodId.split('.').pop()!
    if (seen.has(token)) continue
    seen.add(token)
    steps.push({ token, label: operatorName(step.methodId), role: token === 'pca' ? 'feature' : 'preprocess' })
  }
  steps.push({ token: `fusion:${level}`, label: FUSION_LEVEL_LABEL[level], role: 'other' })
  const head = document.merge.kind === 'model' ? document.merge.head : document.merge.kind === 'mean' ? null : document.branches[0].head
  steps.push(head ? { token: head.methodId.split('.').pop()!, label: operatorName(head.methodId), role: 'model' }
    : { token: 'mean', label: 'Mean of predictions', role: 'model' })
  return steps
}

function modelLabel(document: LabPipelineDocument): string {
  if (document.merge.kind === 'mean') return `Mean of ${document.branches.length} source models`
  if (document.merge.kind === 'model') return `${operatorName(document.merge.head.methodId)} on ${document.branches.length} source predictions`
  return operatorName(document.branches[0].head.methodId)
}

const finite = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

export function inspectorChains(dataset: LabDataset, runs: readonly LabRunRecord[]): InspectorChain[] {
  return runs.map(run => {
    const { candidate, document } = run
    const level = fusionLevel(document)
    const sources = [...new Set(document.branches.flatMap(branch => branch.sourceIds))]
    const params = document.merge.kind === 'none' ? document.branches[0].head.params : document.merge.kind === 'model' ? document.merge.head.params : {}
    return {
      id: run.id,
      label: `#${run.index} ${document.label}`,
      runId: run.id,
      runLabel: `Run ${run.index}`,
      pipelineId: candidate.recipeFingerprint,
      pipelineLabel: document.label,
      dataset: dataset.name,
      task: 'regression',
      target: dataset.target.name,
      model: run.name,
      modelFamily: FUSION_LEVEL_LABEL[level],
      steps: chainSteps(document),
      params: Object.fromEntries(Object.entries(params).filter(([key]) => !['branch_kinds', 'branch_shapes', 'seed'].includes(key))),
      scores: {
        oof_rmse: finite(candidate.oof.rmse), oof_r2: finite(candidate.oof.r2), oof_mae: finite(candidate.oof.mae),
        test_rmse: finite(candidate.holdout?.rmse), test_r2: finite(candidate.holdout?.r2),
      },
      foldScores: {
        oof_rmse: candidate.oof.perFold.map(fold => fold.rmse),
        oof_mae: candidate.oof.perFold.map(fold => fold.mae),
      },
      fitTimeMs: candidate.elapsedMs,
      status: 'ok',
      attributes: {
        fusion: FUSION_LEVEL_LABEL[level],
        fused_by: modelLabel(document),
        sources: sources.map(id => sourceLabel(dataset, id)).join(' + '),
        n_sources: sources.length,
        folds: candidate.foldsFingerprint.slice(0, 12),
      },
    } satisfies InspectorChain
  })
}

/** OOF rows (validation, with their fold) followed by held-out rows (test), keyed by sample ID. */
export function inspectorPredictions(runs: readonly LabRunRecord[]): Record<string, ChainPredictions> {
  return Object.fromEntries(runs.map(run => {
    const oof = run.candidate.oof.rows
    const test = run.candidate.holdout?.rows ?? []
    return [run.id, {
      chainId: run.id,
      sampleKeys: [...oof.map(row => row.sampleId), ...test.map(row => row.sampleId)],
      yTrue: [...oof.map(row => row.observed), ...test.map(row => row.observed)],
      yPred: [...oof.map(row => row.predicted), ...test.map(row => row.predicted)],
      partition: [...oof.map(() => 'validation'), ...test.map(() => 'test')],
      fold: [...oof.map(row => row.foldId ?? null), ...test.map(() => null)],
    } satisfies ChainPredictions]
  }))
}
