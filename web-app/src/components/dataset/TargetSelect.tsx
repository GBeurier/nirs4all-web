import type { DatasetTarget, MaterializedDataset } from '@/engine/types'
import { cn } from '@/app/components/ui/utils'

/** "87 of 120 values" for one owner target (the count of rows the owner reports with a value). */
export const targetCoverage = (target: DatasetTarget, nSamples: number): string =>
  `${nSamples - target.missing} of ${nSamples} values`

/**
 * The target picker of a dataset with several owner targets: every target nirs4all-io assembled,
 * in owner order, with the number of values it holds. One control, reused by the dataset views and
 * the run settings; a dataset with a single target shows its name as plain text.
 */
export function TargetSelect({ ds, value, onChange, id, disabled, className }: {
  ds: MaterializedDataset
  value: string
  onChange: (name: string) => void
  id?: string
  disabled?: boolean
  className?: string
}) {
  const targets = ds.targets ?? []
  if (targets.length < 2) return <span id={id} className={cn('font-mono text-xs font-semibold text-foreground', className)} data-target-name>{value}</span>
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      data-target-select
      className={cn('h-8 max-w-full rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-teal/50 disabled:opacity-60', className)}
    >
      {targets.map((target) => (
        <option key={target.name} value={target.name}>
          {target.name} — {target.issue ? 'unusable: read differently across partitions' : `${targetCoverage(target, ds.nSamples)}${target.kind === 'classification_string' ? ' (text labels)' : ''}`}
        </option>
      ))}
    </select>
  )
}
