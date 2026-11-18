import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ImportanceComparisonChart, type SpectralBand } from 'nirs4all-ui/viz'

import type { ImportanceKind, ImportanceProfileV1, ImportanceResponse } from '@/engine/types'
import { downloadText } from '@/lib/chartExport'
import { cn } from '@/app/components/ui/utils'

import { ChartFrame } from './ExplainBits'
import { fileSlug } from './explainView'
import { IMPORTANCE_INFO, profileCsv, profileLabel, spaceExplanation, stepLabel } from './insights'

type Tab = 'coefficients' | 'standardized' | 'vip' | 'selectivity' | 'components'
const TABS: ReadonlyArray<{ id: Tab; label: string; kinds: ImportanceKind[] }> = [
  { id: 'coefficients', label: 'Coefficients', kinds: ['regression_coefficients', 'mean_local_gradient'] },
  { id: 'standardized', label: 'Standardized', kinds: ['standardized_coefficients'] },
  { id: 'vip', label: 'VIP', kinds: ['vip'] },
  { id: 'selectivity', label: 'Selectivity ratio', kinds: ['selectivity_ratio'] },
  { id: 'components', label: 'Components', kinds: ['x_weights', 'x_loadings'] },
]

function axisLabel(p: ImportanceProfileV1): string {
  if (p.axis.kind === 'wavelength') return `Wavelength (${p.axis.unit})`
  if (p.axis.kind === 'wavenumber') return `Wavenumber (${p.axis.unit})`
  if (p.axis.kind === 'model_feature') return 'Model feature (after preprocessing)'
  return 'Feature index'
}

/** Profiles drawn on one chart share an axis; others get their own chart. */
function byAxis(profiles: ImportanceProfileV1[]): ImportanceProfileV1[][] {
  const groups: ImportanceProfileV1[][] = []
  for (const p of profiles) {
    const g = groups.find((x) => x[0].axis.kind === p.axis.kind && x[0].axis.values.length === p.axis.values.length)
    if (g) g.push(p)
    else groups.push([p])
  }
  return groups
}

export interface ImportanceViewProps {
  response: ImportanceResponse
  /** the latest local-gradient profile of this model (raw spectrum), when one was run */
  gradientProfile?: ImportanceProfileV1 | null
  /** mean raw spectrum, drawn under raw-axis profiles */
  spectrum?: number[]
  bands: readonly SpectralBand[]
  exportName: string
}

