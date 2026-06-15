// Explore-only spectral preview: apply the shipped JS preprocessors to the
// uploaded spectra and shape them for recharts (subsampled lines + a min–max
// range band + the mean), with Original / Processed / Both / Difference modes.
// Stateful ops (MSC) are fit on the TRAIN rows only, so the preview is honest
// about leakage. This is viewing only — the real run still goes through libn4m.
import { type Mat, selectRows } from '@/engine/algo/linalg'
import { makeTransformer } from '@/engine/algo/preprocessing'
import type { MaterializedDataset, Partition } from '@/engine/types'

export interface PreviewOp {
  id: string
  label: string
  /** catalog `type` token for makeTransformer; '' = raw (no transform) */
  type: string
  params: Record<string, unknown>
}

/** The core preprocessors the offline JS engine implements (makeTransformer). */
export const PREVIEW_OPS: PreviewOp[] = [
  { id: 'none', label: 'Raw', type: '', params: {} },
  { id: 'snv', label: 'SNV', type: 'StandardNormalVariate', params: {} },
  { id: 'msc', label: 'MSC', type: 'MSC', params: {} },
  { id: 'sg', label: 'SG smooth', type: 'SavitzkyGolay', params: { window: 11, polyorder: 2, deriv: 0 } },
  { id: 'sg1', label: 'SG 1st deriv', type: 'SavitzkyGolay', params: { window: 11, polyorder: 2, deriv: 1 } },
  { id: 'sg2', label: 'SG 2nd deriv', type: 'SavitzkyGolay', params: { window: 15, polyorder: 2, deriv: 2 } },
  { id: 'd1', label: '1st derivative', type: 'Derivative', params: { order: 1 } },
  { id: 'detrend', label: 'Detrend', type: 'Detrend', params: { degree: 1 } },
  { id: 'gauss', label: 'Gaussian', type: 'GaussianFilter', params: { sigma: 2 } },
  { id: 'norm', label: 'Normalize (L2)', type: 'Normalize', params: { norm: 'l2' } },
]

/** Apply a preview op to the full X, fitting stateful ops on the train rows only
 *  (no leakage). Returns a processed row-major buffer, or null for raw / errors. */
export function applyPreview(ds: MaterializedDataset, op: PreviewOp): Float64Array | null {
  if (!op.type) return null
  try {
    const full: Mat = { data: ds.X, rows: ds.nSamples, cols: ds.nFeatures }
    // Fit stateful ops (MSC) on the TRAIN rows only — exclude both test AND
    // predict rows so the preview is leakage-honest; fall back to all rows if
    // the dataset has no explicit train partition.
    const trainIdx: number[] = []
    for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] === 'train') trainIdx.push(i)
    const train = trainIdx.length > 0 ? selectRows(full, trainIdx) : full
    return makeTransformer(op.type, op.params, train).apply(full).data
  } catch {
    return null
  }
}

export type PartitionFilter = 'all' | 'train' | 'test'
export type ViewMode = 'original' | 'processed' | 'both' | 'difference'

export const PARTITION_COLOR: Record<Partition, string> = {
  train: 'var(--chart-1)',
  test: 'var(--chart-5)',
  predict: 'var(--chart-3)',
}
export const CLASS_PALETTE = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  '#9333ea', '#e11d48', '#0891b2', '#65a30d', '#db2777',
]

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
/** Continuous teal→green→amber ramp (hue 174°→32°) for a value t in [0,1]. */
export function continuousColor(t: number): string {
  const h = 174 - 142 * clamp01(t)
  return `hsl(${h.toFixed(0)} 68% 42%)`
}

export interface SpectraLine { key: string; color: string }
export interface SpectraMean { key: string; color: string; dash?: boolean; label: string }
export interface SpectraChartModel {
  rows: Record<string, number | number[] | null>[]
  lines: SpectraLine[]
  /** dataKey of the [min,max] range band, if drawn */
  bandKey?: string
  means: SpectraMean[]
  empty: boolean
}

