import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, BarChart3, LineChart as LineChartIcon, Settings2, Table2 } from 'lucide-react'
import { spectraForPlot } from '@/data/dataset'
import { fmt } from '@/lib/format'
import type { DatasetViewProps } from '@/components/contracts'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card } from '@/app/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { CHART, buildSpectraSeries, histogram } from './_helpers'

const CHART_HEIGHT = 300

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-brand-teal">
      {children}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-brand-paper px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </Badge>
  )
}

/**
 * Read-only dataset inspector: spectra overlay, target distribution, and a
 * summary stat grid. Purely presentational — config is delegated upward.
 */
export function DatasetView({ ds, summary, onOpenConfig }: DatasetViewProps) {
  const spectra = useMemo(() => buildSpectraSeries(spectraForPlot(ds), ds.axis, 80), [ds])
  const targetBins = useMemo(
    () => (ds.taskType === 'regression' ? histogram(Array.from(ds.y), 24) : []),
    [ds],
  )

  const axisLabel = `Wavelength (${summary.axisUnit})`
  const hasTest = summary.nTest > 0

  return (
    <Card className="gap-0 overflow-hidden p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <SectionIcon>
            <Table2 className="h-4 w-4" />
          </SectionIcon>
          <div>
            <h3 className="font-semibold text-foreground">{summary.name || 'Dataset'}</h3>
            <Badge variant="secondary" className="mt-1 font-mono">
              {summary.nSamples} samples × {summary.nFeatures} wavelengths
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={onOpenConfig}>
          <Settings2 className="h-4 w-4" />
          Configure
        </Button>
      </div>

      <Tabs defaultValue="spectra">
        <TabsList className="w-full">
          <TabsTrigger value="spectra" className="gap-1.5">
            <LineChartIcon className="h-4 w-4" />
            Spectra
          </TabsTrigger>
          <TabsTrigger value="target" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Target
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5">
            <Activity className="h-4 w-4" />
            Summary
          </TabsTrigger>
        </TabsList>

        {/* ---- Spectra ---- */}
        <TabsContent value="spectra" className="pt-4">
          <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: CHART.teal }} /> train
            </span>
            {hasTest && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: CHART.amber }} /> test
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-brand-indigo" /> mean
            </span>
          </div>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={spectra.rows} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                stroke="var(--border)"
                label={{ value: axisLabel, position: 'insideBottom', offset: -8, fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                stroke="var(--border)"
                width={48}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                formatter={(v: number) => fmt(v)}
                labelFormatter={(l) => `${axisLabel}: ${l}`}
              />
              {spectra.trainKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={CHART.teal} strokeOpacity={0.18} strokeWidth={1} dot={false} isAnimationActive={false} />
              ))}
              {spectra.testKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={CHART.amber} strokeOpacity={0.25} strokeWidth={1} dot={false} isAnimationActive={false} />
              ))}
              <Line type="monotone" dataKey="mean" stroke="var(--brand-indigo)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </TabsContent>

        {/* ---- Target ---- */}
        <TabsContent value="target" className="pt-4">
          {ds.taskType === 'regression' ? (
            <>
              {summary.yStats && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <Chip label="min" value={fmt(summary.yStats.min)} />
                  <Chip label="mean" value={fmt(summary.yStats.mean)} />
                  <Chip label="max" value={fmt(summary.yStats.max)} />
                  <Chip label="std" value={fmt(summary.yStats.std)} />
                </div>
              )}
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={targetBins} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="bin"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    stroke="var(--border)"
                    interval="preserveStartEnd"
                    label={{ value: summary.targetName, position: 'insideBottom', offset: -8, fontSize: 12, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" width={40} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                    formatter={(v: number) => [`${v}`, 'count']}
                    labelFormatter={(l) => `≥ ${l}`}
                  />
                  <Bar dataKey="count" fill={CHART.teal} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={summary.classes ?? []} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  stroke="var(--border)"
                  label={{ value: summary.targetName, position: 'insideBottom', offset: -8, fontSize: 12, fill: 'var(--muted-foreground)' }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" width={40} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                  formatter={(v: number) => [`${v}`, 'count']}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {(summary.classes ?? []).map((_, i) => (
                    <Cell key={i} fill={[CHART.teal, CHART.cyan, CHART.indigo, CHART.green, CHART.amber][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        {/* ---- Summary ---- */}
        <TabsContent value="summary" className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Samples" value={summary.nSamples} />
            <Stat label="Wavelengths" value={summary.nFeatures} />
            <Stat label="Train / Test" value={`${summary.nTrain} / ${summary.nTest}`} />
            <Stat
              label="Axis range"
              value={`${fmt(summary.axisRange[0], 1)} – ${fmt(summary.axisRange[1], 1)} ${summary.axisUnit}`}
            />
            <Stat label="Task" value={summary.taskType} />
            <Stat label="Target" value={summary.targetName} />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
