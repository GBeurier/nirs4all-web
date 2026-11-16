// Presentation adapters for the Explain step: they reshape a `nirs4all.explanation.v1`
// envelope (computed by the Methods explain session in the engine worker) into the
// props of the nirs4all-ui charts. Group summaries come from the envelope (`summary`,
// produced by Methods summarizeAttributions); the only arithmetic here is display
// bookkeeping (the waterfall remainder, the reference mean spectrum and the group mean
// raw value that colours beeswarm points).
import { axisKindOf, axisRangesToFeatureRanges, EXACT_SHAP_MAX_GROUPS } from '@/engine/explain'
import { datasetFeatureIdentity } from '@/engine/feature-identity'
import type {
  ExplainAxis,
  ExplainAxisRange,
  ExplainBaseline,
  ExplainMethod,
  ExplainRowSource,
  ExplainRows,
  ExplanationV1,
  FittedPipeline,
  MaterializedDataset,
} from '@/engine/types'
import type { PredictedRows } from '@/components/contracts'

export type MethodStatus = 'implemented' | 'experimental'

export const METHOD_INFO: Record<ExplainMethod, { label: string; status: MethodStatus; additive: boolean; help: string }> = {
  permutation_shap: {
    label: 'Permutation SHAP',
    status: 'implemented',
    additive: true,
    help: 'Antithetic permutation sampling of group Shapley values. Additive by construction; reports a Monte-Carlo standard error. Recommended default.',
  },
  exact_shap: {
    label: 'Exact SHAP',
    status: 'implemented',
    additive: true,
    help: `Enumerates every coalition of groups (2^G evaluations). Exact and additive, limited to ${EXACT_SHAP_MAX_GROUPS} groups.`,
  },
  kernel_shap: {
    label: 'Kernel SHAP',
    status: 'experimental',
    additive: true,
    help: 'Weighted least squares over sampled coalitions, with efficiency enforced. Limited validation.',
  },
  lime: {
    label: 'LIME',
    status: 'experimental',
    additive: false,
    help: 'Local ridge surrogate over random group masks. Not additive: its weights do not sum to the prediction. Limited validation.',
  },
  occlusion: {
    label: 'Occlusion',
    status: 'implemented',
    additive: false,
    help: 'Prediction change when one group at a time is replaced by the baseline. Not additive; interactions are ignored.',
  },
}

export const BASELINE_INFO: Record<ExplainBaseline, { label: string; help: string }> = {
  background: {
    label: 'Background (interventional)',
    help: 'Absent groups take the values of each background row; the expected value is the mean prediction over the background.',
  },
  interpolate: {
    label: 'Interpolate (spectral bridge)',
    help: 'Absent bands are replaced by a straight line between the neighbouring present wavelengths of the same spectrum. Recommended for spectra: perturbed spectra stay continuous and physically plausible.',
  },
  mean: {
    label: 'Mean spectrum',
    help: 'Absent groups take the column mean of the background rows (a single reference spectrum).',
  },
}

export const ROW_SOURCE_LABEL: Record<ExplainRowSource, string> = {
  predicted_rows: 'Predicted file rows',
  dataset_test_partition: 'Dataset test partition',
  dataset_train_partition: 'Dataset train partition',
  dataset_rows: 'Dataset test + train partitions',
}

/** Explained-row index vs source index: both shown, never interchanged. */
export function rowLabel(row: number, sourceIndex: number): string {
  return `Row ${row} (sample #${sourceIndex})`
}

/**
 * The recorded spectral axis of the model input, or null when none is recorded.
 * The model's own fitted column identity wins; the dataset axis is used only for the
 * dataset the selected run was fitted on, with the same width and a real (non-index) unit.
 */
export function explainAxisFor(model: FittedPipeline, dataset?: MaterializedDataset | null): ExplainAxis | null {
  const f = model.features
  if (f?.axis && f.axis.length === model.nFeatures && f.unit) return { values: [...f.axis], unit: f.unit }
  if (dataset && dataset.nFeatures === model.nFeatures && dataset.axis.length === model.nFeatures && dataset.axisUnit && dataset.axisUnit !== 'index') {
    return { values: [...dataset.axis], unit: dataset.axisUnit }
  }
  return null
}

/** Output names of a multi-target model (Archive V2 replay records them), else []. */
export function modelTargetNames(model: FittedPipeline): string[] {
  const names = (model.state as { targetNames?: unknown } | null)?.targetNames
  return Array.isArray(names) && names.every((n) => typeof n === 'string') ? names : []
}

export interface RowSourceOption {
  source: ExplainRowSource
  label: string
  rows: ExplainRows
  featureNames?: string[]
}

function partitionRows(ds: MaterializedDataset, partition: 'train' | 'test'): number[] {
  return ds.partitions.flatMap((p, i) => (p === partition ? [i] : []))
}

