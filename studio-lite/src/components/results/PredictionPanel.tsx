import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileUp, FlaskConical, Loader2, ShieldCheck, Target, Upload } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import type { PredictionPanelProps } from '@/components/contracts'
import type { Confusion, Metrics, PredictResult, PredRow } from '@/engine/types'
import { parseSpectraCsv } from '@/data/dataset'
import { classificationMetrics, regressionMetrics } from '@/engine/metrics'
import { fmt } from '@/lib/format'
import { parseCsv } from '@/data/csv'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'

import { CHART, classCounts, histogram, paddedExtent } from './_helpers'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
} as const

interface PredState {
  result: PredictResult
  nSamples: number
  /** when the spectra CSV carried an extra last column, its raw cells (length nSamples) become the auto-detected Y */
  autoY: string[] | null
}

/** Equal-axis extent across actual & predicted for a parity scatter (mirrors _helpers.parityExtent). */
function rowExtent(rows: PredRow[]): [number, number] {
  return paddedExtent([...rows.map((r) => r.actual), ...rows.map((r) => r.predicted)])
}

/** Build PredRow[] from predictions + raw Y cells, encoding per task type. On a shape/parse failure returns empty rows + a message. */
function buildRows(
  result: PredictResult,
  rawY: string[],
  isRegression: boolean,
  classes: string[] | undefined,
): { rows: PredRow[]; error: string | null } {
  const predValues = result.values
  const n = predValues.length
  if (rawY.length !== n) {
    return { rows: [], error: `Reference count mismatch: ${rawY.length} Y value${rawY.length === 1 ? '' : 's'} provided but the model produced ${n} prediction${n === 1 ? '' : 's'}.` }
  }
  const rows: PredRow[] = []
  if (isRegression) {
    for (let i = 0; i < n; i++) {
      const actual = Number(rawY[i].replace(',', '.'))
      if (!Number.isFinite(actual)) return { rows: [], error: `Non-numeric reference value "${rawY[i]}" at row ${i + 1}.` }
      const predicted = predValues[i]
      rows.push({ sampleId: String(i + 1), actual, predicted, residual: predicted - actual })
    }
    return { rows, error: null }
  }
  // classification: encode labels to indices against the model's training vocabulary
  const vocab = classes ?? []
  const idx = new Map(vocab.map((l, i) => [l, i]))
  const predLabels = result.labels ?? []
  for (let i = 0; i < n; i++) {
    const actualLabel = rawY[i]
    const predictedLabel = predLabels[i] ?? String(predValues[i])
    const ai = idx.get(actualLabel)
    if (ai === undefined) {
      return { rows: [], error: `Reference label "${actualLabel}" at row ${i + 1} is not one of the model's classes (${vocab.join(', ')}).` }
    }
    const pi = idx.get(predictedLabel) ?? -1
    rows.push({ sampleId: String(i + 1), actual: ai, predicted: pi, residual: 0, actualLabel, predictedLabel })
  }
  return { rows, error: null }
}

/** Read raw Y cells from a standalone reference CSV: one value per row, or the column whose length matches nSamples. */
function readYCells(text: string, nSamples: number): string[] {
  const pc = parseCsv(text)
  // Bug fix: pc.raw already contains all data rows regardless of hasHeader; [pc.header,...pc.raw] was wrong
  const rawRows = pc.raw
  if (rawRows.length === 0) throw new Error('No reference values found in the file.')
  // Use first-row width to pick the column (avoid a trailing delimiter on any row expanding col to an empty cell)
  const width = rawRows[0]?.length ?? 1
  // single column → that column; multiple columns → the LAST one (the y_train convention), validated against count
  const col = width > 1 ? width - 1 : 0
  const cells = rawRows.map((r) => (r[col] ?? r[0] ?? '').trim())
  if (cells.length !== nSamples) {
    throw new Error(`Reference count mismatch: ${cells.length} value${cells.length === 1 ? '' : 's'} in the file but ${nSamples} prediction${nSamples === 1 ? '' : 's'}.`)
  }
  return cells
}

