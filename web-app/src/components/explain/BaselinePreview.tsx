import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SpectraPlot } from 'nirs4all-ui/viz'

import type { BaselinePreviewResponse, Engine, ExplainAxis, ExplainBaseline, ExplainGrouping, ExplainRows } from '@/engine/types'
import { formatRuntimeErrorForUi } from '@/app/runtimeErrors'

import { BASELINE_INFO } from './explainView'

export interface BaselinePreviewProps {
  engine: Engine
  rows: ExplainRows
  background: ExplainRows
  nFeatures: number
  grouping: ExplainGrouping
  axis: ExplainAxis | null
  baseline: ExplainBaseline
  maxBackground: number
  seed: number
  /** group to remove first (e.g. the most important one of the last result) */
  initialGroup?: number
}

/** Shows exactly what the explainer feeds the model when one group is “absent” (Methods `perturbRows`). */
export function BaselinePreview({ engine, rows, background, nFeatures, grouping, axis, baseline, maxBackground, seed, initialGroup }: BaselinePreviewProps) {
  const [row, setRow] = useState(0)
  const [group, setGroup] = useState(initialGroup ?? 0)
  const [result, setResult] = useState<BaselinePreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const r = Math.min(row, rows.nRows - 1)
  const key = JSON.stringify([r, group, grouping, baseline, maxBackground, seed, rows.source, rows.nRows, background.source, background.nRows])

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      setBusy(true)
      setError(null)
      engine.baselinePreview({
        row: rows.X.slice(r * nFeatures, (r + 1) * nFeatures),
        nFeatures,
        background,
        maxBackground,
        seed,
        grouping,
        axis,
        absentGroups: [group],
        baseline,
      }).then((res) => {
        if (!live) return
        setResult(res)
        if (group >= res.groups.length) setGroup(0)
      }).catch((e: unknown) => {
        if (live) setError(formatRuntimeErrorForUi(e))
      }).finally(() => {
        if (live) setBusy(false)
      })
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const wavelengths = axis?.values ?? Array.from({ length: nFeatures }, (_, j) => j)
  const original = useMemo(() => Array.from(rows.X.subarray(r * nFeatures, (r + 1) * nFeatures)), [rows, r, nFeatures])
  const shown = result ? Math.min(result.nRows, 8) : 0
  const series = useMemo(() => {
    if (!result) return []
    return Array.from({ length: shown }, (_, i) => ({
      id: `perturbed-${i}`,
      label: shown > 1 ? `Perturbed (background row ${i + 1})` : 'Perturbed',
      values: Array.from(result.rows.subarray(i * nFeatures, (i + 1) * nFeatures)),
      color: '#d97706',
      opacity: shown > 1 ? 0.45 : 0.9,
    }))
  }, [result, shown, nFeatures])
  const g = result?.groups[group]

  return (
    <div className="space-y-3" data-testid="explain-baseline-preview">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{BASELINE_INFO[baseline].label}.</span> {BASELINE_INFO[baseline].help} The orange curve
        {shown > 1 ? 's are' : ' is'} what the model receives when the selected group is absent; the dark curve is the original spectrum.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="space-y-1">
          <span className="block font-medium text-foreground">Row</span>
          <input type="number" min={0} max={rows.nRows - 1} value={r} onChange={(e) => setRow(Math.max(0, Math.min(rows.nRows - 1, Math.floor(Number(e.target.value)) || 0)))} className="h-8 w-24 rounded-md border border-border bg-background px-2" aria-label="Preview row" />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="block font-medium text-foreground">Absent group</span>
          <select aria-label="Preview absent group" value={group} onChange={(e) => setGroup(Number(e.target.value))} className="h-8 w-full rounded-md border border-border bg-background px-2">
            {(result?.groups ?? []).map((gr, i) => <option key={i} value={i}>{gr.label}</option>)}
          </select>
        </label>
        {busy ? <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />Updating…</span> : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {result ? (
        <SpectraPlot
          wavelengths={wavelengths}
          series={[...series, { id: 'original', label: 'Original', values: original, color: 'currentColor', opacity: 1 }]}
          height={220}
          unit={axis?.unit ?? undefined}
          xLabel={axis?.unit ? 'Wavelength' : 'Feature index'}
          yLabel="Raw value"
          title={g ? `Spectrum with ${g.label} absent` : 'Baseline preview'}
          description={g ? `Original spectrum of row ${r} and the perturbed spectrum the explainer evaluates when group ${g.label} is replaced by the ${baseline} baseline.` : undefined}
        />
      ) : null}
      {result && result.nRows > shown ? <p className="text-[11px] text-muted-foreground">Showing {shown} of {result.nRows} perturbed rows (one per background row).</p> : null}
    </div>
  )
}
