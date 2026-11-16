import { useMemo, useState } from 'react'
import { Download, Info } from 'lucide-react'
import {
  FeatureImportanceBar,
  ShapBeeswarm,
  SpectralImportanceChart,
  WaterfallChart,
  type SpectralBand,
} from 'nirs4all-ui/viz'

import type { ExplanationV1 } from '@/engine/types'
import { fmt } from '@/lib/format'
import { Button } from '@/app/components/ui/button'

import {
  axisTitle,
  beeswarmView,
  importanceItems,
  METHOD_INFO,
  rowBars,
  rowLabel,
  rowStdError,
  spectralView,
  waterfallView,
} from './explainView'

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

export function ExplainResults({ envelope: env, explainedX, bands, showBands, onShowBandsChange, onDownload }: ExplainResultsProps) {
  const [row, setRow] = useState(0)
  const [bandFocus, setBandFocus] = useState<Exclude<BandMode, 'off'>>('important')
  const bandMode: BandMode = showBands ? bandFocus : 'off'
  const changeBandMode = (mode: BandMode) => {
    if (mode !== 'off') setBandFocus(mode)
    onShowBandsChange?.(mode !== 'off')
  }
  const selected = Math.min(row, env.rows.count - 1)
  const info = METHOD_INFO[env.kind as keyof typeof METHOD_INFO]
  const spectral = useMemo(() => spectralView(env, explainedX), [env, explainedX])
  const items = useMemo(() => importanceItems(env), [env])
  const swarm = useMemo(() => beeswarmView(env, explainedX), [env, explainedX])
  const unit = env.axis.unit ?? undefined
  const waterfall = env.additive ? waterfallView(env, selected) : null
  const stdError = rowStdError(env, selected)
  const outputName = env.output.label ?? `output ${env.output.index}`

  return (
    <div className="space-y-5" data-testid="explain-results">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{info?.label ?? env.kind}</span> · {env.exactness} · {env.additive ? 'additive' : 'not additive'} ·{' '}
          {env.groups.length} groups · {env.rows.count} rows · output <span className="font-medium text-foreground">{outputName}</span> ({env.output.space}) ·{' '}
          {env.engine.name} {env.engine.version}
        </span>
        {onDownload ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownload}>
            <Download className="size-4" /> Download explanation (JSON)
          </Button>
        ) : null}
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground">Spectral importance</h4>
          {bands.length > 0 && onShowBandsChange ? (
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
        </div>
        <SpectralImportanceChart
          axis={spectral.axis}
          importance={spectral.importance}
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
          title="Mean |attribution| along the spectrum"
        />
        {env.axis.kind === 'feature_index' ? (
          <p className="mt-2 text-xs text-muted-foreground">No spectral axis unit is recorded for this model: the axis shows feature indices and reference bands are unavailable.</p>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">{env.additive ? 'Waterfall' : 'Row attributions'}</h4>
            <select
              aria-label="Explained row"
              value={selected}
              onChange={(e) => setRow(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              {env.rows.sample_indices.map((sourceIndex, i) => (
                <option key={i} value={i}>{rowLabel(i, sourceIndex)}</option>
              ))}
            </select>
          </div>
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
                title={`${info?.label ?? env.kind} attributions · ${rowLabel(selected, env.rows.sample_indices[selected])}`}
              />
              <p className="mt-2 text-xs text-muted-foreground" data-testid="explain-not-additive">
                {info?.label ?? env.kind} is not additive: these attributions do not sum to the prediction, so no waterfall is drawn.
              </p>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Top groups</h4>
          <FeatureImportanceBar items={items} topN={12} showRank xLabel="Mean |attribution|" title="Mean |attribution| per group" />
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h4 className="mb-2 text-sm font-semibold text-foreground">Attribution distribution</h4>
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
      </section>

      <aside className="flex gap-2 rounded-xl border border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-teal" />
        <span>
          Model-agnostic explanation of the complete fitted pipeline (preprocessing and model) in the raw spectral space: each group of
          wavelengths is a player, so values describe the pipeline’s response to the chosen baseline, not chemical causation.
          {env.std_error ? ' Permutation SHAP is a Monte-Carlo estimate; increase permutations to reduce its standard error.' : ''}
          {' '}Row indices are explained-row positions; “sample #” is the 0-based row of the source ({env.rows.source ?? 'input'}).
          Exact TreeSHAP and linear SHAP explainers are available in the nirs4all Python SDK; the web app uses model-agnostic methods.
        </span>
      </aside>
    </div>
  )
}