export function PredictionPanel({ model, sourceName, engine, onImportModel }: PredictionPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const n4aRef = useRef<HTMLInputElement>(null)
  const yInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pred, setPred] = useState<PredState | null>(null)
  // Y reference upload (Mechanism 2 — dedicated zone), independent of the X flow
  const [yDragging, setYDragging] = useState(false)
  const [yFileName, setYFileName] = useState<string | null>(null)
  const [yError, setYError] = useState<string | null>(null)
  const [yBusy, setYBusy] = useState(false)
  const [yCells, setYCells] = useState<string[] | null>(null)
  const isRegression = model.taskType === 'regression'
  const nFeatures = model.nFeatures

  function resetY() {
    setYCells(null)
    setYFileName(null)
    setYError(null)
    if (yInputRef.current) yInputRef.current.value = ''
  }

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setPred(null)
    setFileName(file.name)
    resetY()
    try {
      const text = await file.text()
      // parseSpectraCsv drops a numeric wavelength header row (matches dataset assembly)
      const parsed = parseSpectraCsv(text)
      const rows = parsed.rows
      if (rows.length === 0) throw new Error('No data rows found in the file.')
      const cols = rows[0].length
      // Mechanism 1: an extra trailing column (nFeatures + 1) is interpreted as the reference Y.
      const hasAutoY = cols === nFeatures + 1
      if (cols !== nFeatures && !hasAutoY) {
        throw new Error(`Column count mismatch: the file has ${cols} columns but the model expects ${nFeatures} features${cols === nFeatures + 2 ? '' : ' (or ' + (nFeatures + 1) + ' with a trailing Y column)'}.`)
      }
      const nSamples = rows.length
      const X = new Float64Array(nSamples * nFeatures)
      const autoY: string[] | null = hasAutoY ? new Array(nSamples) : null
      // raw string cells aligned to the data rows — offset by 1 when parseSpectraCsv stripped a wavelength header row
      const pcForRaw = hasAutoY ? parseCsv(text) : null
      const rawOffset = pcForRaw ? pcForRaw.rows.length - rows.length : 0
      const rawCells = pcForRaw?.raw ?? null
      for (let i = 0; i < nSamples; i++) {
        const row = rows[i]
        if (row.length !== cols) throw new Error(`Row ${i + 1} has ${row.length} columns, expected ${cols}.`)
        for (let j = 0; j < nFeatures; j++) {
          const v = row[j]
          if (!Number.isFinite(v)) throw new Error(`Non-numeric value at row ${i + 1}, column ${j + 1}.`)
          X[i * nFeatures + j] = v
        }
        if (autoY) {
          // prefer the raw string (preserves class labels); rawOffset accounts for a stripped wavelength row
          const raw = rawCells?.[i + rawOffset]?.[nFeatures]
          autoY[i] = (raw ?? String(row[nFeatures])).trim()
        }
      }
      const result = await engine.predict(model, X, nSamples, nFeatures)
      setPred({ result, nSamples, autoY })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleYFile(file: File) {
    if (!pred) return
    setYBusy(true)
    setYError(null)
    setYCells(null)
    setYFileName(file.name)
    try {
      const text = await file.text()
      const cells = readYCells(text, pred.nSamples)
      setYCells(cells)
    } catch (e) {
      setYError(e instanceof Error ? e.message : String(e))
      setYFileName(null)
    } finally {
      setYBusy(false)
      if (yInputRef.current) yInputRef.current.value = ''
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  const onYDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setYDragging(false)
    if (yBusy || !pred) return
    const f = e.dataTransfer.files?.[0]
    if (f) void handleYFile(f)
  }

  // The active Y source: a manually-dropped reference (Mechanism 2) wins over the auto-detected column (Mechanism 1).
  const activeY = yCells ?? pred?.autoY ?? null
  const ySource: 'manual' | 'auto' | null = yCells ? 'manual' : pred?.autoY ? 'auto' : null

  // Reactively compute external-validation scores whenever predictions + valid Y are both ready.
  const validation = useMemo((): { metrics: Metrics; confusion?: Confusion; rows: PredRow[]; error: string | null } | null => {
    if (!pred || !activeY) return null
    const { rows, error: rowsError } = buildRows(pred.result, activeY, isRegression, model.classes)
    if (rowsError) return { metrics: { n: 0 }, rows: [], error: rowsError }
    if (isRegression) {
      return { metrics: regressionMetrics(rows), rows, error: null }
    }
    const { metrics, confusion } = classificationMetrics(rows, model.classes ?? [])
    return { metrics, confusion, rows, error: null }
  }, [pred, activeY, isRegression, model.classes])

  const values = pred ? Array.from(pred.result.values) : []
  const labels = pred?.result.labels
  const chartData = isRegression
    ? histogram(values, 20).map((b) => ({ name: b.label, count: b.count }))
    : classCounts(labels ?? [], model.classes).map((c) => ({ name: c.label, count: c.count }))
  const tableRows = values.slice(0, 15).map((v, i) => ({ index: i + 1, value: v, label: labels?.[i] }))

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
            <FlaskConical className="size-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Predict on new spectra</h3>
            <p className="text-xs text-muted-foreground">
              Model: <span className="font-medium text-foreground">{sourceName}</span> · expects{' '}
              <span className="font-mono">{nFeatures}</span> wavelengths · {model.taskType}
            </p>
          </div>
        </div>
        {onImportModel && (
          <>
            <input
              ref={n4aRef}
              type="file"
              accept=".n4a,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImportModel(f)
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => n4aRef.current?.click()} title="Load a saved model (.n4a)">
              <FileUp className="size-4" /> Load .n4a model
            </Button>
          </>
        )}
      </div>

      {/* drag-and-drop spectra zone */}
      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click()
        }}
        className={cn(
          'mb-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center outline-none transition-colors',
          busy && 'pointer-events-none opacity-70',
          dragging ? 'border-brand-teal bg-accent' : 'border-border bg-muted/40 hover:border-brand-teal/60 hover:bg-accent/40',
        )}
      >
        <span className={cn('flex size-12 items-center justify-center rounded-full transition-colors', dragging ? 'bg-brand-teal text-primary-foreground' : 'bg-accent text-brand-teal')}>
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
        </span>
        <p className="text-sm font-semibold text-foreground">{busy ? 'Predicting…' : 'Drop new spectra here'}</p>
        <p className="text-xs text-muted-foreground">
          or <span className="font-medium text-brand-teal">browse</span> — CSV, {nFeatures} columns (one spectrum per row)
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          Tip: add a trailing column ({nFeatures + 1} total) and it is read as reference Y values.
        </p>
        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
      </div>

      {fileName && !error && !busy && (
        <div className="mb-3 text-xs text-muted-foreground">
          Scored <span className="font-mono text-foreground">{fileName}</span>.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pred && (
        <div className="space-y-5">
          <div className="text-xs text-muted-foreground">
            {pred.nSamples} sample{pred.nSamples === 1 ? '' : 's'} predicted.
            {ySource === 'auto' && (
              <span className="ml-1 inline-flex items-center gap-1 text-brand-teal">
                <CheckCircle2 className="size-3.5" /> Last column interpreted as Y / reference values.
              </span>
            )}
          </div>
          <div className="rounded-xl border border-border p-4">
            <h4 className="mb-3 text-sm font-medium text-foreground">{isRegression ? 'Predicted value distribution' : 'Predicted class counts'}</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} interval={isRegression ? 2 : 0} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Count" fill={CHART.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">First {tableRows.length} of {pred.nSamples} predictions</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">{isRegression ? 'Predicted value' : 'Predicted class'}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.index} className={cn('border-b border-border/50 last:border-0')}>
                    <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{r.index}</td>
                    <td className="px-4 py-1.5 font-mono">{isRegression ? fmt(r.value) : (r.label ?? fmt(r.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mechanism 2 — dedicated reference-Y drop zone (only meaningful once predictions exist) */}
          <div
            role="button"
            tabIndex={0}
            aria-disabled={yBusy}
            onDragOver={(e) => {
              e.preventDefault()
              if (!yBusy) setYDragging(true)
            }}
            onDragLeave={() => setYDragging(false)}
            onDrop={onYDrop}
            onClick={() => !yBusy && yInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !yBusy) yInputRef.current?.click()
            }}
            className={cn(
              'flex items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4 text-center outline-none transition-colors',
              yBusy && 'pointer-events-none opacity-70',
              yDragging ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-muted/30 hover:border-amber-500/60 hover:bg-amber-500/5',
            )}
          >
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full transition-colors', yDragging ? 'bg-amber-500 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
              {yBusy ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
            </span>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">{yBusy ? 'Reading reference values…' : 'Drop Y reference values (optional)'}</p>
              <p className="text-xs text-muted-foreground">
                CSV with one {isRegression ? 'number' : 'label'} per row ({pred.nSamples} rows) → external validation scores
              </p>
            </div>
            <input ref={yInputRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleYFile(f) }} />
          </div>

          {yFileName && ySource === 'manual' && !yError && !yBusy && (
            <div className="-mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Reference values from <span className="font-mono text-foreground">{yFileName}</span>.</span>
              <button type="button" className="font-medium text-brand-teal hover:underline" onClick={resetY}>Clear</button>
            </div>
          )}

          {yError && (
            <div className="-mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{yError}</span>
            </div>
          )}

          {/* External-validation scores — visually distinct (amber/green accent) from the prediction-only display above */}
          {validation && validation.error && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{validation.error}</span>
            </div>
          )}

          {validation && !validation.error && (
            <ExternalValidation
              isRegression={isRegression}
              metrics={validation.metrics}
              confusion={validation.confusion}
              rows={validation.rows}
              nSamples={pred.nSamples}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface ExternalValidationProps {
  isRegression: boolean
  metrics: Metrics
  confusion?: Confusion
  rows: PredRow[]
  nSamples: number
}

/** The "external validation" results block: a green-accented header callout + metric cards + parity/confusion view. */
function ExternalValidation({ isRegression, metrics, confusion, rows, nSamples }: ExternalValidationProps) {
  const cards = isRegression
    ? [
        { label: 'RMSE', value: metrics.rmse },
        { label: 'R²', value: metrics.r2 },
        { label: 'MAE', value: metrics.mae },
      ]
    : [
        { label: 'Accuracy', value: metrics.accuracy },
        { label: 'Macro F1', value: metrics.f1 },
      ]
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4" />
          External validation: {metrics.n ?? rows.length} of {nSamples} samples
        </div>
      </div>
      <div className="space-y-5 p-4">
        {/* metric cards */}
        <div className={cn('grid gap-3', isRegression ? 'grid-cols-3' : 'grid-cols-2')}>
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-emerald-500/20 bg-card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmt(c.value)}</div>
            </div>
          ))}
        </div>

        {isRegression ? (
          <ValidationParity rows={rows} />
        ) : confusion ? (
          <ValidationConfusion confusion={confusion} />
        ) : null}
      </div>
    </div>
  )
}