function datasetRows(ds: MaterializedDataset, indices: number[], source: ExplainRowSource): ExplainRows {
  const p = ds.nFeatures
  const X = new Float64Array(indices.length * p)
  indices.forEach((i, r) => X.set(ds.X.subarray(i * p, (i + 1) * p), r * p))
  return { X, nRows: indices.length, sourceIndices: indices, source }
}

function datasetNames(ds: MaterializedDataset): string[] | undefined {
  try {
    return datasetFeatureIdentity(ds)?.names
  } catch {
    return undefined
  }
}

/**
 * Row sources the panel can explain: the Predict file scored by this model, then the
 * partitions of the dataset the selected run was fitted on (indices are dataset rows).
 */
export function rowSourceOptions(model: FittedPipeline, predicted?: PredictedRows | null, dataset?: MaterializedDataset | null): RowSourceOption[] {
  const out: RowSourceOption[] = []
  if (predicted && predicted.model === model && predicted.nFeatures === model.nFeatures && predicted.nSamples > 0) {
    out.push({
      source: 'predicted_rows',
      label: `${ROW_SOURCE_LABEL.predicted_rows} (${predicted.fileName}, ${predicted.nSamples})`,
      rows: { X: predicted.X, nRows: predicted.nSamples, sourceIndices: Array.from({ length: predicted.nSamples }, (_, i) => i), source: 'predicted_rows' },
      featureNames: predicted.featureNames,
    })
  }
  if (dataset && dataset.nFeatures === model.nFeatures) {
    const names = datasetNames(dataset)
    const parts: number[][] = []
    for (const part of ['test', 'train'] as const) {
      const idx = partitionRows(dataset, part)
      if (idx.length === 0) continue
      parts.push(idx)
      const source: ExplainRowSource = part === 'test' ? 'dataset_test_partition' : 'dataset_train_partition'
      out.push({ source, label: `${ROW_SOURCE_LABEL[source]} (${idx.length})`, rows: datasetRows(dataset, idx, source), featureNames: names })
    }
    if (parts.length === 2) {
      // Test then train rows, each keeping its dataset row index as the source index.
      const idx = [...parts[0], ...parts[1]]
      out.push({ source: 'dataset_rows', label: `${ROW_SOURCE_LABEL.dataset_rows} (${idx.length})`, rows: datasetRows(dataset, idx, 'dataset_rows'), featureNames: names })
    }
  }
  return out
}

/** Background: the training partition of the run's dataset when present, else the explained source's rows. */
export function backgroundFor(options: RowSourceOption[], explained: RowSourceOption): RowSourceOption {
  return options.find((o) => o.source === 'dataset_train_partition') ?? explained
}

/** Reference bands (axis unit) → axis ranges to group by. */
export function bandRanges(bands: readonly { start: number; end: number; label: string }[]): ExplainAxisRange[] {
  return bands.map((b) => ({ label: b.label, axisStart: b.start, axisEnd: b.end }))
}

/** Number of groups a grouping yields (for the exact-SHAP limit), or null when unknown. */
export function groupCount(kind: 'fixed_width' | 'bands' | 'per_feature', nFeatures: number, width: number, axis: ExplainAxis | null, ranges: ExplainAxisRange[]): number | null {
  if (kind === 'per_feature') return nFeatures
  if (kind === 'fixed_width') return width >= 1 ? Math.ceil(nFeatures / width) : null
  if (!axis) return null
  const kept = axisRangesToFeatureRanges(axis.values, ranges)
  if (kept.length === 0) return null
  let uncovered = 0
  let cursor = 0
  for (const r of kept) {
    if (r.start > cursor) uncovered++
    cursor = r.end
  }
  if (cursor < nFeatures) uncovered++
  return kept.length + uncovered
}

/**
 * Model evaluations an explanation will request (the Methods session plan, docs/EXPLAIN.md):
 * E0 + R (1 + B C), with B background rows for the "background" baseline and 1 otherwise,
 * E0 = B shared empty-coalition rows for "background"/"mean", and C coalitions per row.
 * A planning estimate for the UI only; the session reports the exact plan while running.
 */
export function estimateEvaluations(p: { method: ExplainMethod; baseline: ExplainBaseline; nRows: number; nBackground: number; nGroups: number; nPermutations: number }): number {
  const interpolate = p.baseline === 'interpolate' ? 1 : 0
  const B = p.baseline === 'background' ? Math.max(1, p.nBackground) : 1
  const E0 = interpolate ? 0 : B
  const G = Math.max(1, p.nGroups)
  const all = G <= 52 ? 2 ** G - 2 : Number.POSITIVE_INFINITY
  const C = p.method === 'exact_shap' ? all + interpolate
    : p.method === 'permutation_shap' ? 2 * p.nPermutations * (G - 1) + interpolate
      : p.method === 'kernel_shap' ? Math.min(all, 2 * G + 2048) + interpolate
        : p.method === 'lime' ? 999
          : G + interpolate
  return E0 + p.nRows * (1 + B * C)
}
export const unitKnown = (axis: ExplainAxis | null | undefined): boolean => axisKindOf(axis?.unit).kind !== 'feature_index'

