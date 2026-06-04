import { useRef, useState } from 'react'
import { AlertCircle, FlaskConical, Loader2, Upload } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { PredictionPanelProps } from '@/components/contracts'
import type { PredictResult } from '@/engine/types'
import { parseSpectraCsv } from '@/data/dataset'
import { fmt } from '@/lib/format'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'

import { CHART, classCounts, histogram } from './_helpers'

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
}

export function PredictionPanel(props: PredictionPanelProps) {
  const { run, engine } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pred, setPred] = useState<PredState | null>(null)
  const isRegression = run.taskType === 'regression'
  const nFeatures = run.model.nFeatures

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setPred(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      // parseSpectraCsv drops a numeric wavelength header row (matches dataset assembly)
      const rows = parseSpectraCsv(text).rows
      if (rows.length === 0) {
        throw new Error('No data rows found in the file.')
      }
      const cols = rows[0].length
      if (cols !== nFeatures) {
        throw new Error(
          `Column count mismatch: the file has ${cols} columns but the model expects ${nFeatures} features.`,
        )
      }
      const nSamples = rows.length
      const X = new Float64Array(nSamples * nFeatures)
      for (let i = 0; i < nSamples; i++) {
        const row = rows[i]
        if (row.length !== nFeatures) {
          throw new Error(`Row ${i + 1} has ${row.length} columns, expected ${nFeatures}.`)
        }
        for (let j = 0; j < nFeatures; j++) {
          const v = row[j]
          if (!Number.isFinite(v)) {
            throw new Error(`Non-numeric value at row ${i + 1}, column ${j + 1}.`)
          }
          X[i * nFeatures + j] = v
        }
      }
      const result = await engine.predict(run.model, X, nSamples, nFeatures)
      setPred({ result, nSamples })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const values = pred ? Array.from(pred.result.values) : []
  const labels = pred?.result.labels

  const chartData = isRegression
    ? histogram(values, 20).map((b) => ({ name: b.label, count: b.count }))
    : classCounts(labels ?? [], run.model.classes).map((c) => ({ name: c.label, count: c.count }))

  const tableRows = values.slice(0, 15).map((v, i) => ({
    index: i + 1,
    value: v,
    label: labels?.[i],
  }))

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
          <FlaskConical className="size-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">Predict on new spectra</h3>
          <p className="text-xs text-muted-foreground">
            Upload a CSV with {nFeatures} columns (one spectrum per row). Predictions use the refit model from{' '}
            <span className="font-medium text-foreground">{run.pipelineName}</span>.
          </p>
        </div>
      </div>

      {/* Upload control */}
      <div className="mb-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? 'Predicting…' : 'Choose CSV file'}
        </Button>
        {fileName && !error && (
          <span className="ml-3 text-xs text-muted-foreground">{fileName}</span>
        )}
      </div>

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
          </div>

          {/* Distribution chart */}
          <div className="rounded-xl border border-border p-4">
            <h4 className="mb-3 text-sm font-medium text-foreground">
              {isRegression ? 'Predicted value distribution' : 'Predicted class counts'}
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 10 }}
                  interval={isRegression ? 2 : 0}
                />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Count" fill={CHART.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sample table */}
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              First {tableRows.length} of {pred.nSamples} predictions
            </div>
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
                    <td className="px-4 py-1.5 font-mono">
                      {isRegression ? fmt(r.value) : (r.label ?? fmt(r.value))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
