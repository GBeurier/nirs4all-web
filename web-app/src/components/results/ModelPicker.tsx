import type { RunResult } from '@/engine/types'
import { fmt, primaryMetric } from '@/lib/format'
import { formatDate } from './_helpers'
import { defaultEvaluationScore, scoreEvaluationLabel } from './inspectorAdapter'

/** The model Predict and Explain use: a run's refit model, or the imported .n4a model. */
export type ModelChoice = { kind: 'run'; runId: string } | { kind: 'imported' }

export interface ModelPickerProps {
  runs: readonly RunResult[]
  selectedRunId: string | null
  /** Name of the model imported from a .n4a bundle, when one is loaded. */
  importedName?: string | null
  onChange: (choice: ModelChoice) => void
  disabled?: boolean
}

/** One-line description of a run's model: pipeline, headline validation score and date. */
export function runModelLabel(run: RunResult): string {
  const pm = primaryMetric(run.taskType)
  const score = defaultEvaluationScore(run)
  const value = score?.metrics[pm.key]
  const scored = score && value != null ? ` · ${scoreEvaluationLabel(run, score)} ${pm.label} ${fmt(value)}` : ''
  const variants = run.variantCount && run.variantCount > 1 ? ` · best of ${run.variantCount} variants` : ''
  return `${run.pipelineName}${scored}${variants} · ${formatDate(run.createdAt)}`
}

/**
 * Chooses which fitted model Predict and Explain use. Each run keeps exactly one fitted model —
 * the variant selected by dag-ml, refit on all training rows; fold models and non-selected
 * variants are not retained, so they are not offered.
 */
export function ModelPicker({ runs, selectedRunId, importedName, onChange, disabled }: ModelPickerProps) {
  const value = selectedRunId && runs.some((r) => r.id === selectedRunId) ? `run:${selectedRunId}` : importedName ? 'imported' : ''
  if (runs.length + (importedName ? 1 : 0) === 0) return null
  return (
    <label className="block space-y-1 text-sm" data-model-picker>
      <span className="font-medium text-foreground">Model</span>
      <select
        aria-label="Model"
        className="block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
          onChange(next === 'imported' ? { kind: 'imported' } : { kind: 'run', runId: next.slice('run:'.length) })
        }}
      >
        {value === '' ? <option value="" disabled>Select a model</option> : null}
        {runs.map((run) => (
          <option key={run.id} value={`run:${run.id}`}>{runModelLabel(run)}</option>
        ))}
        {importedName ? <option value="imported">Imported .n4a model · {importedName}</option> : null}
      </select>
      <span className="block text-xs text-muted-foreground">
        Each run provides its refit model: the variant selected by dag-ml, refit on all training rows. Fold models and
        non-selected variants are not kept.
      </span>
    </label>
  )
}
