// Presentation helpers for the Explain step beyond one explanation: model-intrinsic
// profile labels and explanations, the plain-language summary, comparison inputs and
// CSV exports. They only select, label and reshape numbers computed by Methods
// (display bookkeeping: shares of a total, top-K membership, group expansion).
import type { SpectralBand } from 'nirs4all-ui/viz'

import type {
  CompareProfileInput,
  CompareProfilesResponse,
  ExplanationGroup,
  ExplanationV1,
  ImportanceKind,
  ImportanceProfileV1,
  ImportanceResponse,
  ImportanceSpace,
} from '@/engine/types'
import { METHOD_INFO } from './explainView'

export const IMPORTANCE_INFO: Record<ImportanceKind, { label: string; short: string; help: string; rule: NonNullable<CompareProfileInput['rule']> }> = {
  regression_coefficients: {
    label: 'Regression coefficients (β)',
    short: 'β',
    help: 'The weight the model gives each variable: the prediction is Σ β·x + b. The sign says whether raising the variable raises the prediction; magnitudes depend on the scale of each variable.',
    rule: 'sum_abs',
  },
  standardized_coefficients: {
    label: 'Standardized coefficients (β · sd)',
    short: 'β·sd',
    help: 'Coefficients multiplied by the standard deviation of each variable over the rows used: the typical change of the prediction caused by each variable, comparable across variables with different scales.',
    rule: 'sum_abs',
  },
  vip: {
    label: 'VIP (variable importance in projection)',
    short: 'VIP',
    help: 'How much each variable contributes to the latent components, weighted by the share of Y variance each component explains. Unsigned; a common rule of thumb reads VIP > 1 as important.',
    rule: 'sum',
  },
  selectivity_ratio: {
    label: 'Selectivity ratio',
    short: 'SR',
    help: 'Explained over residual variance of each variable on the target-predictive component. High values mark variables that mostly carry target-related signal; less sensitive to interferents than VIP.',
    rule: 'sum',
  },
  x_weights: {
    label: 'Component weights (w)',
    short: 'w',
    help: 'The direction in variable space that defines one latent component\'s scores. A diagnostic of what a component looks at, not an importance by itself.',
    rule: 'sum_abs',
  },
  x_loadings: {
    label: 'Component loadings (p)',
    short: 'p',
    help: 'How each variable is reconstructed from one latent component. Shows which spectral shape a component captures.',
    rule: 'sum_abs',
  },
  mean_local_gradient: {
    label: 'Mean local gradient (raw spectrum)',
    short: '∂f/∂x',
    help: 'Mean over the explained spectra of the gradient of the complete pipeline with respect to each raw wavelength. For an affine pipeline it equals the raw-spectrum coefficients exactly; with SNV or MSC it is a local, first-order average.',
    rule: 'sum_abs',
  },
}

/** Why a profile lives in its space, in the user's terms. */
export function spaceExplanation(space: ImportanceSpace, profile: Pick<ImportanceProfileV1, 'preprocessing' | 'exactness' | 'axis'>): string {
  const steps = profile.preprocessing.steps.length > 0 ? profile.preprocessing.steps.map(stepLabel).join(' → ') : 'no preprocessing'
  if (space === 'raw_input') {
    return profile.exactness === 'exact'
      ? `Raw-spectrum space: the affine preprocessing (${steps}) is folded into the coefficients, so the prediction is exactly β_raw · x + b on the raw spectrum. Directly comparable with SHAP, which also perturbs the raw spectrum.`
      : profile.preprocessing.affine
        ? `Raw-spectrum space, local estimate: the pipeline (${steps}) is affine, so the mean gradient equals its exact raw-spectrum coefficients up to finite-difference rounding. Comparable with SHAP.`
        : `Raw-spectrum space, local: the pipeline (${steps}) is not affine, so it is linearized around each explained spectrum and the gradients are averaged. Comparable with SHAP, but valid near the explained spectra only.`
  }
  return profile.axis.kind === 'model_feature'
    ? `Model-input space: what the model sees after ${steps}. The preprocessing changes the number or position of the variables, so the profile is drawn on model feature indices, not wavelengths.`
    : `Model-input space: what the model sees after ${steps}. Each preprocessed variable stays at its wavelength, so the profile is drawn on the raw axis, but it weighs the preprocessed signal (e.g. a derivative or an SNV-scaled value), not absorbance.`
}

/** A compact label of a DSL step token (`n4m:preprocessing.snv` → `snv`). */
export function stepLabel(type: string): string {
  const tail = type.split(/[:.]/).at(-1) ?? type
  return tail.replaceAll('_', ' ')
}

export function profileLabel(p: ImportanceProfileV1): string {
  const base = IMPORTANCE_INFO[p.kind].label
  const comp = p.component !== null ? ` · component ${p.component + 1}` : ''
  const space = p.space === 'raw_input' ? (p.exactness === 'exact' ? ' · raw spectrum (exact)' : ' · raw spectrum (local)') : ' · model input'
  return `${base}${comp}${space}`
}

export function profileKey(p: ImportanceProfileV1): string {
  return `${p.kind}:${p.space}:${p.component ?? '-'}`
}

