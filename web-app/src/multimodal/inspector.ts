import type { ChainPredictions, InspectorChain, ScoreRef } from 'nirs4all-ui/inspector'
import type { LabCandidateResult, LabDataset, LabPipelineDocument, LabRunResult } from './types'
import { FUSION_LEVEL_LABEL, fusionLevel, operatorName } from './fusion'
import { AOM_CRITERION_LABEL, formatRanking } from '../engine/aomSelection'

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
  /** Swept parameter values of this variant (empty without sweeps). */
  choices?: Record<string, number | string | boolean>
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

/** Class targets: owner classification metrics on class ids (higher is better). */
export const LAB_CLASSIFICATION_SCORE_REFS: readonly ScoreRef[] = [
  { key: 'oof_bacc', label: 'Balanced accuracy · cross-validation (OOF)', metric: 'balanced_accuracy', partition: 'validation', protocol: 'cv', lowerIsBetter: false },
  { key: 'oof_acc', label: 'Accuracy · cross-validation (OOF)', metric: 'accuracy', partition: 'validation', protocol: 'cv', lowerIsBetter: false },
  { key: 'oof_f1', label: 'Weighted F1 · cross-validation (OOF)', metric: 'f1', partition: 'validation', protocol: 'cv', lowerIsBetter: false },
  { key: 'test_bacc', label: 'Balanced accuracy · held-out test', metric: 'balanced_accuracy', partition: 'test', protocol: 'final', lowerIsBetter: false },
  { key: 'test_acc', label: 'Accuracy · held-out test', metric: 'accuracy', partition: 'test', protocol: 'final', lowerIsBetter: false },
]

export function scoreRefsFor(dataset: LabDataset): readonly ScoreRef[] {
  return dataset.target.kind === 'categorical' ? LAB_CLASSIFICATION_SCORE_REFS : LAB_SCORE_REFS
}

const TOKENS: Record<string, string> = {
  'preprocessing.scatter.snv': 'snv', 'preprocessing.scatter.msc': 'msc', 'preprocessing.derivatives.savitzky_golay': 'savgol',
  'preprocessing.baselines.detrend': 'detrend', 'preprocessing.scaling.standard_scale': 'scale', 'preprocessing.scaling.block_rms': 'block_rms',
  'preprocessing.feature_selection.flexible_pca': 'pca',
}

function sourceLabel(dataset: LabDataset, id: string): string {
  return dataset.sources.find(source => source.id === id)?.label ?? id
}

/**
 * Steps shown by the Inspector, readable per source: "NIRS · SNV", "MIR · Standard scaling",
 * then the fusion and the model(s). Tokens carry the source so step effects compare like with like.
 */
function chainSteps(dataset: LabDataset, document: LabPipelineDocument): InspectorChain['steps'] {
  const level = fusionLevel(document)
  const steps: Array<InspectorChain['steps'][number]> = []
  const seen = new Set<string>()
  const push = (step: InspectorChain['steps'][number]) => { if (!seen.has(step.token)) { seen.add(step.token); steps.push(step) } }
  const token = (methodId: string) => TOKENS[methodId] ?? methodId.split('.').pop()!
  for (const branch of document.branches) for (const chain of branch.sourceChains) for (const step of chain.steps) {
    const t = token(step.methodId)
    push({ token: `${chain.sourceId}:${t}`, label: `${sourceLabel(dataset, chain.sourceId)} · ${operatorName(step.methodId)}`, role: t === 'pca' ? 'feature' : 'preprocess' })
  }
  if (document.merge.kind === 'none') {
    const head = document.branches[0].head
    if (level !== 'single') push({ token: `fusion:${level}`, label: FUSION_LEVEL_LABEL[level], role: 'other' })
    push({ token: token(head.methodId), label: operatorName(head.methodId), role: 'model' })
    return steps
  }
  // Late fusion: one model per source, then the combination of their predictions.
  for (const branch of document.branches) {
    const sources = branch.sourceIds.map(id => sourceLabel(dataset, id)).join(' + ')
    push({ token: `${branch.sourceIds.join('+')}:${token(branch.head.methodId)}`, label: `${sources} · ${operatorName(branch.head.methodId)}`, role: 'model' })
  }
  push(document.merge.kind === 'mean'
    ? { token: 'fusion:late:mean', label: 'Late fusion · mean of predictions', role: 'other' }
    : { token: `fusion:late:${token(document.merge.head.methodId)}`, label: `Late fusion · ${operatorName(document.merge.head.methodId)} on predictions`, role: 'model' })
  return steps
}

function modelLabel(document: LabPipelineDocument): string {
  if (document.merge.kind === 'mean') return `Mean of ${document.branches.length} source models`
  if (document.merge.kind === 'model') return `${operatorName(document.merge.head.methodId)} on ${document.branches.length} source predictions`
  return operatorName(document.branches[0].head.methodId)
}

const AOM_BRANCH = ['raw', 'SNV', 'MSC']

/**
 * What the refit model selected internally (AOM: preprocessing branch and chain,
 * components or ridge alpha, the best internal candidates and how often the
 * outer folds chose the same chain), from the Methods fit results per source.
 * The internal scores come from AOM's own CV inside the training data, never
 * from the outer OOF or test partitions.
 */
