import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Microscope, Pencil, Pin, PinOff, Play, Settings2, Square, Trash2, XCircle } from 'lucide-react'
import { referenceBandsForAxis } from 'nirs4all-ui/viz'
import 'nirs4all-ui/assets/viz.css'

import type { ExplainPanelProps } from '@/components/contracts'
import { EXPLAIN_DEFAULTS } from '@/engine/explain'
import type {
  ExplainBaseline,
  ExplainBatchProgress,
  ExplainGrouping,
  ExplainMethod,
  ExplainRequest,
  ImportanceRequest,
} from '@/engine/types'
import { formatRuntimeErrorForUi } from '@/app/runtimeErrors'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { cn } from '@/app/components/ui/utils'
import { downloadJson } from '@/lib/download'

import { BaselinePreview } from './BaselinePreview'
import { CompareView } from './CompareView'
import { Disclosure, field, formatCount, formatDuration, NumberField, StatusBadge } from './ExplainBits'
import { addEntries, measuredThroughput, useExplainHistory, type HistoryEntry } from './explainHistory'
import { ExplainResults } from './ExplainResults'
import {
  backgroundFor,
  bandRanges,
  BASELINE_INFO,
  envelopeFileName,
  estimateEvaluations,
  groupCount,
  meanSpectrum,
  METHOD_FAMILIES,
  METHOD_INFO,
  modelTargetNames,
  PRESETS,
  rowSourceOptions,
  unitKnown,
  type PresetId,
} from './explainView'
import { ImportanceView } from './ImportanceView'

type GroupingKind = 'fixed_width' | 'bands' | 'per_feature'
type ItemStatus = { state: 'queued' | 'running' | 'done' | 'failed'; done?: number; total?: number; error?: string }
type View = { tab: 'details' | 'compare'; entryId: string | null }

const EXACT_MAX_GROUPS = 16

