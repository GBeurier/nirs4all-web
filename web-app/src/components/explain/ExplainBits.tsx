import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Download, ImageDown, Info } from 'lucide-react'

import { cn } from '@/app/components/ui/utils'
import { exportChart } from '@/lib/chartExport'

export const field = 'block h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

export function StatusBadge({ status }: { status: 'implemented' | 'experimental' }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase',
        status === 'implemented' ? 'bg-brand-teal/10 text-brand-teal' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      )}
    >
      {status}
    </span>
  )
}

export function NumberField({ label, help, value, min, max, onChange, disabled }: { label: string; help: string; value: number; min: number; max?: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="number"
        className={field}
        value={value}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        onChange={(e) => {
          const v = Math.floor(Number(e.target.value))
          if (Number.isFinite(v)) onChange(Math.max(min, max === undefined ? v : Math.min(max, v)))
        }}
      />
      <span className="block text-[11px] text-muted-foreground">{help}</span>
    </label>
  )
}

/** A chart card: title, optional explanation toggle, controls and SVG/PNG/CSV export. */
export function ChartFrame({ title, help, controls, fileName, onCsv, children, className, testId }: {
  title: string
  help?: ReactNode
  controls?: ReactNode
  fileName?: string
  onCsv?: () => void
  children: ReactNode
  className?: string
  testId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const run = (format: 'svg' | 'png') => {
    setExportError(null)
    exportChart(ref.current, fileName ?? 'chart', format).catch((e: unknown) => setExportError(e instanceof Error ? e.message : String(e)))
  }
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)} data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {title}
          {help ? (
            <button type="button" aria-label={`About ${title}`} aria-expanded={showHelp} onClick={() => setShowHelp((v) => !v)} className="rounded-full p-0.5 text-muted-foreground hover:text-brand-teal">
              <Info className="size-3.5" />
            </button>
          ) : null}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {controls}
          {fileName ? (
            <>
              <button type="button" onClick={() => run('svg')} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground" title="Save the chart as SVG">
                <ImageDown className="size-3.5" /> SVG
              </button>
              <button type="button" onClick={() => run('png')} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground" title="Save the chart as PNG">
                PNG
              </button>
            </>
          ) : null}
          {onCsv ? (
            <button type="button" onClick={onCsv} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground" title="Download the values as CSV">
              <Download className="size-3.5" /> CSV
            </button>
          ) : null}
        </div>
      </div>
      {help && showHelp ? <div className="mb-3 rounded-lg bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground">{help}</div> : null}
      <div ref={ref}>{children}</div>
      {exportError ? <p className="mt-2 text-xs text-destructive">{exportError}</p> : null}
    </section>
  )
}

/** A collapsible block with a one-line summary. */
export function Disclosure({ summary, children, defaultOpen = false, testId }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border" data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground">
        <span>{summary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="border-t border-border p-3">{children}</div> : null}
    </div>
  )
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return 'too many'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} G`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`
  return String(Math.round(n))
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return '< 1 s'
  const s = ms / 1000
  if (s < 90) return `${Math.round(s)} s`
  const m = s / 60
  if (m < 90) return `${Math.round(m)} min`
  return `${(m / 60).toFixed(1)} h`
}