/** Predicted-vs-actual scatter for external validation (mirrors ResultsVisualization's ParityChart). */
function ValidationParity({ rows }: { rows: PredRow[] }) {
  if (rows.length === 0) return null
  const [lo, hi] = rowExtent(rows)
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">Predicted vs Actual</h4>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="actual"
            name="Actual"
            domain={[lo, hi]}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            label={{ value: 'Actual', position: 'insideBottom', offset: -8, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="predicted"
            name="Predicted"
            domain={[lo, hi]}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            label={{ value: 'Predicted', angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <ZAxis range={[36, 36]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
          <ReferenceLine
            segment={[
              { x: lo, y: lo },
              { x: hi, y: hi },
            ]}
            stroke={CHART.indigo}
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
          />
          <Scatter name="Predictions" data={rows} fill={CHART.green} fillOpacity={0.65} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Confusion matrix for external validation (mirrors ResultsVisualization's ConfusionMatrix). */
function ValidationConfusion({ confusion }: { confusion: Confusion }) {
  const { labels, matrix } = confusion
  if (labels.length === 0 || matrix.length === 0) return null
  const max = Math.max(1, ...matrix.flat())
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">Confusion matrix</h4>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="p-2" />
              <th className="pb-2 text-center text-xs font-medium text-muted-foreground" colSpan={labels.length}>
                Predicted
              </th>
            </tr>
            <tr>
              <th className="p-2 text-right text-xs font-medium text-muted-foreground">True \ Pred</th>
              {labels.map((l) => (
                <th key={l} className="px-2 pb-1 text-center text-xs font-medium text-foreground">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th className="pr-2 text-right text-xs font-medium text-foreground">{labels[i]}</th>
                {row.map((count, j) => {
                  const intensity = count / max
                  const diagonal = i === j
                  return (
                    <td
                      key={`${i}-${j}`}
                      className={cn('h-12 w-12 rounded-md text-center align-middle font-mono text-sm', diagonal ? 'font-bold' : 'font-medium')}
                      style={{
                        backgroundColor: diagonal
                          ? `color-mix(in srgb, ${CHART.teal} ${10 + intensity * 80}%, transparent)`
                          : `color-mix(in srgb, ${CHART.amber} ${intensity * 70}%, transparent)`,
                        color: intensity > 0.5 ? '#fff' : 'var(--foreground)',
                        outline: diagonal ? `1.5px solid ${CHART.teal}` : 'none',
                      }}
                    >
                      {count}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Rows = true class, columns = predicted class. Diagonal = correct.</p>
    </div>
  )
}