/** The profiles of a response worth listing first (components after the summaries). */
export function primaryProfiles(r: ImportanceResponse): ImportanceProfileV1[] {
  return r.profiles.filter((p) => p.component === null)
}

const overlaps = (g: { axis_start: number; axis_end: number }, b: SpectralBand): boolean => {
  const lo = Math.min(g.axis_start, g.axis_end)
  const hi = Math.max(g.axis_start, g.axis_end)
  return Math.min(b.start, b.end) <= hi && Math.max(b.start, b.end) >= lo
}

export interface SummaryItem {
  group: ExplanationGroup
  share: number
  sign: number
  bands: string[]
}

/** The top groups of an explanation with their share of the total mean |attribution|. */
export function topGroups(env: ExplanationV1, bands: readonly SpectralBand[], n = 3): SummaryItem[] {
  const total = env.summary.mean_abs.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
  if (!(total > 0)) return []
  return env.groups
    .map((group, gi) => ({ group, gi }))
    .sort((a, b) => env.summary.mean_abs[b.gi] - env.summary.mean_abs[a.gi])
    .filter(({ gi }) => env.summary.mean_abs[gi] > 0)
    .slice(0, n)
    .map(({ group, gi }) => ({
      group,
      share: env.summary.mean_abs[gi] / total,
      sign: Math.sign(env.summary.mean_signed[gi]),
      bands: env.axis.kind === 'feature_index' ? [] : bands.filter((b) => overlaps(group, b)).map((b) => b.label),
    }))
}

const pct = (v: number): string => `${Math.round(100 * v)}%`

/** One plain-language paragraph describing an explanation. */
export function summarySentence(env: ExplanationV1, bands: readonly SpectralBand[]): string {
  const top = topGroups(env, bands)
  if (top.length === 0) return 'No group carries any attribution: the prediction does not change when the spectrum is perturbed this way.'
  const unit = env.axis.unit ? ` ${env.axis.unit}` : ''
  const parts = top.map((t) => {
    const where = env.axis.kind === 'feature_index' ? `features ${t.group.label}` : `${t.group.label}${unit}`
    const dir = t.sign > 0 ? 'mostly raises' : t.sign < 0 ? 'mostly lowers' : 'moves'
    const band = t.bands.length > 0 ? `, candidate band ${t.bands.slice(0, 2).join(' / ')}` : ''
    return `${where} (${pct(t.share)} of the total, ${dir} the prediction${band})`
  })
  const covered = top.reduce((s, t) => s + t.share, 0)
  const method = METHOD_INFO[env.kind as keyof typeof METHOD_INFO]?.label ?? env.kind
  return `${method}: the model relies most on ${parts.join('; ')}. Together they carry ${pct(covered)} of the mean absolute attribution over ${env.rows.count} row${env.rows.count === 1 ? '' : 's'}. Bands are literature candidates matched by position, not proof of a chemical cause.`
}

/** One value per feature: each feature carries its group's value (NaN outside groups). */
export function expandGroups(groups: readonly ExplanationGroup[], values: readonly number[], nFeatures: number): number[] {
  const out = new Array<number>(nFeatures).fill(Number.NaN)
  groups.forEach((g, gi) => {
    for (let j = g.feature_start; j < g.feature_end && j < nFeatures; j++) out[j] = values[gi]
  })
  return out
}

/** Groups ranked by how many profiles place them in their top K (by |value|, lowest index on ties). */
export function consensus(cmp: CompareProfilesResponse): { group: ExplanationGroup; count: number; ranks: number[] }[] {
  const ranks = cmp.aggregated.map((vals) => {
    const order = vals.map((v, g) => g).sort((a, b) => Math.abs(vals[b]) - Math.abs(vals[a]) || a - b)
    const rank = new Array<number>(vals.length)
    order.forEach((g, r) => {
      rank[g] = r + 1
    })
    return rank
  })
  return cmp.groups
    .map((group, g) => ({ group, ranks: ranks.map((r) => r[g]), count: ranks.filter((r) => r[g] <= cmp.topK).length }))
    .sort((a, b) => b.count - a.count || Math.min(...a.ranks) - Math.min(...b.ranks))
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
export const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

export function explanationCsv(env: ExplanationV1): string {
  const se = env.summary.mean_signed_std_error
  return toCsv([
    ['group', 'feature_start', 'feature_end', 'axis_start', 'axis_end', 'mean_abs_attribution', 'mean_signed_attribution', 'mean_signed_std_error'],
    ...env.groups.map((g, gi) => [g.label, g.feature_start, g.feature_end, g.axis_start, g.axis_end, env.summary.mean_abs[gi], env.summary.mean_signed[gi], se?.[gi] ?? null]),
  ])
}

export function profileCsv(p: ImportanceProfileV1): string {
  return toCsv([[p.axis.kind === 'model_feature' ? 'model_feature' : `axis${p.axis.unit ? `_${p.axis.unit}` : ''}`, p.kind], ...p.values.map((v, j) => [p.axis.values[j], v])])
}

export function comparisonCsv(cmp: CompareProfilesResponse, labels: readonly string[]): string {
  return toCsv([
    ['group', 'axis_start', 'axis_end', ...labels],
    ...cmp.groups.map((g, gi) => [g.label, g.axis_start, g.axis_end, ...cmp.aggregated.map((row) => row[gi])]),
  ])
}