export function axisTitle(env: ExplanationV1): string {
  if (env.axis.kind === 'wavelength') return `Wavelength (${env.axis.unit})`
  if (env.axis.kind === 'wavenumber') return `Wavenumber (${env.axis.unit})`
  return 'Feature index'
}

const att = (env: ExplanationV1, row: number, g: number, out: number): number => env.attributions[row][g][out]

/** Spectral importance view at feature resolution: each feature carries its group's value. */
export function spectralView(env: ExplanationV1, explainedX: Float64Array) {
  const p = env.axis.values.length
  const importance = new Array<number>(p).fill(Number.NaN)
  env.groups.forEach((g, gi) => {
    for (let j = g.feature_start; j < g.feature_end; j++) importance[j] = env.summary.mean_abs[gi]
  })
  const n = env.rows.count
  const spectrum = Array.from({ length: p }, (_, j) => {
    let s = 0
    for (let r = 0; r < n; r++) s += explainedX[r * p + j]
    return n > 0 ? s / n : Number.NaN
  })
  const regions = env.groups.map((g, gi) => ({ start: g.axis_start, end: g.axis_end, value: env.summary.mean_signed[gi], label: g.label }))
  return { axis: env.axis.values, importance, spectrum, regions }
}

export interface WaterfallView {
  baseValue: number
  predicted: number
  contributions: { label: string; value: number }[]
  /** |base + Σ all group attributions − prediction| for this row */
  additivityError: number
}

/**
 * Additive waterfall of one explained row: the top-N groups by |attribution| in axis
 * order plus one remainder carrying every hidden group, so the walk ends at the
 * prediction. Groups are disjoint, so nothing is counted twice.
 */
export function waterfallView(env: ExplanationV1, row: number, topN = 10): WaterfallView {
  const out = env.output.index
  const values = env.groups.map((_, g) => att(env, row, g, out))
  const order = values.map((v, g) => g).sort((a, b) => Math.abs(values[b]) - Math.abs(values[a]))
  const shown = new Set(order.slice(0, topN))
  const contributions = env.groups.flatMap((g, gi) => (shown.has(gi) ? [{ label: g.label, value: values[gi] }] : []))
  const hidden = order.slice(topN)
  if (hidden.length > 0) {
    contributions.push({ label: `Other ${hidden.length} group${hidden.length === 1 ? '' : 's'}`, value: hidden.reduce((s, g) => s + values[g], 0) })
  }
  const baseValue = env.expected_value[row][out]
  const predicted = env.prediction[row][out]
  const total = values.reduce((s, v) => s + v, 0)
  return { baseValue, predicted, contributions, additivityError: Math.abs(baseValue + total - predicted) }
}

/** Signed attributions of one row (non-additive methods are shown as bars, never as a waterfall). */
export function rowBars(env: ExplanationV1, row: number): { label: string; value: number }[] {
  return env.groups.map((g, gi) => ({ label: g.label, value: att(env, row, gi, env.output.index) }))
}

/** Mean |attribution| per group (from the Methods summary). */
export function importanceItems(env: ExplanationV1): { label: string; value: number }[] {
  return env.groups.map((g, gi) => ({ label: g.label, value: env.summary.mean_abs[gi] }))
}

/** Beeswarm rows for the `topK` groups by mean |attribution|; sampleId is the explained-row index. */
export function beeswarmView(env: ExplanationV1, explainedX: Float64Array, topK = 12) {
  const p = env.axis.values.length
  const out = env.output.index
  const top = env.groups.map((_, gi) => gi).sort((a, b) => env.summary.mean_abs[b] - env.summary.mean_abs[a]).slice(0, topK)
  return top.map((gi) => {
    const g = env.groups[gi]
    return {
      label: g.label,
      points: Array.from({ length: env.rows.count }, (_, r) => {
        let s = 0
        for (let j = g.feature_start; j < g.feature_end; j++) s += explainedX[r * p + j]
        return { shap: att(env, r, gi, out), featureValue: s / (g.feature_end - g.feature_start), sampleId: r }
      }),
    }
  })
}

/** Largest Monte-Carlo standard error of one row's group attributions, or null. */
export function rowStdError(env: ExplanationV1, row: number): number | null {
  if (!env.std_error) return null
  const out = env.output.index
  return env.std_error[row].reduce((m, g) => Math.max(m, g[out]), 0)
}

export function envelopeFileName(sourceName: string, env: ExplanationV1): string {
  const slug = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'
  return `${slug}.${env.kind}.explanation.v1.json`
}
