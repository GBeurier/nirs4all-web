import { useMemo, useState } from 'react'
import { ArrowDownUp, Download, Info, Sparkles } from 'lucide-react'
import {
  AttributionHeatmap,
  FeatureImportanceBar,
  ImportanceComparisonChart,
  ShapBeeswarm,
  SpectralImportanceChart,
  WaterfallChart,
  type SpectralBand,
} from 'nirs4all-ui/viz'

import type { ExplanationV1, ImportanceProfileV1 } from '@/engine/types'
import { fmt } from '@/lib/format'
import { downloadText } from '@/lib/chartExport'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/components/ui/utils'

import { ChartFrame } from './ExplainBits'
import {
  axisTitle,
  beeswarmView,
  fileSlug,
  importanceItems,
  METHOD_INFO,
  rowBars,
  rowLabel,
  rowStdError,
  spectralView,
  waterfallView,
} from './explainView'
import { expandGroups, explanationCsv, IMPORTANCE_INFO, profileCsv, spaceExplanation, summarySentence } from './insights'

export interface ExplainResultsProps {
  envelope: ExplanationV1
  /** raw values of the explained rows (row-major), aligned with envelope.rows */
  explainedX: Float64Array
  /** reference absorption bands in the axis unit ([] when the unit is unknown) */
  bands: readonly SpectralBand[]
  /** whether bands are drawn at all; which bands (important zones or all) is chosen in this view */
  showBands: boolean
  onShowBandsChange?: (show: boolean) => void
  onDownload?: () => void
  /** the gradient explainer's mean local raw-spectrum coefficients */
  profile?: ImportanceProfileV1
  /** observed target of a source row (dataset partitions only) */
  observed?: (sourceIndex: number) => number | undefined
  /** file-name stem for exports */
  exportName?: string
}

/** Band overlay modes: candidate bands over the important zones, every band in range, or none. */
export type BandMode = 'important' | 'all' | 'off'

/** Band overlay mode options, in display order. */
export const BAND_MODE_OPTIONS: ReadonlyArray<{ value: BandMode; label: string }> = [
  { value: 'important', label: 'Bands: important zones' },
  { value: 'all', label: 'Bands: all' },
  { value: 'off', label: 'Bands: off' },
]

/** Additivity residuals below this are rounding noise and not flagged. */
const ADDITIVITY_TOLERANCE = 1e-6

type SortKey = 'row' | 'prediction' | 'observed' | 'residual'
interface RowInfo { row: number; sample: number; prediction: number; observed: number | undefined; residual: number | undefined }

