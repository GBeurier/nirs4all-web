import { Activity, BarChart3, Grid3x3, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import type { ResultsVisualizationProps } from '@/components/contracts'
import type { Confusion, RunResult, ScoreNode } from '@/engine/types'
import { fmt, metricChips, primaryMetric } from '@/lib/format'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { cn } from '@/app/components/ui/utils'

import { CHART, foldSeries, paddedExtent, parityExtent, primaryValue } from './_helpers'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
} as const

const axisTick = (value: string | number): string => (typeof value === 'number' ? fmt(value, 2) : value)

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function ParityChart({ score }: { score: ScoreNode }) {
  const data = score.predictions
  if (data.length === 0) return <EmptyChart message="No predictions for this score node." />
  const [lo, hi] = parityExtent(data)
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="actual"
          name="Actual"
          domain={[lo, hi]}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
          tickFormatter={axisTick}
          label={{ value: 'Actual', position: 'insideBottom', offset: -8, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="predicted"
          name="Predicted"
          domain={[lo, hi]}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
          tickFormatter={axisTick}
          label={{ value: 'Predicted', angle: -90, position: 'insideLeft', fontSize: 12 }}
        />
        <ZAxis range={[36, 36]} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        {/* y = x reference line spanning the data range */}
        <ReferenceLine
          segment={[
            { x: lo, y: lo },
            { x: hi, y: hi },
          ]}
          stroke={CHART.indigo}
          strokeDasharray="6 4"
          ifOverflow="extendDomain"
        />
        <Scatter name="Predictions" data={data} fill={CHART.teal} fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function ResidualChart({ score }: { score: ScoreNode }) {
  const data = score.predictions
  if (data.length === 0) return <EmptyChart message="No predictions for this score node." />
  const [xlo, xhi] = paddedExtent(data.map((d) => d.predicted))
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="predicted"
          name="Predicted"
          domain={[xlo, xhi]}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
          tickFormatter={axisTick}
          label={{ value: 'Predicted', position: 'insideBottom', offset: -8, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="residual"
          name="Residual"
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
          tickFormatter={axisTick}
          label={{ value: 'Residual', angle: -90, position: 'insideLeft', fontSize: 12 }}
        />
        <ZAxis range={[36, 36]} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <ReferenceLine y={0} stroke={CHART.amber} strokeDasharray="5 5" />
        <Scatter name="Residuals" data={data} fill={CHART.cyan} fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function ConfusionMatrix({ confusion }: { confusion: Confusion }) {
  const { labels, matrix } = confusion
  if (labels.length === 0 || matrix.length === 0) return <EmptyChart message="No confusion matrix available." />
  const max = Math.max(1, ...matrix.flat())
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-confusion>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="p-2" />
              <th
                className="pb-2 text-center text-xs font-medium text-muted-foreground"
                colSpan={labels.length}
              >
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
                      className={cn(
                        'h-12 w-12 rounded-md text-center align-middle font-mono text-sm',
                        diagonal ? 'font-bold' : 'font-medium',
                      )}
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

/** Per-class precision / recall / F1 / support — derived purely from the
 *  already-computed confusion matrix (presentation arithmetic, no ML here). */
function PerClassTable({ confusion }: { confusion: Confusion }) {
  const { labels, matrix } = confusion
  if (labels.length === 0 || matrix.length === 0) return null
  const rows = labels.map((label, i) => {
    const tp = matrix[i]?.[i] ?? 0
    const support = (matrix[i] ?? []).reduce((a, v) => a + v, 0) // true count for class i
    const predicted = matrix.reduce((a, r) => a + (r[i] ?? 0), 0) // predicted count for class i
    const precision = predicted > 0 ? tp / predicted : 0
    const recall = support > 0 ? tp / support : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    return { label, precision, recall, f1, support }
  })
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">Class</th>
            <th className="px-2 py-1 text-right font-medium">Precision</th>
            <th className="px-2 py-1 text-right font-medium">Recall</th>
            <th className="px-2 py-1 text-right font-medium">F1</th>
            <th className="px-2 py-1 text-right font-medium">Support</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <td className="px-2 py-1 font-medium text-foreground">{r.label}</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(r.precision)}</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(r.recall)}</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(r.f1)}</td>
              <td className="px-2 py-1 text-right font-mono text-muted-foreground">{r.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FoldsChart({ run, score }: { run: RunResult; score: ScoreNode }) {
  const pm = primaryMetric(run.taskType)
  const series = foldSeries(run.taskType, run.folds)
  if (series.length === 0) return <EmptyChart message="No fold scores available." />
  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={series} margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="fold" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
        <YAxis
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
          tickFormatter={axisTick}
          label={{ value: pm.label, angle: -90, position: 'insideLeft', fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        <Bar dataKey="value" name={pm.label} radius={[6, 6, 0, 0]}>
          {series.map((s) => (
            <Cell key={s.id} fill={score.id === s.id ? CHART.indigo : CHART.teal} fillOpacity={score.id === s.id ? 1 : 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ResultsVisualization(props: ResultsVisualizationProps) {
  const { run, score } = props
  const isRegression = run.taskType === 'regression'
  const pm = primaryMetric(run.taskType)
  const primary = primaryValue(run.taskType, score.metrics)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Title + selected score + metric chips */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {run.pipelineName} <span className="text-muted-foreground">·</span>{' '}
            <span className="text-brand-teal">{score.name}</span>
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {metricChips(run.taskType).map((c) => (
              <span
                key={c.key}
                className="inline-flex items-baseline gap-1 rounded-md bg-muted px-2.5 py-1 text-xs"
              >
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-mono font-medium text-foreground">{fmt(score.metrics[c.key])}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2 rounded-xl bg-muted/50 px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{pm.label}</span>
          <span className="font-mono text-xl font-bold text-brand-teal">{fmt(primary)}</span>
        </div>
      </div>

      {isRegression ? (
        // Regression: parity + residuals + per-fold scores.
        <Tabs defaultValue="parity">
          <TabsList className="mb-5 h-auto flex-wrap gap-1 bg-muted p-1">
            <TabsTrigger value="parity" className="gap-1.5">
              <TrendingUp className="size-4" />
              Predicted vs Actual
            </TabsTrigger>
            <TabsTrigger value="residuals" className="gap-1.5">
              <Activity className="size-4" />
              Residuals
            </TabsTrigger>
            <TabsTrigger value="folds" className="gap-1.5">
              <BarChart3 className="size-4" />
              Folds
            </TabsTrigger>
          </TabsList>
          <TabsContent value="parity">
            <ParityChart score={score} />
          </TabsContent>
          <TabsContent value="residuals">
            <ResidualChart score={score} />
          </TabsContent>
          <TabsContent value="folds">
            <FoldsChart run={run} score={score} />
          </TabsContent>
        </Tabs>
      ) : (
        // Classification: confusion matrix + per-class metrics + per-fold scores.
        // No parity / residual scatter — those are meaningless for class labels.
        <Tabs defaultValue="confusion">
          <TabsList className="mb-5 h-auto flex-wrap gap-1 bg-muted p-1">
            <TabsTrigger value="confusion" className="gap-1.5">
              <Grid3x3 className="size-4" />
              Confusion Matrix
            </TabsTrigger>
            <TabsTrigger value="folds" className="gap-1.5">
              <BarChart3 className="size-4" />
              Folds
            </TabsTrigger>
          </TabsList>
          <TabsContent value="confusion">
            {score.confusion ? (
              <>
                <ConfusionMatrix confusion={score.confusion} />
                <PerClassTable confusion={score.confusion} />
              </>
            ) : (
              <EmptyChart message="No confusion matrix for this score node." />
            )}
          </TabsContent>
          <TabsContent value="folds">
            <FoldsChart run={run} score={score} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
