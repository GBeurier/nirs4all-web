// Workflow steps of the app shell and when each is reachable.
export type StepId = 'dataset' | 'explore' | 'pipeline' | 'results' | 'predict' | 'explain'

export interface StepAvailability {
  hasDataset: boolean
  runCount: number
  hasSelectedRun: boolean
  hasLoadedModel: boolean
}

/** Predict and Explain use the same model (selected run or imported .n4a), so they unlock together. */
export function enabledSteps({ hasDataset, runCount, hasSelectedRun, hasLoadedModel }: StepAvailability): Record<StepId, boolean> {
  const hasModel = hasSelectedRun || hasLoadedModel
  return {
    dataset: true,
    explore: hasDataset,
    pipeline: hasDataset,
    results: runCount > 0,
    predict: hasModel,
    explain: hasModel,
  }
}
