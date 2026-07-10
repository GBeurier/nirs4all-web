import { lazy, Suspense, useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  BarChart3,
  LineChart as LineChartIcon,
  ScatterChart as ScatterIcon,
  Settings2,
  Table2,
} from 'lucide-react'
import { fmt } from '@/lib/format'
import type { DatasetViewProps } from '@/components/contracts'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card } from '@/app/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { CHART, histogram } from './_helpers'
import { buildFolds } from '@/engine/kfold'
import { computePca } from './pca'
import {
  applyPreview,
  buildSpectraChart,
  CLASS_PALETTE,
  continuousColor,
  PARTITION_COLOR,
  PREVIEW_OPS,
  type PartitionFilter,
  type PreviewOp,
  type ViewMode,
} from './preview'

const CHART_HEIGHT = 320

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-brand-teal">
      {children}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
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

/** A compact segmented pill control. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-full border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={
            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors ' +
            (value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

/**
 * Dataset inspector / mini-playground: spectra with live preprocessing preview
 * (raw / processed / both / difference) + a min–max band, a client-side PCA
 * scatter coloured by target / class / partition, the target distribution, and a
 * summary grid. Numerics here are explore-only; the real run goes through libn4m.
 */
export function DatasetView({ ds, summary, onOpenConfig }: DatasetViewProps) {
  const [tab, setTab] = useState('spectra')
  const [filter, setFilter] = useState<PartitionFilter>('all')
  const [opId, setOpId] = useState('none')
  const [viewMode, setViewMode] = useState<ViewMode>('processed')

  const axisLabel = `Wavelength (${summary.axisUnit})`
  const hasTest = summary.nTest > 0
  const isReg = ds.taskType === 'regression'

  const op = useMemo<PreviewOp>(() => PREVIEW_OPS.find((o) => o.id === opId) ?? PREVIEW_OPS[0], [opId])
  const processed = useMemo(() => (op.type ? applyPreview(ds, op) : null), [ds, op])
  const effectiveMode: ViewMode = op.type ? viewMode : 'original'
  const spectra = useMemo(
    () => buildSpectraChart(ds, ds.axis, processed, effectiveMode, filter, 50),
    [ds, processed, effectiveMode, filter],
  )

  const targetBins = useMemo(() => (isReg ? histogram(Array.from(ds.y), 24) : []), [ds, isReg])

  const partitionOptions: { value: PartitionFilter; label: string }[] = hasTest
    ? [{ value: 'all', label: 'All' }, { value: 'train', label: 'Train' }, { value: 'test', label: 'Test' }]
    : [{ value: 'all', label: 'All' }]

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="spectra" className="gap-1.5">
            <LineChartIcon className="h-4 w-4" />
            Spectra
          </TabsTrigger>
          <TabsTrigger value="pca" className="gap-1.5">
            <ScatterIcon className="h-4 w-4" />
            PCA
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
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2">
              <FieldLabel>Partition</FieldLabel>
              <Segmented value={filter} onChange={setFilter} options={partitionOptions} ariaLabel="Partition filter" />
            </label>
            <label className="flex items-center gap-2">
              <FieldLabel>Preprocess</FieldLabel>
              <select
                value={opId}
                onChange={(e) => setOpId(e.target.value)}
                aria-label="Preprocessing preview"
                className="h-7 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-teal/50"
              >
                {PREVIEW_OPS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            {op.type ? (
              <label className="flex items-center gap-2">
                <FieldLabel>View</FieldLabel>
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: 'original', label: 'Original' },
                    { value: 'processed', label: 'Processed' },
                    { value: 'both', label: 'Both' },
                    { value: 'difference', label: 'Difference' },
                  ]}
                  ariaLabel="View mode"
                />
              </label>
            ) : null}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: PARTITION_COLOR.train }} /> train
            </span>
            {hasTest && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: PARTITION_COLOR.test }} /> test
              </span>
            )}
            {spectra.means.map((m) => (
              <span key={m.key} className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ background: m.color }} /> {m.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-brand-teal/20" /> min–max range
            </span>
          </div>

          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={spectra.rows} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                stroke="var(--border)"
                label={{ value: axisLabel, position: 'insideBottom', offset: -8, fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" width={48} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
                formatter={(v: number | number[]) => (Array.isArray(v) ? `${fmt(v[0])} … ${fmt(v[1])}` : fmt(v))}
                labelFormatter={(l) => `${axisLabel}: ${l}`}
              />
              {spectra.bandKey && (
                <Area
                  type="monotone"
                  dataKey={spectra.bandKey}
                  stroke="none"
                  fill="var(--chart-1)"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              {spectra.lines.map((ln) => (
                <Line
                  key={ln.key}
                  type="monotone"
                  dataKey={ln.key}
                  stroke={ln.color}
                  strokeOpacity={0.18}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
              {spectra.means.map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2.5}
                  strokeDasharray={m.dash ? '5 4' : undefined}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </TabsContent>

        {/* ---- PCA ---- */}
        <TabsContent value="pca" className="pt-4">
          <PcaPanel ds={ds} active={tab === 'pca'} isReg={isReg} filter={filter} />
        </TabsContent>

        {/* ---- Target ---- */}
        <TabsContent value="target" className="pt-4">
          {isReg ? (
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
                    <Cell key={i} fill={CLASS_PALETTE[i % CLASS_PALETTE.length]} />
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

type ColorBy = 'fold' | 'target' | 'partition' | 'metadata'
type PcaView = '2d' | '3d'

// 3D scatter is a pure-WebGL2 renderer with zero runtime deps; lazy-load it so it
// stays out of the initial bundle and only fetches when the user enters 3D.
const ScatterWebGL3D = lazy(() => import('./scatter3d/ScatterWebGL3D'))

const MUTED_COLOR = 'var(--muted-foreground)'

/** Lazily-computed client PCA scatter (2D recharts / 3D WebGL), with colour-by
 *  fold / Y-or-class / partition / metadata. Only runs when the PCA tab is active. */
function PcaPanel({
  ds,
  active,
  isReg,
  filter,
}: {
  ds: import('@/engine/types').MaterializedDataset
  active: boolean
  isReg: boolean
  filter: PartitionFilter
}) {
  const [px, setPx] = useState(0)
  const [py, setPy] = useState(1)
  const [pz, setPz] = useState(2)
  const [colorBy, setColorBy] = useState<ColorBy>('fold') // default: colour by CV fold
  const [viewMode, setViewMode] = useState<PcaView>('2d') // 2D recharts is the default (keeps it light)
  const [foldCount, setFoldCount] = useState(5)
  const metaCols = ds.metadata ?? []
  const [metaCol, setMetaCol] = useState<string>(metaCols[0]?.name ?? '')

  const pca = useMemo(() => (active ? computePca(ds, 4) : null), [ds, active])

  const yRange = useMemo(() => {
    if (!isReg) return [0, 1] as const
    let lo = Infinity
    let hi = -Infinity
    for (const v of ds.y) {
      if (!Number.isFinite(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    return [lo, hi] as const
  }, [ds, isReg])

  // row → CV fold index (folds cover the TRAIN partition only; test/predict → none).
  const foldOf = useMemo(() => {
    const m = new Map<number, number>()
    if (active) buildFolds(ds, foldCount, 42).forEach((f, fi) => f.valIdx.forEach((r) => m.set(r, fi)))
    return m
  }, [ds, foldCount, active])

  const metaColumn = metaCols.find((c) => c.name === metaCol)
  const metaInfo = useMemo(() => {
    if (!metaColumn) return null
    if (metaColumn.kind === 'numeric') {
      let lo = Infinity
      let hi = -Infinity
      for (const v of metaColumn.values) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      return { numeric: true as const, lo, hi }
    }
    const vocab = Array.from(new Set(metaColumn.values.filter((v): v is string => v != null))).sort()
    return { numeric: false as const, vocab }
  }, [metaColumn])

  if (!pca || pca.nComp < 1) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Computing principal components…</p>
  }
  if (pca.nComp < 2) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Not enough samples/features for a 2-D PCA.</p>
  }

  const a = Math.min(px, pca.nComp - 1)
  const b = Math.min(py, pca.nComp - 1)
  const c = Math.min(pz, pca.nComp - 1)
  const has3d = pca.nComp >= 3
  const is3d = viewMode === '3d' && has3d

  const colorOf = (row: number): string => {
    switch (colorBy) {
      case 'partition':
        return PARTITION_COLOR[ds.partitions[row]] ?? PARTITION_COLOR.train
      case 'fold': {
        const f = foldOf.get(row)
        return f === undefined ? MUTED_COLOR : CLASS_PALETTE[f % CLASS_PALETTE.length]
      }
      case 'metadata': {
        if (!metaColumn || !metaInfo) return MUTED_COLOR
        const v = metaColumn.values[row]
        if (v == null) return MUTED_COLOR
        if (metaInfo.numeric) {
          const t = metaInfo.hi > metaInfo.lo ? (Number(v) - metaInfo.lo) / (metaInfo.hi - metaInfo.lo) : 0.5
          return continuousColor(t)
        }
        const idx = metaInfo.vocab.indexOf(String(v))
        return idx >= 0 ? CLASS_PALETTE[idx % CLASS_PALETTE.length] : MUTED_COLOR
      }
      default: // target
        if (isReg) {
          const [lo, hi] = yRange
          const t = hi > lo ? (ds.y[row] - lo) / (hi - lo) : 0.5
          return continuousColor(t)
        }
        return CLASS_PALETTE[Math.round(ds.y[row]) % CLASS_PALETTE.length]
    }
  }
  const pts = pca.scores.map((s, i) => {
    const row = pca.usedIdx[i]
    return { x: s[a], y: s[b], z: has3d ? s[c] : 0, color: colorOf(row), row }
  })
  const filtered = filter === 'all' ? pts : pts.filter((p) => ds.partitions[p.row] === filter)

  const pcOptions = Array.from({ length: pca.nComp }, (_, i) => ({ value: String(i), label: `PC${i + 1}` }))
  const ev = (i: number) => `${(pca.explained[i] * 100).toFixed(1)}%`
  const cumulative = pca.explained.slice(0, pca.nComp).reduce((s, e) => s + e, 0)

  const colorOptions: { value: ColorBy; label: string }[] = [
    { value: 'fold', label: 'Fold' },
    { value: 'target', label: isReg ? 'Y value' : 'Class' },
    { value: 'partition', label: 'Partition' },
    ...(metaCols.length ? [{ value: 'metadata' as const, label: 'Metadata' }] : []),
  ]

  const selectCls =
    'h-7 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-teal/50'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {has3d && (
          <label className="flex items-center gap-2">
            <FieldLabel>View</FieldLabel>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]}
              ariaLabel="View mode"
            />
          </label>
        )}
        <label className="flex items-center gap-2">
          <FieldLabel>X</FieldLabel>
          <Segmented value={String(a)} onChange={(v) => setPx(Number(v))} options={pcOptions} ariaLabel="X component" />
        </label>
        <label className="flex items-center gap-2">
          <FieldLabel>Y</FieldLabel>
          <Segmented value={String(b)} onChange={(v) => setPy(Number(v))} options={pcOptions} ariaLabel="Y component" />
        </label>
        {is3d && (
          <label className="flex items-center gap-2">
            <FieldLabel>Z</FieldLabel>
            <Segmented value={String(c)} onChange={(v) => setPz(Number(v))} options={pcOptions} ariaLabel="Z component" />
          </label>
        )}
        <label className="flex items-center gap-2">
          <FieldLabel>Colour</FieldLabel>
          <Segmented value={colorBy} onChange={setColorBy} options={colorOptions} ariaLabel="Colour by" />
        </label>
        {colorBy === 'fold' && (
          <label className="flex items-center gap-2">
            <FieldLabel>Folds</FieldLabel>
            <select value={String(foldCount)} onChange={(e) => setFoldCount(Number(e.target.value))} aria-label="Fold count" className={selectCls}>
              {[3, 5, 10].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        )}
        {colorBy === 'metadata' && metaCols.length > 0 && (
          <label className="flex items-center gap-2">
            <FieldLabel>Column</FieldLabel>
            <select value={metaCol} onChange={(e) => setMetaCol(e.target.value)} aria-label="Metadata column" className={selectCls}>
              {metaCols.map((cc) => <option key={cc.name} value={cc.name}>{cc.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {is3d ? (
        <Suspense fallback={<div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: CHART_HEIGHT }}>Loading 3D view…</div>}>
          <ScatterWebGL3D
            points={filtered.map((p) => [p.x, p.y, p.z] as [number, number, number])}
            colors={filtered.map((p) => p.color)}
            axisLabels={[`PC${a + 1}`, `PC${b + 1}`, `PC${c + 1}`]}
            height={CHART_HEIGHT}
          />
        </Suspense>
      ) : (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <RScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="x"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              label={{ value: `PC${a + 1} (${ev(a)})`, position: 'insideBottom', offset: -8, fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              width={48}
              label={{ value: `PC${b + 1} (${ev(b)})`, angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }}
              formatter={(v: number) => fmt(v)}
            />
            <Scatter data={filtered} isAnimationActive={false}>
              {filtered.map((p, i) => (
                <Cell key={i} fill={p.color} fillOpacity={0.78} />
              ))}
            </Scatter>
          </RScatterChart>
        </ResponsiveContainer>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Top {pca.nComp} PCs explain <span className="font-mono text-foreground">{(cumulative * 100).toFixed(1)}%</span> of variance
        {pca.usedIdx.length < ds.nSamples ? ` · computed on a ${pca.usedIdx.length}-sample subset` : ''}.
        {colorBy === 'fold' ? ' Colour: CV fold (train rows; test/predict shown muted).' : ''}
        {colorBy === 'target' && isReg ? ' Colour: teal (low) → amber (high) Y.' : ''}
        {is3d ? ' Drag to rotate, scroll to zoom.' : ''}
      </p>
    </div>
  )
}
