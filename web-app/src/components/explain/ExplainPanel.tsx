import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Microscope, Play, Square } from 'lucide-react'
import { referenceBandsForAxis } from 'nirs4all-ui/viz'
import 'nirs4all-ui/assets/viz.css'

import type { ExplainPanelProps } from '@/components/contracts'
import { EXPLAIN_DEFAULTS, EXPLAIN_METHODS } from '@/engine/explain'
import type { ExplainBaseline, ExplainGrouping, ExplainMethod, ExplainProgress, ExplainResponse } from '@/engine/types'
import { formatRuntimeErrorForUi } from '@/app/runtimeErrors'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { cn } from '@/app/components/ui/utils'
import { downloadJson } from '@/lib/download'

import { ExplainResults } from './ExplainResults'
import {
  backgroundFor,
  bandRanges,
  BASELINE_INFO,
  envelopeFileName,
  groupCount,
  METHOD_INFO,
  modelTargetNames,
  estimateEvaluations,
  rowSourceOptions,
  unitKnown,
} from './explainView'

type GroupingKind = 'fixed_width' | 'bands' | 'per_feature'

const field = 'block h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

function StatusBadge({ status }: { status: 'implemented' | 'experimental' }) {
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

function NumberField({ label, help, value, min, max, onChange, disabled }: { label: string; help: string; value: number; min: number; max?: number; onChange: (v: number) => void; disabled?: boolean }) {
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

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return 'too many'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} G`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`
  return String(Math.round(n))
}