function RowTable({ rows, selected, onSelect }: { rows: RowInfo[]; selected: number; onSelect: (row: number) => void }) {
  const hasObserved = rows.some((r) => r.observed !== undefined)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: hasObserved ? 'residual' : 'row', desc: hasObserved })
  const sorted = useMemo(() => {
    const val = (r: RowInfo): number => {
      if (sort.key === 'row') return r.row
      if (sort.key === 'prediction') return r.prediction
      if (sort.key === 'observed') return r.observed ?? Number.NEGATIVE_INFINITY
      return r.residual === undefined ? Number.NEGATIVE_INFINITY : Math.abs(r.residual)
    }
    return [...rows].sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)))
  }, [rows, sort])
  const head = (key: SortKey, label: string, title: string) => (
    <th className="px-2 py-1.5 text-left font-medium">
      <button type="button" title={title} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'row' }))} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === key ? <ArrowDownUp className="size-3" /> : null}
      </button>
    </th>
  )
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border" data-testid="explain-row-table">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr>
            {head('row', 'Row', 'Explained-row position')}
            <th className="px-2 py-1.5 text-left font-medium">Sample #</th>
            {head('prediction', 'Prediction', 'Prediction of the complete pipeline')}
            {hasObserved ? head('observed', 'Observed', 'Observed target of the dataset row') : null}
            {hasObserved ? head('residual', '|Residual|', 'Sort by absolute prediction error (worst first)') : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.row}
              onClick={() => onSelect(r.row)}
              aria-selected={r.row === selected}
              className={cn('cursor-pointer border-t border-border/60 hover:bg-brand-teal/5', r.row === selected && 'bg-brand-teal/10 font-medium text-foreground')}
            >
              <td className="px-2 py-1 font-mono">{r.row}</td>
              <td className="px-2 py-1 font-mono">{r.sample}</td>
              <td className="px-2 py-1 font-mono">{fmt(r.prediction, 4)}</td>
              {hasObserved ? <td className="px-2 py-1 font-mono">{r.observed === undefined ? '—' : fmt(r.observed, 4)}</td> : null}
              {hasObserved ? <td className="px-2 py-1 font-mono">{r.residual === undefined ? '—' : fmt(r.residual, 4)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ExplainResults({ envelope: env, explainedX, bands, showBands, onShowBandsChange, onDownload, profile, observed, exportName = 'explanation' }: ExplainResultsProps) {
  const [row, setRow] = useState(0)
  const [bandFocus, setBandFocus] = useState<Exclude<BandMode, 'off'>>('important')
  const [hoverGroup, setHoverGroup] = useState<number | null>(null)
  const bandMode: BandMode = showBands ? bandFocus : 'off'
  const changeBandMode = (mode: BandMode) => {
    if (mode !== 'off') setBandFocus(mode)
    onShowBandsChange?.(mode !== 'off')
  }
  const selected = Math.min(row, env.rows.count - 1)
  const info = METHOD_INFO[env.kind as keyof typeof METHOD_INFO]
  const label = info?.label ?? env.kind
  const p = env.axis.values.length
  const spectral = useMemo(() => spectralView(env, explainedX), [env, explainedX])
  const items = useMemo(() => importanceItems(env), [env])
  const swarm = useMemo(() => beeswarmView(env, explainedX), [env, explainedX])
  const summary = useMemo(() => summarySentence(env, bands), [env, bands])
  // Mean per-row Monte-Carlo standard error per group: an upper bound on the expected error of
  // the mean |attribution| curve (|·| is 1-Lipschitz), so it is drawn around that curve.
  const errorBand = useMemo(() => {
    if (!env.std_error) return undefined
    const out = env.output.index
    const perGroup = env.groups.map((_, gi) => {
      const se = env.std_error!.map((rowSe) => rowSe[gi][out]).filter(Number.isFinite)
      return se.length > 0 ? se.reduce((a, b) => a + b, 0) / se.length : Number.NaN
    })
    return expandGroups(env.groups, perGroup, p)
  }, [env, p])
  const out = env.output.index
  const rowInfos = useMemo<RowInfo[]>(() => env.rows.sample_indices.map((sample, r) => {
    const prediction = env.prediction[r][out]
    const obs = observed?.(sample)
    return { row: r, sample, prediction, observed: obs, residual: obs === undefined ? undefined : prediction - obs }
  }), [env, out, observed])
  const heatRows = useMemo(() => env.attributions.map((a, r) => ({ id: String(r), label: rowLabel(r, env.rows.sample_indices[r]), values: a.map((g) => g[out]) })), [env, out])
  const heatColumns = useMemo(() => env.groups.map((g) => ({ label: g.label })), [env])
  const hovered = hoverGroup !== null ? env.groups[hoverGroup] : undefined
  const highlight = hovered ? { start: Math.min(hovered.axis_start, hovered.axis_end), end: Math.max(hovered.axis_start, hovered.axis_end) } : null
  const groupAt = (range: { start: number; end: number } | null): number | null => {
    if (!range) return null
    const mid = (range.start + range.end) / 2
    const lo = (g: { axis_start: number; axis_end: number }) => Math.min(g.axis_start, g.axis_end)
    const hi = (g: { axis_start: number; axis_end: number }) => Math.max(g.axis_start, g.axis_end)
    const gi = env.groups.findIndex((g) => mid >= lo(g) && mid <= hi(g))
    return gi >= 0 ? gi : null
  }
  const unit = env.axis.unit ?? undefined
  const waterfall = env.additive ? waterfallView(env, selected) : null
  const stdError = rowStdError(env, selected)
  const outputName = env.output.label ?? `output ${env.output.index}`
  const stem = `${fileSlug(exportName)}.${env.kind}`

  return (
    <div className="space-y-5" data-testid="explain-results">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{label}</span> · {env.exactness} · {env.additive ? 'additive' : 'not additive'} ·{' '}
          {env.groups.length} groups · {env.rows.count} rows · output <span className="font-medium text-foreground">{outputName}</span> ({env.output.space}) ·{' '}
          {env.engine.name} {env.engine.version}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadText(`${stem}.groups.csv`, explanationCsv(env))}>
            <Download className="size-4" /> Group values (CSV)
          </Button>
          {onDownload ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownload}>
              <Download className="size-4" /> Download explanation (JSON)
            </Button>
          ) : null}
        </div>
      </div>

      <p className="flex gap-2 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3 text-sm leading-relaxed text-foreground" data-testid="explain-summary">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-teal" />
        <span>{summary}</span>
      </p>

      <ChartFrame
        title="Spectral importance"
        fileName={`${stem}.spectral-importance`}
        help={
          <>
            The curve is the mean |attribution| of each group over the explained rows; the shaded regions are the mean signed attribution (raises or lowers the
            prediction).{errorBand ? ' The band around the curve is ± the mean per-row Monte-Carlo standard error, a conservative bound on the sampling error of the curve.' : ''} Hover a region to highlight it in the
            heatmap; click a group in the heatmap to highlight it here.
          </>
        }
        controls={bands.length > 0 && onShowBandsChange ? (
          <select
            aria-label="Reference absorption bands"
            title="Candidate absorption bands over the important zones (|mean signed attribution| at least half of the strongest), every reference band in range, or none"
            value={bandMode}
            onChange={(e) => changeBandMode(e.target.value as BandMode)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            {BAND_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : null}
      >
        <SpectralImportanceChart
          axis={spectral.axis}
          importance={spectral.importance}
          importanceError={errorBand}
          importanceErrorLabel="± Monte-Carlo error (bound)"
          spectrum={spectral.spectrum}
          regions={spectral.regions}
          regionValueKind="signed"
          axisLabel={axisTitle(env)}
          axisUnit={unit}
          importanceLabel="Mean |attribution| (group)"
          spectrumLabel="Mean explained spectrum"
          regionLabel="Mean signed attribution"
          positiveLabel="Raises the prediction"
          negativeLabel="Lowers the prediction"
          bands={bandMode === 'off' ? undefined : bands}
          bandFocus={bandMode === 'off' ? undefined : bandMode}
          highlightRange={highlight}
          onRangeHover={(r) => setHoverGroup(groupAt(r))}
          onRangeSelect={(r) => setHoverGroup(groupAt(r))}
          title="Mean |attribution| along the spectrum"
        />
        {env.axis.kind === 'feature_index' ? (
          <p className="mt-2 text-xs text-muted-foreground">No spectral axis unit is recorded for this model: the axis shows feature indices and reference bands are unavailable.</p>
        ) : null}
      </ChartFrame>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title={env.additive ? 'Waterfall of one row' : 'Attributions of one row'}
          fileName={`${stem}.row-${selected}`}
          help="Pick a row in the table (sorted by absolute residual when observed targets are known, so the worst predictions come first)."
        >
          <RowTable rows={rowInfos} selected={selected} onSelect={setRow} />
          <div className="mt-3">
            {waterfall ? (
              <>
                <WaterfallChart
                  baseValue={waterfall.baseValue}
                  contributions={waterfall.contributions}
                  predicted={waterfall.predicted}
                  topN={waterfall.contributions.length}
                  xLabel={`Prediction (${outputName})`}
                  title={`Additive decomposition · ${rowLabel(selected, env.rows.sample_indices[selected])}`}
                />
                <p className="mt-2 text-xs text-muted-foreground" data-testid="explain-additivity">
                  Base E[f(x)] {fmt(waterfall.baseValue, 4)} + contributions = prediction {fmt(waterfall.predicted, 4)}.
                  {waterfall.additivityError > ADDITIVITY_TOLERANCE
                    ? ` Additivity error ${waterfall.additivityError.toExponential(2)} (sampled estimate).`
                    : ' Additive within rounding.'}
                  {stdError !== null ? ` Largest Monte-Carlo standard error for this row: ${fmt(stdError, 4)}.` : ''}
                </p>
              </>
            ) : (
              <>
                <FeatureImportanceBar
                  items={rowBars(env, selected)}
                  signed
                  topN={12}
                  xLabel="Attribution"
                  title={`${label} attributions · ${rowLabel(selected, env.rows.sample_indices[selected])}`}
                />
                <p className="mt-2 text-xs text-muted-foreground" data-testid="explain-not-additive">
                  {label} is not additive: these attributions do not sum to the prediction, so no waterfall is drawn.
                </p>
              </>
            )}
          </div>
        </ChartFrame>

        <ChartFrame title="Top groups" fileName={`${stem}.top-groups`} help="Groups ranked by mean |attribution| over the explained rows.">
          <FeatureImportanceBar items={items} topN={12} showRank xLabel="Mean |attribution|" title="Mean |attribution| per group" />
        </ChartFrame>
      </div>

      <ChartFrame
        title="Attribution map"
        fileName={`${stem}.heatmap`}
        testId="explain-heatmap"
        help="Signed attribution of every group (columns, in spectral order) for every explained row (lines). Red raises, blue lowers the prediction. Click a line to select that row; hover a column to highlight its region on the spectrum."
      >
        <AttributionHeatmap
          rows={heatRows}
          columns={heatColumns}
          selectedRowId={String(selected)}
          onRowActivate={(id) => setRow(Number(id))}
          highlightColumn={hoverGroup}
          onColumnHover={setHoverGroup}
          title="Signed attribution per row and group"
        />
      </ChartFrame>

      <ChartFrame title="Attribution distribution" fileName={`${stem}.beeswarm`} help="One point per explained row for the strongest groups; colour is the row's mean raw value in the group.">
        <ShapBeeswarm
          features={swarm}
          width={760}
          xLabel="Attribution"
          colorLabel="Mean raw value in group"
          selectedSampleIds={[selected]}
          onPointActivate={(id) => setRow(Number(id))}
          sampleLabel={(id) => rowLabel(Number(id), env.rows.sample_indices[Number(id)])}
          title="Attribution per explained row (top groups)"
        />
      </ChartFrame>

      {profile ? (
        <ChartFrame
          title={IMPORTANCE_INFO[profile.kind].label}
          fileName={`${stem}.mean-gradient`}
          onCsv={() => downloadText(`${stem}.mean-gradient.csv`, profileCsv(profile))}
          help={<>{IMPORTANCE_INFO[profile.kind].help} {spaceExplanation(profile.space, profile)}</>}
        >
          <ImportanceComparisonChart
            axis={profile.axis.values}
            axisLabel={axisTitle(env)}
            axisUnit={unit}
            series={[{ id: 'mean-gradient', label: 'Mean local gradient', values: profile.values, signed: true, dashed: profile.exactness !== 'exact' }]}
            scaling="none"
            spectrum={spectral.spectrum}
            bands={bandMode === 'off' ? undefined : bands}
            title="Mean local raw-spectrum coefficients"
          />
        </ChartFrame>
      ) : null}

      <aside className="flex gap-2 rounded-xl border border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-teal" />
        <span>
          {env.kind === 'linear_shap' || env.kind === 'gradient'
            ? 'Local linear explanation of the complete fitted pipeline (preprocessing and model) on the raw spectrum, measured from the background mean spectrum.'
            : 'Model-agnostic explanation of the complete fitted pipeline (preprocessing and model) in the raw spectral space: each group of wavelengths is a player, so values describe the pipeline’s response to the chosen baseline, not chemical causation.'}
          {env.std_error ? ' Permutation SHAP is a Monte-Carlo estimate; increase permutations to reduce its standard error.' : ''}
          {' '}Row indices are explained-row positions; “sample #” is the 0-based row of the source ({env.rows.source ?? 'input'}).
          {' '}Exact TreeSHAP is available in the nirs4all Python SDK.
        </span>
      </aside>
    </div>
  )
}
