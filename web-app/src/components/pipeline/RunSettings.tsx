import { useMemo } from 'react'
import { Target } from 'lucide-react'
import type { MaterializedDataset, MissingSpectraChoice, MissingValuePolicy } from '@/engine/types'
import { runSelectionEffect } from '@/data/targets'
import { TargetSelect } from '@/components/dataset/TargetSelect'

const POLICY_LABEL: Record<MissingValuePolicy, string> = {
  exclude_samples: 'Leave out of fitting and scoring',
  refuse: 'Stop the run',
}

const FILL_LABEL: Record<Extract<MissingSpectraChoice, { action: 'replace' }>['method'], string> = {
  forward_fill: 'the previous wavelength of the same spectrum',
  backward_fill: 'the next wavelength of the same spectrum',
  value: 'a constant value',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The sentence stating what the next run uses and leaves out (also the E2E-visible contract). */
export function runSelectionSummary(ds: MaterializedDataset, missingValues: MissingValuePolicy, missingSpectra: MissingSpectraChoice | null = null): string {
  const effect = runSelectionEffect(ds, { target: ds.targetName, missingValues, missingSpectra })
  const parts = [`${plural(effect.train, 'train sample')}${effect.test ? ` and ${plural(effect.test, 'test sample')}` : ''} with a value for “${effect.target}”`]
  if (effect.missingTargets) {
    parts.push(missingValues === 'refuse'
      ? `${plural(effect.missingTargets, 'sample')} without a value: the run will stop`
      : `${plural(effect.missingTargets, 'sample')} without a value left out of fitting and scoring`)
  }
  if (effect.missingCells) {
    const choice = effect.missingSpectra
    parts.push(!choice ? `${plural(effect.missingCells, 'missing spectral value')}: choose below what this run does with them`
      : choice.action === 'remove_samples' ? `${plural(effect.excludedSamples, 'sample')} with missing spectral values removed`
        : choice.action === 'replace' ? `${plural(effect.replacedCells, 'missing spectral value')} replaced by nirs4all-io with ${choice.method === 'value' ? `the constant ${choice.value ?? '(enter a number)'}` : FILL_LABEL[choice.method]}`
          : `${plural(effect.missingCells, 'missing spectral value')} left as they are`)
  }
  return `${parts.join('; ')}.`
}

/**
 * Launch choices of a run: the target to model, what to do with samples that have no value for it,
 * and — only when the spectra hold missing values — what to do with those: an explicit choice among
 * three, with no option applied by default. They apply to the run only, never to the loaded dataset.
 */
export function RunSettings({ ds, missingValues, missingSpectra, disabled, onTarget, onMissingValues, onMissingSpectra }: {
  ds: MaterializedDataset
  missingValues: MissingValuePolicy
  missingSpectra: MissingSpectraChoice | null
  disabled?: boolean
  onTarget: (name: string) => void
  onMissingValues: (policy: MissingValuePolicy) => void
  onMissingSpectra: (choice: MissingSpectraChoice) => void
}) {
  const summary = useMemo(() => runSelectionSummary(ds, missingValues, missingSpectra), [ds, missingValues, missingSpectra])
  const effect = useMemo(() => runSelectionEffect(ds, { target: ds.targetName, missingValues, missingSpectra: { action: 'remove_samples' } }), [ds, missingValues])
  const nTargets = ds.targets?.length ?? 1
  const replace = missingSpectra?.action === 'replace' ? missingSpectra : null
  const select = 'h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-teal/50 disabled:opacity-60'
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
          <span className="shrink-0 font-medium uppercase tracking-wide">Samples without a target value</span>
          <select
            id="run-missing-values"
            value={missingValues}
            disabled={disabled}
            onChange={(event) => onMissingValues(event.target.value as MissingValuePolicy)}
            data-run-missing-values
            className={select}
          >
            {(Object.keys(POLICY_LABEL) as MissingValuePolicy[]).map((policy) => <option key={policy} value={policy}>{POLICY_LABEL[policy]}</option>)}
          </select>
        </label>
      </div>
      {ds.missingFeatures && (
        <fieldset data-run-missing-spectra disabled={disabled} className="mt-3 rounded-lg border border-brand-amber/40 px-3 py-2 text-xs text-muted-foreground">
          <legend className="px-1 font-medium uppercase tracking-wide text-brand-amber">
            Missing spectral values — {plural(ds.missingFeatures.cells, 'value')} in {plural(ds.missingFeatures.rows, 'sample')}, {plural(ds.missingFeatures.columns, 'wavelength')}
          </legend>
          <p className="mb-2">Choose what this run does with them. Nothing is applied until you choose, and the loaded dataset keeps them.</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="run-missing-spectra" value="remove_samples" checked={missingSpectra?.action === 'remove_samples'} onChange={() => onMissingSpectra({ action: 'remove_samples' })} />
              <span><span className="font-medium text-foreground">Remove</span> the {plural(effect.incompleteSamples, 'affected sample')} from this run</span>
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="run-missing-spectra" value="replace" checked={Boolean(replace)} onChange={() => onMissingSpectra({ action: 'replace', method: 'forward_fill' })} />
              <span><span className="font-medium text-foreground">Replace</span> the {plural(ds.missingFeatures.cells, 'missing value')} (by nirs4all-io) with</span>
              <select
                id="run-missing-spectra-method"
                aria-label="Replacement method"
                value={replace?.method ?? 'forward_fill'}
                disabled={!replace}
                onChange={(event) => onMissingSpectra({ action: 'replace', method: event.target.value as keyof typeof FILL_LABEL, ...(event.target.value === 'value' ? { value: replace?.value } : {}) })}
                className={select}
              >
                {(Object.keys(FILL_LABEL) as (keyof typeof FILL_LABEL)[]).map((method) => <option key={method} value={method}>{FILL_LABEL[method]}</option>)}
              </select>
              {replace?.method === 'value' && (
                <input
                  id="run-missing-spectra-value"
                  type="number"
                  step="any"
                  aria-label="Replacement value"
                  placeholder="number"
                  value={replace.value ?? ''}
                  onChange={(event) => onMissingSpectra({ action: 'replace', method: 'value', ...(event.target.value === '' ? {} : { value: Number(event.target.value) }) })}
                  className="h-8 w-28 rounded-full border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-brand-teal/50"
                />
              )}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="run-missing-spectra" value="keep" checked={missingSpectra?.action === 'keep'} onChange={() => onMissingSpectra({ action: 'keep' })} />
              <span><span className="font-medium text-foreground">Leave as is</span>: the pipeline receives the {plural(ds.missingFeatures.cells, 'missing value')} and must handle them, otherwise the run is refused</span>
            </label>
          </div>
          <p className="mt-2">Replacement stays within each spectrum; nirs4all-io does not offer a mean or median across samples.</p>
        </fieldset>
      )}
      <p role="status" data-run-selection className="mt-2 text-xs text-muted-foreground">
        {nTargets > 1 ? `${nTargets} targets in this dataset; one is modelled per run. ` : ''}This run: {summary} The loaded dataset is not modified.
      </p>
    </section>
  )
}
