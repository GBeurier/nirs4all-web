import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AgreementMatrix, ImportanceComparisonChart, type SpectralBand } from 'nirs4all-ui/viz'

import type { CompareProfileInput, CompareProfilesResponse, Engine, ExplainAxis, ExplainGrouping, ImportanceProfileV1 } from '@/engine/types'
import { formatRuntimeErrorForUi } from '@/app/runtimeErrors'
import { downloadText } from '@/lib/chartExport'
import { cn } from '@/app/components/ui/utils'

import { ChartFrame } from './ExplainBits'
import type { HistoryEntry } from './explainHistory'
import { fileSlug, METHOD_INFO } from './explainView'
import { comparisonCsv, consensus, expandGroups, IMPORTANCE_INFO, profileKey, profileLabel } from './insights'

export interface CompareCandidate {
  key: string
  label: string
  detail: string
  input: Omit<CompareProfileInput, 'id' | 'label'> | null
  /** why it cannot be compared with the current grouping */
  disabledReason?: string
}

/** A raw-axis profile can be aggregated onto spectral groups; model-feature profiles cannot. */
const onRawAxis = (p: ImportanceProfileV1, nFeatures: number) => p.axis.kind !== 'model_feature' && p.values.length === nFeatures

/** Everything in the history that can enter a comparison, newest first. */
export function compareCandidates(entries: readonly HistoryEntry[], groupingKey: string, nFeatures: number): CompareCandidate[] {
  const out: CompareCandidate[] = []
  // Explanations first (what the user ran), then the model-intrinsic profiles.
  const ordered = [...entries.filter((e) => e.kind === 'explanation'), ...entries.filter((e) => e.kind === 'importance')]
  for (const e of ordered) {
    if (e.kind === 'explanation') {
      const env = e.response.envelope
      const label = e.label
      out.push({
        key: `${e.id}:groups`,
        label,
        detail: `${METHOD_INFO[env.kind as keyof typeof METHOD_INFO]?.label ?? env.kind} · mean |attribution| · ${e.settingsLabel}`,
        input: e.groupingKey === groupingKey ? { resolution: 'group', values: env.summary.mean_abs } : null,
        ...(e.groupingKey === groupingKey ? {} : { disabledReason: 'computed on another grouping; rerun it with the current settings to compare' }),
      })
      const prof = e.response.profile
      if (prof && onRawAxis(prof, nFeatures)) {
        out.push({ key: `${e.id}:gradient`, label: `${label} · mean gradient`, detail: `${IMPORTANCE_INFO[prof.kind].label}, |value| averaged per group`, input: { resolution: 'feature', values: prof.values, rule: IMPORTANCE_INFO[prof.kind].rule } })
      }
    } else {
      for (const p of e.response.profiles) {
        if (p.component !== null) continue
        const ok = onRawAxis(p, nFeatures)
        out.push({
          key: `${e.id}:${profileKey(p)}`,
          label: `${IMPORTANCE_INFO[p.kind].short} · ${p.space === 'raw_input' ? 'raw' : 'model input'}`,
          detail: `${profileLabel(p)}, ${IMPORTANCE_INFO[p.kind].rule === 'mean' ? 'averaged' : '|value| averaged'} per group`,
          input: ok ? { resolution: 'feature', values: p.values, rule: IMPORTANCE_INFO[p.kind].rule } : null,
          ...(ok ? {} : { disabledReason: 'drawn on model feature indices: the preprocessing changes the variables, so it has no wavelength groups' }),
        })
      }
    }
  }
  return out
}

export interface CompareViewProps {
  engine: Engine
  entries: readonly HistoryEntry[]
  grouping: ExplainGrouping
  groupingKey: string
  groupingLabel: string
  nFeatures: number
  axis: ExplainAxis | null
  axisLabel: string
  spectrum?: number[]
  bands: readonly SpectralBand[]
  exportName: string
}