export function ImportanceView({ response, gradientProfile, spectrum, bands, exportName }: ImportanceViewProps) {
  const all = useMemo(() => (gradientProfile ? [...response.profiles, gradientProfile] : response.profiles), [response, gradientProfile])
  const available = TABS.filter((t) => all.some((p) => t.kinds.includes(p.kind)))
  const [tab, setTab] = useState<Tab>(available[0]?.id ?? 'coefficients')
  const [component, setComponent] = useState(0)
  const [scaling, setScaling] = useState<'max_abs' | 'none'>('max_abs')
  const current = available.find((t) => t.id === tab) ?? available[0]
  const nComponents = Math.max(0, ...all.filter((p) => p.component !== null).map((p) => (p.component ?? 0) + 1))
  const shown = current
    ? all.filter((p) => current.kinds.includes(p.kind) && (current.id !== 'components' || p.component === component))
    : []
  const { pipeline } = response
  const stem = fileSlug(exportName)

  return (
    <div className="space-y-4" data-testid="explain-importance">
      <div className="rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">Preprocessing:</span>
          {pipeline.steps.length === 0 ? <span>none</span> : pipeline.steps.map((s, i) => (
            <span
              key={`${s.type}-${i}`}
              title={`${s.affine ? 'Affine' : 'Not affine'}; ${s.columnAligned ? 'keeps each variable at its wavelength' : 'changes the variables'}`}
              className={cn('rounded-full border px-2 py-0.5 font-mono', s.affine ? 'border-brand-teal/40 text-brand-teal' : 'border-amber-500/50 text-amber-700 dark:text-amber-300')}
            >
              {stepLabel(s.type)}{s.affine ? '' : ' · non-affine'}
            </span>
          ))}
        </div>
        {pipeline.affine ? (
          <p className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-teal" />Every preprocessing step is affine, so the model coefficients map exactly onto the raw spectrum and Linear SHAP is exact.</p>
        ) : (
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            “{stepLabel(pipeline.firstNonAffineStep ?? '')}” is not affine: model-space profiles describe the preprocessed signal, and the raw-spectrum view comes from the
            local gradient explainer (a first-order average around the explained spectra){gradientProfile ? '' : ' — select “Local gradient” and run it to add that view'}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Model-intrinsic profile">
        {available.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            onClick={() => setTab(t.id)}
            className={cn('rounded-full border px-3 py-1 text-xs', t.id === current?.id ? 'border-brand-teal bg-brand-teal/10 font-semibold text-brand-teal' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
        {current?.id === 'components' && nComponents > 0 ? (
          <select aria-label="Latent component" value={component} onChange={(e) => setComponent(Number(e.target.value))} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            {Array.from({ length: nComponents }, (_, a) => <option key={a} value={a}>Component {a + 1}</option>)}
          </select>
        ) : null}
      </div>

      {byAxis(shown).map((group) => {
        const first = group[0]
        const multi = group.length > 1
        return (
          <ChartFrame
            key={`${first.kind}-${first.space}-${first.axis.kind}`}
            title={multi ? group.map((p) => IMPORTANCE_INFO[p.kind].short + (p.space === 'raw_input' ? ' (raw)' : ' (model input)')).join(' vs ') : profileLabel(first)}
            fileName={`${stem}.${first.kind}`}
            onCsv={() => group.forEach((p) => downloadText(`${stem}.${p.kind}.${p.space}${p.component !== null ? `.c${p.component + 1}` : ''}.csv`, profileCsv(p)))}
            controls={multi ? (
              <select aria-label="Profile scaling" value={scaling} onChange={(e) => setScaling(e.target.value as 'max_abs' | 'none')} className="h-8 rounded-md border border-border bg-background px-2 text-xs" title="Profiles in different spaces have different units: scale each to its largest magnitude to compare their shapes">
                <option value="max_abs">Scaled to max |value|</option>
                <option value="none">Native units</option>
              </select>
            ) : null}
            help={
              <div className="space-y-2">
                {[...new Map(group.map((p) => [p.kind, p])).values()].map((p) => <p key={p.kind}><span className="font-semibold text-foreground">{IMPORTANCE_INFO[p.kind].label}.</span> {IMPORTANCE_INFO[p.kind].help}</p>)}
                {group.map((p) => <p key={`${p.kind}-${p.space}`}>{spaceExplanation(p.space, p)}</p>)}
                {group.some((p) => p.rows) ? <p>Statistics use {group.find((p) => p.rows)?.rows?.count} rows ({group.find((p) => p.rows)?.rows?.source.replaceAll('_', ' ')}).</p> : null}
              </div>
            }
          >
            <ImportanceComparisonChart
              axis={first.axis.values}
              axisLabel={axisLabel(first)}
              axisUnit={first.axis.unit ?? undefined}
              series={group.map((p) => ({
                id: `${p.kind}-${p.space}-${p.component ?? ''}`,
                label: profileLabel(p),
                values: p.values,
                signed: p.signed,
                dashed: p.exactness !== 'exact' || p.space === 'model_input',
              }))}
              scaling={multi ? scaling : 'none'}
              spectrum={first.axis.kind === 'model_feature' ? undefined : spectrum}
              bands={first.axis.kind === 'model_feature' ? undefined : bands}
              title={multi ? 'Model-input and raw-spectrum profiles' : profileLabel(first)}
            />
            {first.kind === 'vip' ? <p className="mt-2 text-xs text-muted-foreground">VIP above 1 is the usual “important” threshold; the mean squared VIP over all variables is 1 by construction.</p> : null}
          </ChartFrame>
        )
      })}

      {response.refusals.length > 0 ? (
        <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="explain-importance-refusals">
          <p className="mb-1 font-medium text-foreground">Not available for this model</p>
          <ul className="list-disc space-y-1 pl-5">
            {response.refusals.map((r, i) => <li key={i}><span className="font-medium">{IMPORTANCE_INFO[r.kind as ImportanceKind]?.label ?? r.kind} ({r.space === 'raw_input' ? 'raw spectrum' : 'model input'}):</span> {r.reason}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
