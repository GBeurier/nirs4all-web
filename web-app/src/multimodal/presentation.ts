import type { MultimodalConfig, MultimodalProgress, MultimodalRunResult } from 'nirs4all-ui/multimodal'
import type { LabConfig, LabProgress, LabRunResult } from './types'

/** Controlled UI collections are readonly; execution receives its own clone. */
export function toExecutionConfig(config: MultimodalConfig): LabConfig {
  return { ...config, sourceIds: [...config.sourceIds], baseModels: [...config.baseModels],
    sourceChains: config.sourceChains.map(source => ({ sourceId: source.sourceId,
      steps: source.steps.map(step => ({ methodId: step.methodId, params: { ...step.params } })) })),
    cnn: { ...config.cnn }, validation: { ...config.validation } }
}

export function toWorkbenchProgress(progress: LabProgress): MultimodalProgress {
  return { strategy: progress.strategy, phase: progress.phase, node: progress.nodeId,
    ...(progress.foldId ? { fold: progress.foldId } : {}), completed: progress.candidateIndex,
    total: progress.candidateCount, message: progress.message }
}

export function toWorkbenchResult(result: LabRunResult): MultimodalRunResult {
  return {
    dataFingerprint: result.dataFingerprint, configFingerprint: result.configFingerprint,
    foldsFingerprint: result.foldsFingerprint, validation: result.validation,
    elapsedMs: result.elapsedMs,
    ownerVersions: Object.fromEntries(Object.entries(result.ownerVersions).map(([key, value]) => [key,
      typeof value === 'string' ? value : JSON.stringify(value)])),
    counts: { calibration: result.calibrationIds.length, holdout: result.holdoutIds.length },
    refusals: result.refusals.map(refusal => ({ candidateId: refusal.candidateId, strategy: refusal.strategy,
      name: 'NativeExecutionRefusal', message: refusal.reason })),
    candidates: result.candidates.map(candidate => {
      const config = (candidate.recipe as { config: LabConfig }).config
      const scope = (value: typeof candidate.oof) => ({ n: value.n, rmse: value.rmse, mae: value.mae,
        r2: value.r2, rows: value.rows, folds: value.perFold })
      const outerFit = candidate.diagnostics.find(diagnostic => diagnostic.phase === 'REFIT' && diagnostic.nodeId === 'model:result')
      return { candidateId: candidate.id, strategy: candidate.strategy,
        ...(candidate.strategy === 'single' ? { singleSourceId: config.singleSourceId } : {}),
        sourceIds: config.strategy === 'single' ? [config.singleSourceId] : config.sourceIds,
        algorithm: candidate.label, oof: scope(candidate.oof), holdout: candidate.holdout ? scope(candidate.holdout) : null,
        elapsedMs: candidate.elapsedMs, recipeFingerprint: candidate.recipeFingerprint,
        foldsFingerprint: candidate.foldsFingerprint, hyperparameters: candidate.hyperparameters,
        diagnostics: [
          { label: 'Data fingerprint', value: candidate.dataFingerprint },
          { label: 'Selection', value: 'Fixed a priori settings; no automatic tuning' },
          ...(outerFit ? [{ label: 'Retained block widths', value: JSON.stringify(outerFit.blockWidths) }] : []),
          ...(config.strategy === 'mid' || config.strategy === 'mid-stacking' ? [{ label: 'Training',
            value: `Joint branch/head backpropagation, ${config.cnn.epochs} fixed epochs; no test early stopping` },
            { label: 'Input normalization', value: 'Native train-fitted branch normalization absorbs a uniform block RMS scalar' }] : []),
        ],
      }
    }),
  }
}