export function ExplainPanel({ model, sourceName, targetName, targetNames: declaredTargets, engine, dataset, predicted, axis, onGoPredict }: ExplainPanelProps) {
  const nFeatures = model.nFeatures
  const history = useExplainHistory(model)
  const [preset, setPreset] = useState<PresetId | 'custom'>('recommended')
  const recommended = PRESETS.find((p) => p.id === 'recommended') ?? PRESETS[0]
  const [methods, setMethods] = useState<ExplainMethod[]>(recommended.methods)
  const [intrinsic, setIntrinsic] = useState(recommended.intrinsic)
  const [baseline, setBaseline] = useState<ExplainBaseline>(recommended.baseline)
  // Chemical bands when the axis unit is known (the recommended preset), else fixed width.
  const [groupingKind, setGroupingKind] = useState<GroupingKind>('bands')
  const [width, setWidth] = useState(EXPLAIN_DEFAULTS.fixedWidth)
  const [sourceKey, setSourceKey] = useState<string>('')
  const [maxRows, setMaxRows] = useState(recommended.maxRows)
  const [allRows, setAllRows] = useState(false)
  const [maxBackground, setMaxBackground] = useState(recommended.maxBackground)
  const [nPermutations, setNPermutations] = useState(recommended.nPermutations)
  const [seed, setSeed] = useState(EXPLAIN_DEFAULTS.seed)
  const [outputIndex, setOutputIndex] = useState(0)
  const [showBands, setShowBands] = useState(true)
  const [setupOpen, setSetupOpen] = useState(history.entries.length === 0)
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<{ label: string; status: ItemStatus; weight: number }[]>([])
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ tab: 'details', entryId: history.entries[0]?.id ?? null })
  const [renaming, setRenaming] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const token = useRef(0)

  // Leaving the step (or switching model) cancels a running job; finished results stay in the history.
  useEffect(() => () => {
    token.current++
    abortRef.current?.abort()
    abortRef.current = null
  }, [model])
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [running])

  const options = useMemo(() => rowSourceOptions(model, predicted, dataset), [model, predicted, dataset])
  const explained = options.find((o) => o.source === sourceKey) ?? options[0] ?? null
  const background = explained ? backgroundFor(options, explained) : null
  const targetNames = useMemo(() => declaredTargets ?? modelTargetNames(model), [declaredTargets, model])
  const hasUnit = unitKnown(axis)
  const axisValues = axis?.values ?? []
  const bands = useMemo(() => {
    if (!hasUnit || !axis || axisValues.length === 0) return []
    const finite = axisValues.filter(Number.isFinite)
    return referenceBandsForAxis(axis.unit, Math.min(...finite), Math.max(...finite))
  }, [hasUnit, axis, axisValues])
  const ranges = useMemo(() => bandRanges(bands), [bands])
  const bandsUsable = hasUnit && ranges.length > 0
  const effectiveGroupingKind: GroupingKind = groupingKind === 'bands' && !bandsUsable ? 'fixed_width' : groupingKind
  const nGroups = groupCount(effectiveGroupingKind, nFeatures, width, axis ?? null, ranges)
  const exactAllowed = nGroups !== null && nGroups <= EXACT_MAX_GROUPS
  const effectiveRows = explained ? (allRows ? explained.rows.nRows : Math.min(maxRows, explained.rows.nRows)) : 0
  const effectiveBackground = background ? Math.min(maxBackground, background.rows.nRows) : 0
  const isRegression = model.taskType === 'regression'
  const runnable = methods.filter((m) => m !== 'exact_shap' || exactAllowed)
  const throughput = measuredThroughput(history.entries)
  const estimates = runnable.map((method) => ({
    method,
    evaluations: nGroups !== null ? estimateEvaluations({ method, baseline, nRows: effectiveRows, nBackground: effectiveBackground, nGroups, nPermutations, nFeatures }) : Number.NaN,
  }))
  const totalEvaluations = estimates.reduce((s, e) => s + (Number.isFinite(e.evaluations) ? e.evaluations : 0), 0)

  const grouping = (): ExplainGrouping =>
    effectiveGroupingKind === 'per_feature' ? { kind: 'per_feature' }
      : effectiveGroupingKind === 'bands' ? { kind: 'ranges', ranges, source: 'nirs4all-ui reference absorption bands' }
        : { kind: 'fixed_width', width }
  const groupingKey = JSON.stringify([grouping(), nFeatures])
  const groupingLabel = effectiveGroupingKind === 'per_feature' ? 'one group per wavelength' : effectiveGroupingKind === 'bands' ? `${nGroups ?? '?'} chemical-band groups` : `${nGroups ?? '?'} groups of ${width} features`
  const settingsLabel = `${BASELINE_INFO[baseline].label.split(' (')[0]} · ${groupingLabel} · ${effectiveRows} rows`

  function applyPreset(id: PresetId) {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setPreset(id)
    setMethods(p.methods)
    setIntrinsic(p.intrinsic)
    setBaseline(p.baseline)
    setGroupingKind(p.grouping === 'bands' && bandsUsable ? 'bands' : 'fixed_width')
    setWidth(p.width)
    setMaxRows(p.maxRows)
    setAllRows(false)
    setMaxBackground(p.maxBackground)
    setNPermutations(p.nPermutations)
  }
  const custom = <T,>(set: (v: T) => void) => (v: T) => {
    setPreset('custom')
    set(v)
  }
  const toggleMethod = (m: ExplainMethod) => {
    setPreset('custom')
    setMethods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))
  }

  async function run() {
    if (!explained || !background) return
    if (runnable.length === 0 && !intrinsic) return
    const id = ++token.current
    const ctrl = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ctrl
    const outputLabel = targetNames[outputIndex] ?? targetName
    const common: Omit<ExplainRequest, 'method'> = {
      model,
      nFeatures,
      featureNames: explained.featureNames,
      rows: explained.rows,
      background: background.rows,
      baseline,
      grouping: grouping(),
      nPermutations,
      seed,
      maxRows: effectiveRows,
      maxBackground,
      outputIndex,
      outputLabel,
      axis: axis ?? null,
    }
    const importance: ImportanceRequest | null = intrinsic
      ? { model, nFeatures, featureNames: background.featureNames, statRows: background.rows, outputIndex, outputLabel, axis: axis ?? null }
      : null
    const queue = [
      ...(importance ? [{ label: 'Model internals', status: { state: 'queued' } as ItemStatus, weight: 1 }] : []),
      ...estimates.map((e) => ({ label: METHOD_INFO[e.method].label, status: { state: 'queued' } as ItemStatus, weight: Math.max(1, Number.isFinite(e.evaluations) ? e.evaluations : 1) })),
    ]
    const offset = importance ? 1 : 0
    setItems(queue)
    setRunning(true)
    setError(null)
    setStartedAt(Date.now())
    setNow(Date.now())
    setSetupOpen(false)
    try {
      const result = await engine.explainBatch({ explanations: runnable.map((method) => ({ ...common, method })), importance }, {
        signal: ctrl.signal,
        onProgress: (p: ExplainBatchProgress) => {
          if (id !== token.current) return
          const at = p.item + offset
          setItems((cur) => cur.map((it, i) => (i < at && it.status.state !== 'failed' ? { ...it, status: it.status.state === 'running' || it.status.state === 'queued' ? { state: 'done' } : it.status } : i === at ? { ...it, status: { state: 'running', done: p.done, total: p.total } } : it)))
        },
      })
      if (id !== token.current) return
      const statuses: ItemStatus[] = [
        ...(result.importance ? [result.importance.ok ? { state: 'done' } as ItemStatus : { state: 'failed', error: result.importance.error } as ItemStatus] : []),
        ...result.explanations.map((r) => (r.ok ? { state: 'done' } as ItemStatus : { state: 'failed', error: r.error } as ItemStatus)),
      ]
      setItems((cur) => cur.map((it, i) => ({ ...it, status: statuses[i] ?? it.status })))
      const count = new Map<string, number>()
      history.entries.forEach((e) => count.set(e.label.replace(/ #\d+$/, ''), (count.get(e.label.replace(/ #\d+$/, '')) ?? 0) + 1))
      const name = (base: string) => {
        const n = (count.get(base) ?? 0) + 1
        count.set(base, n)
        return n > 1 ? `${base} #${n}` : base
      }
      const fresh: Omit<HistoryEntry, 'id' | 'createdAt' | 'pinned'>[] = []
      if (result.importance?.ok) fresh.push({ kind: 'importance', label: name('Model internals'), settingsLabel: `${background.label}`, groupingKey, response: result.importance.result })
      result.explanations.forEach((r, i) => {
        if (r.ok) fresh.push({ kind: 'explanation', label: name(METHOD_INFO[runnable[i]].label), settingsLabel, groupingKey, response: r.result })
      })
      const ids = addEntries(model, fresh)
      if (ids.length > 0) setView({ tab: ids.length >= 2 ? 'compare' : 'details', entryId: ids[fresh.findIndex((f) => f.kind === 'explanation')] ?? ids[0] })
      if (ids.length === 0) setSetupOpen(true)
    } catch (e) {
      if (id !== token.current) return
      if (e instanceof DOMException && e.name === 'AbortError') setError('Explanation cancelled.')
      else setError(formatRuntimeErrorForUi(e))
      setSetupOpen(true)
    } finally {
      if (id === token.current) {
        setRunning(false)
        if (abortRef.current === ctrl) abortRef.current = null
      }
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  // Overall progress: finished items by their estimated weight plus the running item's fraction.
  const totalWeight = items.reduce((s, it) => s + it.weight, 0)
  const doneWeight = items.reduce((s, it) => {
    if (it.status.state === 'done' || it.status.state === 'failed') return s + it.weight
    if (it.status.state === 'running' && it.status.total) return s + it.weight * ((it.status.done ?? 0) / it.status.total)
    return s
  }, 0)
  const fraction = totalWeight > 0 ? doneWeight / totalWeight : 0
  const elapsed = now - startedAt
  const eta = fraction > 0.02 && fraction < 1 ? (elapsed / fraction) * (1 - fraction) : Number.NaN

  const selectedEntry = history.entries.find((e) => e.id === view.entryId) ?? history.entries[0] ?? null
  const latestGradient = history.entries.find((e) => e.kind === 'explanation' && e.response.profile)
  const gradientProfile = latestGradient?.kind === 'explanation' ? latestGradient.response.profile ?? null : null
  const spectrum = useMemo(() => (background ? meanSpectrum(background.rows.X, background.rows.nRows, nFeatures) : undefined), [background, nFeatures])
  const observed = useMemo(() => {
    if (!dataset || targetNames.length > 1 || !explained || explained.source === 'predicted_rows') return undefined
    const y = dataset.y
    return (i: number) => (i < y.length && Number.isFinite(y[i]) ? y[i] : undefined)
  }, [dataset, targetNames, explained])
  const axisLabel = axis && hasUnit ? `${axis.unit === 'cm-1' ? 'Wavenumber' : 'Wavelength'} (${axis.unit})` : 'Feature index'
  const nothingSelected = runnable.length === 0 && !intrinsic

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
            <Microscope className="size-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Explain predictions</h3>
            <p className="text-xs text-muted-foreground">
              Model: <span className="font-medium text-foreground">{sourceName}</span> · <span className="font-mono">{nFeatures}</span> features ·{' '}
              {model.taskType} · computed locally by the Methods WASM explainer
            </p>
          </div>
        </div>
      </div>

      {!isRegression ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="explain-classification-refused">
          The browser predict paths return class scores or hard labels, not calibrated class probabilities, so classification models are not explained here.
          Use the nirs4all Python SDK to explain classifier probabilities.
        </p>
      ) : !explained ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="explain-no-rows">
          No rows to explain yet: score a spectra file in Predict with this model{dataset ? '' : ' (an imported model has no training dataset here, so the predicted rows also serve as background)'}.
          {onGoPredict ? (
            <button type="button" onClick={onGoPredict} className="ml-2 font-semibold text-brand-teal underline-offset-2 hover:underline">Go to Predict</button>
          ) : null}
        </div>
      ) : (
        <>
          {!setupOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-xs text-muted-foreground" data-testid="explain-setup-summary">
              <span>
                <span className="font-medium text-foreground">{[...runnable.map((m) => METHOD_INFO[m].label), ...(intrinsic ? ['Model internals'] : [])].join(', ') || 'No method selected'}</span>
                {' · '}{settingsLabel}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSetupOpen(true)} disabled={running}>
                  <Settings2 className="size-4" /> Edit settings
                </Button>
                {running ? null : (
                  <Button size="sm" className="gap-1.5" onClick={() => void run()} disabled={nothingSelected}>
                    <Play className="size-4" /> Run again
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5" data-testid="explain-setup">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Start from</p>
                <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Explain preset">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={preset === p.id}
                      disabled={running}
                      onClick={() => applyPreset(p.id)}
                      className={cn('rounded-xl border p-3 text-left transition-colors', preset === p.id ? 'border-brand-teal bg-brand-teal/5' : 'border-border hover:border-brand-teal/50')}
                    >
                      <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{p.help}</span>
                    </button>
                  ))}
                </div>
                {preset === 'custom' ? <p className="mt-1 text-[11px] text-muted-foreground">Custom settings.</p> : null}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Methods to run and compare</p>
                <div className="grid gap-3 lg:grid-cols-3">
                  {METHOD_FAMILIES.map((fam) => (
                    <fieldset key={fam.id} className="rounded-xl border border-border p-3">
                      <legend className="px-1 text-xs font-semibold text-foreground">{fam.label}</legend>
                      <p className="mb-2 text-[11px] text-muted-foreground">{fam.help}</p>
                      <div className="space-y-1.5">
                        {fam.methods.map((m) => {
                          const disabled = running || (m === 'exact_shap' && !exactAllowed)
                          return (
                            <label key={m} className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60')} title={METHOD_INFO[m].help}>
                              <input type="checkbox" className="mt-1" aria-label={`Method ${METHOD_INFO[m].label}`} checked={methods.includes(m) && !(m === 'exact_shap' && !exactAllowed)} disabled={disabled} onChange={() => toggleMethod(m)} />
                              <span>
                                <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">{METHOD_INFO[m].label} <StatusBadge status={METHOD_INFO[m].status} /></span>
                                <span className="block text-[11px] leading-snug text-muted-foreground">
                                  {m === 'exact_shap' && !exactAllowed ? `Needs ≤ ${EXACT_MAX_GROUPS} groups (currently ${nGroups ?? '?'}).` : METHOD_INFO[m].help}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <fieldset className="rounded-xl border border-border p-3">
                    <legend className="px-1 text-xs font-semibold text-foreground">Model internals</legend>
                    <p className="mb-2 text-[11px] text-muted-foreground">Read the fitted model itself instead of perturbing it: no model evaluation.</p>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" aria-label="Include model internals" checked={intrinsic} disabled={running} onChange={(e) => custom(setIntrinsic)(e.target.checked)} />
                      <span>
                        <span className="font-medium text-foreground">Coefficients, VIP, selectivity ratio, components</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          Regression coefficients (model input and, for affine preprocessing, the exact raw spectrum), standardized coefficients, and for PLS-family
                          models VIP, selectivity ratio and component weights/loadings. Statistics use the {background?.label.toLowerCase() ?? 'background rows'}.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-foreground">Rows to explain</span>
                  <select aria-label="Explained rows source" className={field} value={explained.source} disabled={running} onChange={(e) => setSourceKey(e.target.value)}>
                    {options.map((o) => (
                      <option key={o.source} value={o.source}>{o.label}</option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-muted-foreground">
                    Background: {background?.label}{baseline === 'interpolate' ? ' (used by the local linear methods and model internals only)' : ''}.
                  </span>
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-foreground">Grouping</span>
                  <select aria-label="Explain grouping" className={field} value={effectiveGroupingKind} disabled={running} onChange={(e) => custom(setGroupingKind)(e.target.value as GroupingKind)}>
                    <option value="fixed_width">Fixed width</option>
                    <option value="bands" disabled={!bandsUsable}>Chemical bands{hasUnit ? '' : ' (needs a known axis unit)'}</option>
                    <option value="per_feature">Per wavelength ({nFeatures} groups)</option>
                  </select>
                  <span className="block text-[11px] text-muted-foreground">
                    {effectiveGroupingKind === 'bands'
                      ? 'Reference NIR absorption bands (approximate, literature-based) become groups; uncovered wavelengths form remainder groups.'
                      : effectiveGroupingKind === 'per_feature'
                        ? 'One group per wavelength: finest resolution, highest cost. Correlated neighbouring wavelengths split their credit.'
                        : 'Contiguous blocks of neighbouring wavelengths explained together (correlated wavelengths share credit).'}
                    {nGroups !== null ? ` ${nGroups} groups.` : ''}
                  </span>
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-foreground">Baseline</span>
                  <select aria-label="Explain baseline" className={field} value={baseline} disabled={running} onChange={(e) => custom(setBaseline)(e.target.value as ExplainBaseline)}>
                    {(['interpolate', 'background', 'mean'] as const).map((b) => (
                      <option key={b} value={b}>{BASELINE_INFO[b].label}</option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-muted-foreground">{BASELINE_INFO[baseline].help}</span>
                </label>
              </div>

              <Disclosure summary="What does “absent” mean? Preview the baseline on a spectrum" testId="explain-baseline-disclosure">
                <BaselinePreview
                  engine={engine}
                  rows={explained.rows}
                  background={background?.rows ?? explained.rows}
                  nFeatures={nFeatures}
                  grouping={grouping()}
                  axis={axis ?? null}
                  baseline={baseline}
                  maxBackground={maxBackground}
                  seed={seed}
                />
              </Disclosure>

              <Disclosure summary="Advanced settings: rows, background, permutations, seed, target" testId="explain-advanced">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {effectiveGroupingKind === 'fixed_width' ? (
                    <NumberField label="Group width (features)" help="Features per group; the last group may be shorter." value={width} min={1} max={nFeatures} onChange={custom(setWidth)} disabled={running} />
                  ) : null}
                  <div className="space-y-1">
                    <NumberField label="Max rows" help="Rows explained, subsampled deterministically by the seed." value={maxRows} min={1} onChange={custom(setMaxRows)} disabled={running || allRows} />
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input type="checkbox" aria-label="Explain all rows" checked={allRows} disabled={running} onChange={(e) => custom(setAllRows)(e.target.checked)} />
                      All rows of the selected source ({explained.rows.nRows})
                    </label>
                  </div>
                  <NumberField label="Background rows" help="Background rows, subsampled deterministically by the seed. Cost grows linearly with it for the background baseline." value={maxBackground} min={1} max={500} onChange={custom(setMaxBackground)} disabled={running} />
                  <NumberField label="Permutations" help="Permutation SHAP: antithetic permutation pairs per row; more reduces the Monte-Carlo error." value={nPermutations} min={1} max={200} onChange={custom(setNPermutations)} disabled={running} />
                  <NumberField label="Seed" help="Seeds row/background subsampling and the sampled explainers." value={seed} min={0} onChange={setSeed} disabled={running} />
                  {targetNames.length > 1 ? (
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-foreground">Target</span>
                      <select aria-label="Explained target" className={field} value={outputIndex} disabled={running} onChange={(e) => setOutputIndex(Number(e.target.value))}>
                        {targetNames.map((name, i) => (
                          <option key={name} value={i}>{name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </Disclosure>

              <div className="space-y-1 text-xs text-muted-foreground" data-explain-estimate>
                {estimates.length > 0 ? (
                  <p>
                    ≈ {formatCount(totalEvaluations)} pipeline evaluations in total
                    {throughput ? <> · about <span className="font-medium text-foreground">{formatDuration(totalEvaluations / throughput)}</span> at the speed measured on this model</> : ' · the duration is measured on the first run'}.
                    {' '}{estimates.map((e) => `${METHOD_INFO[e.method].label}: ${formatCount(e.evaluations)}`).join(' · ')}.
                  </p>
                ) : null}
                {totalEvaluations > 5_000_000 ? <p className="text-amber-700 dark:text-amber-300">This is a large explanation: the interpolate baseline, fewer permutations or rows, or wider groups reduce it.</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" className="gap-1.5" onClick={() => void run()} disabled={running || nothingSelected}>
                  <Play className="size-4" /> {runnable.length + (intrinsic ? 1 : 0) > 1 ? `Run ${runnable.length + (intrinsic ? 1 : 0)} analyses` : 'Run explanation'}
                </Button>
                {nothingSelected ? <span className="text-xs text-muted-foreground">Select at least one method.</span> : null}
                {history.entries.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setSetupOpen(false)} disabled={running}>Hide settings</Button>
                ) : null}
              </div>
            </div>
          )}

          {running || items.some((it) => it.status.state === 'failed') ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border p-3" data-explain-progress>
              {running ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Progress value={100 * fraction} aria-label="Explanation progress" className="min-w-[12rem] flex-1" />
                  <span className="text-[11px] text-muted-foreground">
                    {formatDuration(elapsed)} elapsed{Number.isFinite(eta) ? ` · about ${formatDuration(eta)} left` : ''}
                  </span>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={cancel}>
                    <Square className="size-4" /> Cancel
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-1 text-xs">
                {items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {it.status.state === 'done' ? <CheckCircle2 className="mt-0.5 size-3.5 text-brand-teal" />
                      : it.status.state === 'failed' ? <XCircle className="mt-0.5 size-3.5 text-destructive" />
                        : it.status.state === 'running' ? <Loader2 className="mt-0.5 size-3.5 animate-spin text-brand-teal" />
                          : <Circle className="mt-0.5 size-3.5 text-muted-foreground" />}
                    <span>
                      <span className="font-medium text-foreground">{it.label}</span>
                      {it.status.state === 'running' && it.status.total ? <span className="text-muted-foreground"> · {it.status.done?.toLocaleString()} / {it.status.total.toLocaleString()} model evaluations</span> : null}
                      {it.status.state === 'failed' ? <span className="block whitespace-pre-line text-destructive">{it.status.error}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="mt-4 whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {history.entries.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg border border-border p-0.5" role="tablist" aria-label="Explain results view">
              {(['details', 'compare'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={view.tab === tab}
                  onClick={() => setView((v) => ({ ...v, tab }))}
                  className={cn('rounded-md px-3 py-1 text-xs font-medium', view.tab === tab ? 'bg-brand-teal text-white' : 'text-muted-foreground hover:text-foreground')}
                >
                  {tab === 'details' ? 'Details' : `Compare (${history.entries.length})`}
                </button>
              ))}
            </div>
            <button type="button" onClick={history.clear} className="text-[11px] text-muted-foreground hover:text-destructive" title="Remove every unpinned result">Clear unpinned results</button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="explain-history" aria-label="Results of this session">
            {history.entries.map((e) => {
              const active = view.tab === 'details' && selectedEntry?.id === e.id
              return (
                <div
                  key={e.id}
                  className={cn('group flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs', active ? 'border-brand-teal bg-brand-teal/10' : 'border-border hover:border-brand-teal/50')}
                >
                  {renaming === e.id ? (
                    <input
                      autoFocus
                      aria-label="Result name"
                      defaultValue={e.label}
                      className="h-6 w-40 rounded border border-border bg-background px-1"
                      onBlur={(ev) => {
                        history.rename(e.id, ev.target.value.trim() || e.label)
                        setRenaming(null)
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
                        if (ev.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <button type="button" onClick={() => setView({ tab: 'details', entryId: e.id })} className="text-left" title={e.settingsLabel}>
                      <span className="font-medium text-foreground">{e.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString()}{e.kind === 'explanation' && e.response.elapsedMs ? ` · ${formatDuration(e.response.elapsedMs)}` : ''}</span>
                    </button>
                  )}
                  <button type="button" aria-label={`Rename ${e.label}`} onClick={() => setRenaming(e.id)} className="rounded p-0.5 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"><Pencil className="size-3" /></button>
                  <button type="button" aria-label={e.pinned ? `Unpin ${e.label}` : `Pin ${e.label}`} onClick={() => history.togglePin(e.id)} className={cn('rounded p-0.5 hover:text-foreground', e.pinned ? 'text-brand-teal' : 'text-muted-foreground opacity-60 group-hover:opacity-100')}>
                    {e.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                  </button>
                  <button type="button" aria-label={`Remove ${e.label}`} onClick={() => history.remove(e.id)} className="rounded p-0.5 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3" /></button>
                </div>
              )
            })}
          </div>

          {view.tab === 'compare' ? (
            <CompareView
              engine={engine}
              nGroups={nGroups}
              entries={history.entries}
              grouping={grouping()}
              groupingKey={groupingKey}
              groupingLabel={groupingLabel}
              nFeatures={nFeatures}
              axis={axis && hasUnit ? axis : null}
              axisLabel={axisLabel}
              spectrum={spectrum}
              bands={bands}
              exportName={sourceName}
            />
          ) : selectedEntry?.kind === 'explanation' ? (
            <ExplainResults
              key={selectedEntry.id}
              envelope={selectedEntry.response.envelope}
              explainedX={selectedEntry.response.explainedX}
              profile={selectedEntry.response.profile}
              bands={bands}
              showBands={showBands}
              onShowBandsChange={setShowBands}
              observed={selectedEntry.response.envelope.rows.source === 'predicted_rows' ? undefined : observed}
              exportName={sourceName}
              onDownload={() => downloadJson(envelopeFileName(sourceName, selectedEntry.response.envelope), selectedEntry.response.envelope)}
            />
          ) : selectedEntry?.kind === 'importance' ? (
            <ImportanceView key={selectedEntry.id} response={selectedEntry.response} gradientProfile={gradientProfile} spectrum={spectrum} bands={bands} exportName={sourceName} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