/** Build the recharts model for the spectra view under a partition filter and
 *  preview/view mode. `processed` may be null when the op is raw. */
export function buildSpectraChart(
  ds: MaterializedDataset,
  axis: number[],
  processed: Float64Array | null,
  viewMode: ViewMode,
  filter: PartitionFilter,
  maxLines = 50,
): SpectraChartModel {
  const p = ds.nFeatures
  const idx: number[] = []
  for (let i = 0; i < ds.nSamples; i++) {
    if (filter === 'all' || ds.partitions[i] === filter) idx.push(i)
  }
  if (idx.length === 0 || p === 0) return { rows: [], lines: [], means: [], empty: true }

  // active signal: what the band + lines are drawn from
  const orig = ds.X
  const hasProc = !!processed
  let active = orig
  if (hasProc && (viewMode === 'processed' || viewMode === 'both')) active = processed as Float64Array
  else if (hasProc && viewMode === 'difference') {
    active = new Float64Array(orig.length)
    for (let i = 0; i < active.length; i++) active[i] = (processed as Float64Array)[i] - orig[i]
  }

  // per-wavelength min / max / mean over the filtered rows (active + original-for-both),
  // skipping non-finite cells so missing values never poison the band/mean.
  const mn = new Float64Array(p).fill(Infinity)
  const mx = new Float64Array(p).fill(-Infinity)
  const mean = new Float64Array(p)
  const cnt = new Int32Array(p)
  const omean = new Float64Array(p)
  const ocnt = new Int32Array(p)
  const both = viewMode === 'both' && hasProc
  for (const r of idx) {
    const base = r * p
    for (let c = 0; c < p; c++) {
      const v = active[base + c]
      if (Number.isFinite(v)) {
        if (v < mn[c]) mn[c] = v
        if (v > mx[c]) mx[c] = v
        mean[c] += v
        cnt[c]++
      }
      if (both) {
        const ov = orig[base + c]
        if (Number.isFinite(ov)) { omean[c] += ov; ocnt[c]++ }
      }
    }
  }
  for (let c = 0; c < p; c++) {
    mean[c] = cnt[c] > 0 ? mean[c] / cnt[c] : NaN
    if (both) omean[c] = ocnt[c] > 0 ? omean[c] / ocnt[c] : NaN
  }

  // subsample individual lines, colored by partition
  const step = Math.max(1, Math.ceil(idx.length / maxLines))
  const drawn: { key: string; color: string; row: number }[] = []
  for (let i = 0; i < idx.length; i += step) {
    const r = idx[i]
    drawn.push({ key: `l${drawn.length}`, color: PARTITION_COLOR[ds.partitions[r]] ?? PARTITION_COLOR.train, row: r })
  }

  const rows: Record<string, number | number[] | null>[] = []
  for (let c = 0; c < p; c++) {
    const row: Record<string, number | number[] | null> = {
      x: axis[c] ?? c,
      // null where no finite value exists → recharts renders a gap, not a spike
      band: cnt[c] > 0 ? [mn[c], mx[c]] : null,
      mean: cnt[c] > 0 ? mean[c] : null,
    }
    if (both) row.omean = ocnt[c] > 0 ? omean[c] : null
    for (const d of drawn) {
      const v = active[d.row * p + c]
      row[d.key] = Number.isFinite(v) ? v : null
    }
    rows.push(row)
  }

  const means: SpectraMean[] = both
    ? [
        { key: 'omean', color: 'var(--muted-foreground)', dash: true, label: 'original mean' },
        { key: 'mean', color: 'var(--chart-1)', label: 'processed mean' },
      ]
    : [{ key: 'mean', color: 'var(--chart-1)', label: 'mean' }]

  return {
    rows,
    lines: drawn.map((d) => ({ key: d.key, color: d.color })),
    bandKey: 'band',
    means,
    empty: false,
  }
}