function selectedParams(dataset: LabDataset, run: LabRunRecord): Record<string, string | number> {
  const bySource = new Map<string, NonNullable<LabRunRecord['candidate']['modelSelections']>>()
  for (const selection of run.candidate.modelSelections ?? []) {
    const key = selection.sourceIds.join('+')
    bySource.set(key, [...(bySource.get(key) ?? []), selection])
  }
  const params: Record<string, string | number> = {}
  for (const [key, fits] of bySource) {
    const refit = fits[fits.length - 1], folds = fits.slice(0, -1)
    const where = `${key.split('+').map(id => sourceLabel(dataset, id)).join(' + ')} · AOM`
    const { selected_branch: branch, selected_chain_index: chain, selected_n_components: components, selected_alpha: alpha } = refit.values
    const aom = refit.aom
    if (aom) {
      params[`${where} chain`] = aom.selected
      if (aom.ranking.length > 1) params[`${where} top chains (${AOM_CRITERION_LABEL[aom.criterion]})`] = formatRanking(aom)
      const agreeing = folds.filter(fit => fit.aom?.selected === aom.selected).length
      if (folds.length > 0) params[`${where} chain stability`] = `${agreeing}/${folds.length} fold fits`
    } else {
      if (branch !== undefined) params[`${where} branch`] = AOM_BRANCH[branch] ?? `branch ${branch}`
      if (chain !== undefined) params[`${where} chain`] = `#${chain + 1}`
    }
    if (components !== undefined) params[`${where} n_components`] = components
    if (alpha !== undefined) params[`${where} alpha`] = Number(alpha.toPrecision(4))
  }
  return params
}

const finite = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

export function inspectorChains(dataset: LabDataset, runs: readonly LabRunRecord[]): InspectorChain[] {
  return runs.map(run => {
    const { candidate, document } = run
    const level = fusionLevel(document)
    const sources = [...new Set(document.branches.flatMap(branch => branch.sourceIds))]
    const params = document.merge.kind === 'none' ? document.branches[0].head.params : document.merge.kind === 'model' ? document.merge.head.params : {}
    const selected = selectedParams(dataset, run)
    const aomChains = Object.fromEntries(Object.entries(selected).filter(([key]) => key.endsWith(' · AOM chain')))
    return {
      id: run.id,
      label: `#${run.index} ${document.label}`,
      runId: run.id,
      runLabel: `Run ${run.index}`,
      pipelineId: candidate.recipeFingerprint,
      pipelineLabel: document.label,
      dataset: dataset.name,
      task: dataset.target.kind === 'categorical' ? 'classification' : 'regression',
      target: dataset.target.name,
      model: run.name,
      modelFamily: FUSION_LEVEL_LABEL[level],
      steps: chainSteps(dataset, document),
      params: { ...Object.fromEntries(Object.entries(params).filter(([key]) => !['branch_kinds', 'branch_shapes', 'seed'].includes(key))), ...run.choices, ...selected },
      scores: (dataset.target.kind === 'categorical' ? {
        oof_bacc: finite(candidate.oof.balancedAccuracy), oof_acc: finite(candidate.oof.accuracy), oof_f1: finite(candidate.oof.f1),
        test_bacc: finite(candidate.holdout?.balancedAccuracy), test_acc: finite(candidate.holdout?.accuracy),
      } : {
        oof_rmse: finite(candidate.oof.rmse), oof_r2: finite(candidate.oof.r2), oof_mae: finite(candidate.oof.mae),
        test_rmse: finite(candidate.holdout?.rmse), test_r2: finite(candidate.holdout?.r2),
      }) as Record<string, number | null>,
      foldScores: (dataset.target.kind === 'categorical' ? {
        oof_bacc: candidate.oof.perFold.map(fold => fold.balancedAccuracy ?? NaN),
        oof_acc: candidate.oof.perFold.map(fold => fold.accuracy ?? NaN),
      } : {
        oof_rmse: candidate.oof.perFold.map(fold => fold.rmse),
        oof_mae: candidate.oof.perFold.map(fold => fold.mae),
      }) as Record<string, number[]>,
      fitTimeMs: candidate.elapsedMs,
      status: 'ok',
      attributes: {
        fusion: FUSION_LEVEL_LABEL[level],
        fused_by: modelLabel(document),
        sources: sources.map(id => sourceLabel(dataset, id)).join(' + '),
        n_sources: sources.length,
        folds: candidate.foldsFingerprint.slice(0, 12),
        // the selected AOM chain per source, for grouping and coloring
        ...aomChains,
      },
    } satisfies InspectorChain
  })
}

/**
 * OOF rows only (validation, with their fold), keyed by sample ID. Recipes are
 * compared on OOF predictions; held-out rows stay in the test scores and the
 * results export, so sample views never pool the two scopes.
 */
export function inspectorPredictions(runs: readonly LabRunRecord[], classes?: readonly string[]): Record<string, ChainPredictions> {
  // Class targets show the declared class labels (class id i is classes[i]).
  const label = (value: number) => classes ? classes[value] ?? String(value) : value
  return Object.fromEntries(runs.map(run => {
    const oof = run.candidate.oof.rows
    return [run.id, {
      chainId: run.id,
      sampleKeys: oof.map(row => row.sampleId),
      yTrue: oof.map(row => label(row.observed)),
      yPred: oof.map(row => label(row.predicted)),
      ...(classes ? { classes: [...classes] } : {}),
      partition: oof.map(() => 'validation'),
      fold: oof.map(row => row.foldId ?? null),
    } satisfies ChainPredictions]
  }))
}