export function ExplainPanel({ model, sourceName, targetName, targetNames: declaredTargets, engine, dataset, predicted, axis, onGoPredict }: ExplainPanelProps) {
  const nFeatures = model.nFeatures
  const [method, setMethod] = useState<ExplainMethod>(EXPLAIN_DEFAULTS.method)
  const [baseline, setBaseline] = useState<ExplainBaseline>(EXPLAIN_DEFAULTS.baseline)
  const [groupingKind, setGroupingKind] = useState<GroupingKind>('fixed_width')
  const [width, setWidth] = useState(EXPLAIN_DEFAULTS.fixedWidth)
  const [sourceKey, setSourceKey] = useState<string>('')
  const [maxRows, setMaxRows] = useState(EXPLAIN_DEFAULTS.maxRows)
  const [allRows, setAllRows] = useState(false)
  const [maxBackground, setMaxBackground] = useState(EXPLAIN_DEFAULTS.maxBackground)
  const [nPermutations, setNPermutations] = useState(EXPLAIN_DEFAULTS.nPermutations)
  const [seed, setSeed] = useState(EXPLAIN_DEFAULTS.seed)
  const [outputIndex, setOutputIndex] = useState(0)
  const [showBands, setShowBands] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExplainProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ExplainResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const token = useRef(0)

  // A different model invalidates any running or finished explanation.
  useEffect(() => {
    setResponse(null)
    setError(null)
    setOutputIndex(0)
    return () => {
      token.current++
      abortRef.current?.abort()
      abortRef.current = null
      setRunning(false)
      setProgress(null)
    }
  }, [model])

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
  const nGroups = groupCount(groupingKind, nFeatures, width, axis ?? null, ranges)
  const exactAllowed = nGroups !== null && nGroups <= 16
  const effectiveRows = explained ? (allRows ? explained.rows.nRows : Math.min(maxRows, explained.rows.nRows)) : 0
  const effectiveBackground = background ? Math.min(maxBackground, background.rows.nRows) : 0
  const estimate = nGroups !== null && explained
    ? estimateEvaluations({ method, baseline, nRows: effectiveRows, nBackground: effectiveBackground, nGroups, nPermutations })
    : null
  const isRegression = model.taskType === 'regression'

  const grouping = (): ExplainGrouping =>
    groupingKind === 'per_feature' ? { kind: 'per_feature' }
      : groupingKind === 'bands' ? { kind: 'ranges', ranges, source: 'nirs4all-ui reference absorption bands' }
        : { kind: 'fixed_width', width }

  async function run() {
    if (!explained || !background) return
    const id = ++token.current
    const ctrl = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ctrl
    setRunning(true)
    setError(null)
    setResponse(null)
    setProgress({ done: 0, total: 0 })
    try {
      const result = await engine.explain({
        model,
        nFeatures,
        featureNames: explained.featureNames,
        rows: explained.rows,
        background: background.rows,
        method,
        baseline,
        grouping: grouping(),
        nPermutations,
        seed,
        maxRows: effectiveRows,
        maxBackground,
        outputIndex,
        outputLabel: targetNames[outputIndex] ?? targetName,
        axis: axis ?? null,
      }, {
        signal: ctrl.signal,
        onProgress: (p) => {
          if (id === token.current) setProgress(p)
        },
      })
      if (id === token.current) setResponse(result)
    } catch (e) {
      if (id !== token.current) return
      if (e instanceof DOMException && e.name === 'AbortError') setError('Explanation cancelled.')
      else setError(formatRuntimeErrorForUi(e))
    } finally {
      if (id === token.current) {
        setRunning(false)
        setProgress(null)
        if (abortRef.current === ctrl) abortRef.current = null
      }
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  const pct = progress && progress.total > 0 ? (100 * progress.done) / progress.total : 0

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="flex items-center gap-2 font-medium text-foreground">Method <StatusBadge status={METHOD_INFO[method].status} /></span>
              <select aria-label="Explain method" className={field} value={method} disabled={running} onChange={(e) => setMethod(e.target.value as ExplainMethod)}>
                {EXPLAIN_METHODS.map((m) => (
                  <option key={m} value={m} disabled={m === 'exact_shap' && !exactAllowed}>
                    {METHOD_INFO[m].label} ({METHOD_INFO[m].status}){m === 'exact_shap' && !exactAllowed ? ' — needs ≤ 16 groups' : ''}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] text-muted-foreground">{METHOD_INFO[method].help}</span>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Baseline</span>
              <select aria-label="Explain baseline" className={field} value={baseline} disabled={running} onChange={(e) => setBaseline(e.target.value as ExplainBaseline)}>
                {(['background', 'interpolate', 'mean'] as const).map((b) => (
                  <option key={b} value={b}>{BASELINE_INFO[b].label}</option>
                ))}
              </select>
              <span className="block text-[11px] text-muted-foreground">{BASELINE_INFO[baseline].help}</span>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Grouping</span>
              <select aria-label="Explain grouping" className={field} value={groupingKind} disabled={running} onChange={(e) => setGroupingKind(e.target.value as GroupingKind)}>
                <option value="fixed_width">Fixed width</option>
                <option value="bands" disabled={!hasUnit || ranges.length === 0}>Chemical bands{hasUnit ? '' : ' (needs a known axis unit)'}</option>
                <option value="per_feature">Per wavelength ({nFeatures} groups)</option>
              </select>
              <span className="block text-[11px] text-muted-foreground">
                {groupingKind === 'bands'
                  ? 'Reference NIR absorption bands (approximate, literature-based) become groups; uncovered wavelengths form remainder groups.'
                  : groupingKind === 'per_feature'
                    ? 'One group per wavelength: finest resolution, highest cost. Correlated neighbouring wavelengths split their credit.'
                    : 'Contiguous blocks of neighbouring wavelengths explained together (correlated wavelengths share credit).'}
                {nGroups !== null ? ` ${nGroups} groups.` : ''}
              </span>
            </label>

            {groupingKind === 'fixed_width' ? (
              <NumberField label="Group width (features)" help="Features per group; the last group may be shorter." value={width} min={1} max={nFeatures} onChange={setWidth} disabled={running} />
            ) : null}

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Rows to explain</span>
              <select aria-label="Explained rows source" className={field} value={explained.source} disabled={running} onChange={(e) => setSourceKey(e.target.value)}>
                {options.map((o) => (
                  <option key={o.source} value={o.source}>{o.label}</option>
                ))}
              </select>
              <span className="block text-[11px] text-muted-foreground">
                Background: {background?.label}{baseline === 'interpolate' ? ' (not used by the interpolate baseline)' : ''}.
              </span>
            </label>

            <div className="space-y-1">
              <NumberField label="Max rows" help="Rows explained, subsampled deterministically by the seed." value={maxRows} min={1} onChange={setMaxRows} disabled={running || allRows} />
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" aria-label="Explain all rows" checked={allRows} disabled={running} onChange={(e) => setAllRows(e.target.checked)} />
                All rows of the selected source ({explained.rows.nRows})
              </label>
            </div>
            <NumberField label="Background rows" help="Background rows, subsampled deterministically by the seed. Cost grows linearly with it." value={maxBackground} min={1} max={500} onChange={setMaxBackground} disabled={running || baseline === 'interpolate'} />
            {method === 'permutation_shap' ? (
              <NumberField label="Permutations" help="Antithetic permutation pairs per row; more reduces the Monte-Carlo error." value={nPermutations} min={1} max={200} onChange={setNPermutations} disabled={running} />
            ) : null}
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

          {estimate !== null ? (
            <p className="mt-4 text-xs text-muted-foreground" data-explain-estimate>
              ≈ {formatCount(estimate)} pipeline evaluations ({effectiveRows} rows × {nGroups} groups{baseline === 'background' ? ` × ${effectiveBackground} background rows` : ''}).
              {estimate > 5_000_000 ? ' This is a large explanation: the mean or interpolate baseline, fewer permutations or wider groups reduce it.' : ''}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {running ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={cancel}>
                <Square className="size-4" /> Cancel
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={() => void run()} disabled={method === 'exact_shap' && !exactAllowed}>
                <Play className="size-4" /> Run explanation
              </Button>
            )}
            {running ? (
              <div className="min-w-[14rem] flex-1 space-y-1" data-explain-progress>
                <Progress value={pct} aria-label="Explanation progress" />
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {progress && progress.total > 0 ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} model evaluations` : 'Preparing…'}
                </span>
              </div>
            ) : null}
          </div>
        </>
      )}

      {error ? <p className="mt-4 whitespace-pre-line rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {response ? (
        <div className="mt-6">
          <ExplainResults
            envelope={response.envelope}
            explainedX={response.explainedX}
            bands={bands}
            showBands={showBands}
            onShowBandsChange={setShowBands}
            onDownload={() => downloadJson(envelopeFileName(sourceName, response.envelope), response.envelope)}
          />
        </div>
      ) : null}
    </div>
  )
}
