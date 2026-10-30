import type { PredictResult, TaskType } from '@/engine/types'

/** Quote CSV fields without changing identifiers, target names, or class labels. */
function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Refuse incomplete output before it reaches the preview or export. */
export function validatePredictionResult(result: PredictResult, nSamples: number, taskType: TaskType): void {
  const cols = result.cols ?? 1
  if (!Number.isInteger(nSamples) || nSamples < 1 || !Number.isInteger(cols) || cols < 1
    || (result.rows !== undefined && result.rows !== nSamples)
    || result.values.length !== nSamples * cols
    || !result.values.every(Number.isFinite)
    || (result.sampleIds !== undefined && result.sampleIds.length !== nSamples)
    || (result.targetNames !== undefined && result.targetNames.length !== cols)
    || (result.labels !== undefined && (cols !== 1 || result.labels.length !== nSamples))) {
    throw new Error('Prediction output has inconsistent dimensions or invalid values; export is unavailable.')
  }
  if (taskType !== 'regression' && (!result.labels || cols !== 1)) {
    throw new Error('Predicted class labels are missing; export is unavailable.')
  }
}

/** Export every prediction, preserving the engine's row-major target order. */
export function predictionCsv(result: PredictResult, nSamples: number, taskType: TaskType, targetName?: string): string {
  validatePredictionResult(result, nSamples, taskType)
  const cols = result.cols ?? 1
  const names = result.targetNames ?? (targetName && cols === 1 ? [targetName] : [])
  const headers = Array.from({ length: cols }, (_, col) => {
    const value = taskType !== 'regression' ? 'predictedClass' : 'predicted'
    return names[col] ? `${value}:${names[col]}` : cols > 1 ? `${value}:target_${col + 1}` : value
  })
  const rows: (string | number)[][] = [[result.sampleIds ? 'sampleId' : 'row', ...headers]]
  for (let row = 0; row < nSamples; row++) {
    const values = taskType !== 'regression'
      ? [result.labels![row]]
      : Array.from({ length: cols }, (_, col) => result.values[row * cols + col])
    rows.push([result.sampleIds?.[row] ?? row + 1, ...values])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