export function CompareView({ engine, entries, grouping, groupingKey, groupingLabel, nFeatures, axis, axisLabel, spectrum, bands, exportName }: CompareViewProps) {
  const candidates = useMemo(() => compareCandidates(entries, groupingKey, nFeatures), [entries, groupingKey, nFeatures])
  const enabled = candidates.filter((c) => c.input)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(enabled.slice(0, 6).map((c) => c.key)))
  // Newly added results join the comparison by default (up to 8); a deselected one stays out.
  const [seen] = useState(() => new Set(enabled.map((c) => c.key)))
  const enabledKeys = enabled.map((c) => c.key).join('|')
  useEffect(() => {
    setChosen((cur) => {
      const next = new Set([...cur].filter((k) => enabled.some((c) => c.key === k)))
      for (const c of enabled) if (!cur.has(c.key) && next.size < 8 && !seen.has(c.key)) next.add(c.key)
      enabled.forEach((c) => seen.add(c.key))
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKeys])
  const selected = enabled.filter((c) => chosen.has(c.key))
  const [metric, setMetric] = useState<'spearman' | 'jaccard'>('spearman')
  const [hidden, setHidden] = useState<string[]>([])
  const [hover, setHover] = useState<{ start: number; end: number } | null>(null)
  const [result, setResult] = useState<CompareProfilesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestKey = selected.map((c) => c.key).join('|') + '#' + groupingKey

  useEffect(() => {
    if (selected.length < 2) {
      setResult(null)
      return
    }
    let live = true
    setBusy(true)
    setError(null)
    engine.compareProfiles({
      nFeatures,
      grouping,
      axis,
      topK: 10,
      profiles: selected.map((c) => ({ id: c.key, label: c.label, ...(c.input as Omit<CompareProfileInput, 'id' | 'label'>) })),
    }).then((r) => {
      if (live) setResult(r)
    }).catch((e: unknown) => {
      if (live) {
        setResult(null)
        setError(formatRuntimeErrorForUi(e))
      }
    }).finally(() => {
      if (live) setBusy(false)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const labels = selected.map((c) => c.label)
  const series = useMemo(() => (result ? result.aggregated.map((vals, i) => ({
    id: selected[i]?.key ?? String(i),
    label: labels[i] ?? String(i),
    values: expandGroups(result.groups, vals, nFeatures),
  })) : []), [result]) // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => (result ? consensus(result).slice(0, 12) : []), [result])
  const stem = fileSlug(exportName)
  const matrix = result ? (metric === 'spearman' ? result.spearman : result.topKJaccard) : []

  if (candidates.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Run two or more methods (or the model internals) to compare their importances here.</p>
  }

  return (
    <div className="space-y-5" data-testid="explain-compare">
      <div className="rounded-xl border border-border bg-background/60 p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          Every profile is brought onto the current grouping (<span className="font-medium text-foreground">{groupingLabel}</span>) by Methods: explanations use their mean |attribution| per
          group, wavelength profiles the rule shown. Only shapes and ranks are compared, never units.
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {candidates.map((c) => (
            <li key={c.key}>
              <label className={cn('flex items-start gap-2 rounded-lg px-2 py-1 text-xs', c.input ? 'cursor-pointer hover:bg-brand-teal/5' : 'opacity-60')} title={c.disabledReason}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={!c.input}
                  checked={chosen.has(c.key)}
                  onChange={(e) => setChosen((cur) => {
                    const next = new Set(cur)
                    if (e.target.checked) next.add(c.key)
                    else next.delete(c.key)
                    return next
                  })}
                />
                <span>
                  <span className="font-medium text-foreground">{c.label}</span>
                  <span className="block text-muted-foreground">{c.input ? c.detail : `Not comparable: ${c.disabledReason}`}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {selected.length < 2 ? <p className="text-sm text-muted-foreground">Select at least two profiles.</p> : null}
      {busy ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Comparing…</p> : null}
      {error ? <p className="whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {result ? (
        <>
          <ChartFrame
            title="Importance profiles"
            fileName={`${stem}.comparison`}
            onCsv={() => downloadText(`${stem}.comparison.csv`, comparisonCsv(result, labels))}
            help="Each profile is scaled to its largest value so that shapes can be compared; click a legend entry to hide a profile. Agreement on the same regions is what matters, not the height."
          >
            <ImportanceComparisonChart
              axis={axis?.values ?? Array.from({ length: nFeatures }, (_, j) => j)}
              axisLabel={axisLabel}
              axisUnit={axis?.unit ?? undefined}
              series={series}
              scaling="max_abs"
              hiddenIds={hidden}
              onToggleSeries={(id) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))}
              spectrum={spectrum}
              bands={bands}
              regions={result.groups.map((g) => ({ start: Math.min(g.axis_start, g.axis_end), end: Math.max(g.axis_start, g.axis_end) }))}
              highlightRange={hover}
              onRangeHover={setHover}
              title="Importance per group, scaled per profile"
            />
          </ChartFrame>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame
              title="Agreement between methods"
              fileName={`${stem}.agreement-${metric}`}
              controls={(
                <select aria-label="Agreement metric" value={metric} onChange={(e) => setMetric(e.target.value as 'spearman' | 'jaccard')} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                  <option value="spearman">Rank correlation (Spearman)</option>
                  <option value="jaccard">Top-{result.topK} overlap (Jaccard)</option>
                </select>
              )}
              help={metric === 'spearman'
                ? 'Spearman correlation of the group rankings of two profiles: 1 = same order, 0 = unrelated, negative = opposite. Computed by Methods (average ranks for ties).'
                : `Share of groups that two profiles both place in their top ${result.topK} by magnitude (intersection over union): 1 = same top groups.`}
            >
              <AgreementMatrix
                labels={labels}
                values={matrix}
                domain={metric === 'spearman' ? [-1, 1] : [0, 1]}
                metricLabel={metric === 'spearman' ? 'Spearman ρ' : `Top-${result.topK} Jaccard`}
                format={(v) => v.toFixed(2)}
                title={metric === 'spearman' ? 'Rank correlation between profiles' : 'Top-group overlap between profiles'}
              />
            </ChartFrame>

            <ChartFrame title="Consensus regions" help={`Groups ranked by how many profiles place them in their top ${result.topK}; the rank each profile gives is shown in the cells.`}>
              <div className="max-h-80 overflow-auto rounded-lg border border-border" data-testid="explain-consensus">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Group</th>
                      <th className="px-2 py-1.5 text-left font-medium">In top {result.topK}</th>
                      {labels.map((l) => <th key={l} className="px-2 py-1.5 text-left font-medium" title={l}>{l.length > 14 ? `${l.slice(0, 13)}…` : l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((r) => (
                      <tr
                        key={r.group.label + r.group.feature_start}
                        className="border-t border-border/60 hover:bg-brand-teal/5"
                        onMouseEnter={() => setHover({ start: Math.min(r.group.axis_start, r.group.axis_end), end: Math.max(r.group.axis_start, r.group.axis_end) })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <td className="px-2 py-1 font-mono">{r.group.label}</td>
                        <td className="px-2 py-1">
                          <span className={cn('rounded-full px-2 py-0.5 font-mono', r.count === labels.length ? 'bg-brand-teal/15 text-brand-teal' : 'bg-muted text-muted-foreground')}>{r.count}/{labels.length}</span>
                        </td>
                        {r.ranks.map((k, i) => <td key={i} className={cn('px-2 py-1 font-mono', k <= result.topK ? 'text-foreground' : 'text-muted-foreground')}>{k}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartFrame>
          </div>
        </>
      ) : null}
    </div>
  )
}
