import { useMemo } from 'react'
import { Target } from 'lucide-react'
import type { MaterializedDataset, MissingValuePolicy } from '@/engine/types'
import { runSelectionEffect } from '@/data/targets'
import { TargetSelect } from '@/components/dataset/TargetSelect'

const POLICY_LABEL: Record<MissingValuePolicy, string> = {
  exclude_samples: 'Leave out incomplete samples',
  exclude_features: 'Leave out incomplete wavelengths',
  refuse: 'Stop if a value is missing',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The sentence stating what the next run uses and leaves out (also the E2E-visible contract). */
export function runSelectionSummary(ds: MaterializedDataset, missingValues: MissingValuePolicy): string {
  const effect = runSelectionEffect(ds, { target: ds.targetName, missingValues })
  const parts = [`${plural(effect.train, 'train sample')}${effect.test ? ` and ${plural(effect.test, 'test sample')}` : ''} with a value for “${effect.target}”`]
  if (effect.missingTargets) {
    parts.push(missingValues === 'refuse'
      ? `${plural(effect.missingTargets, 'sample')} without a value: the run will stop`
      : `${plural(effect.missingTargets, 'sample')} without a value left out of fitting and scoring`)
  }
  if (effect.incompleteSamples) {
    parts.push(missingValues === 'exclude_samples' ? `${plural(effect.excludedSamples, 'sample')} with missing spectral values left out`
      : missingValues === 'exclude_features' ? `${plural(effect.excludedFeatures, 'wavelength')} with missing values left out`
        : `${plural(effect.incompleteSamples, 'sample')} with missing spectral values: the run will stop`)
  }
  return `${parts.join('; ')}.`
}

/**
 * Launch choices of a run: the target to model and what to do with missing values. Both are
 * always visible with their current value; they apply to the run only, never to the loaded dataset.
 */
export function RunSettings({ ds, missingValues, disabled, onTarget, onMissingValues }: {
  ds: MaterializedDataset
  missingValues: MissingValuePolicy
  disabled?: boolean
  onTarget: (name: string) => void
  onMissingValues: (policy: MissingValuePolicy) => void
}) {
  const summary = useMemo(() => runSelectionSummary(ds, missingValues), [ds, missingValues])
  const policies: MissingValuePolicy[] = ['exclude_samples', ...(ds.missingFeatures ? ['exclude_features' as const] : []), 'refuse']
  const nTargets = ds.targets?.length ?? 1
  return (
    <section aria-label="Run settings" data-run-settings className="mb-4 rounded-xl border border-border bg-card/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Target className="size-4 text-brand-teal" /> Run settings
        </span>
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium uppercase tracking-wide">Target to model</span>
          <TargetSelect id="run-target" ds={ds} value={ds.targetName} onChange={onTarget} disabled={disabled} />
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase" data-run-task>{ds.taskType}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium uppercase tracking-wide">Missing values</span>
          <select
            id="run-missing-values"
            value={missingValues}
            disabled={disabled}
            onChange={(event) => onMissingValues(event.target.value as MissingValuePolicy)}
            data-run-missing-values
            className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-teal/50 disabled:opacity-60"
          >
            {policies.map((policy) => <option key={policy} value={policy}>{POLICY_LABEL[policy]}</option>)}
          </select>
        </label>
      </div>
      <p role="status" data-run-selection className="mt-2 text-xs text-muted-foreground">
        {nTargets > 1 ? `${nTargets} targets in this dataset; one is modelled per run. ` : ''}This run: {summary} The loaded dataset is not modified.
      </p>
    </section>
  )
}
