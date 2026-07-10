// Small presentational helpers local to the dataset component group:
// reading uploaded files and binning the target for the histogram view.
import type { MaterializedDataset, Partition } from '@/engine/types'
import type { RawFile } from '@/data/dataset'

/** Read a list of browser File objects into RawFile[] ({ name, text }). */
export async function readRawFiles(files: File[]): Promise<RawFile[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })))
}

/** Chart palette mapped to the brand chart CSS variables. */
export const CHART = {
  teal: 'var(--chart-1)',
  cyan: 'var(--chart-2)',
  indigo: 'var(--chart-3)',
  green: 'var(--chart-4)',
  amber: 'var(--chart-5)',
} as const

export interface SpectraSeries {
  /** one point per wavelength: { x, train rows…, test rows…, mean } */
  rows: Record<string, number>[]
  trainKeys: string[]
  testKeys: string[]
}

/**
 * Shape subsampled spectra into a recharts-friendly long table keyed by
 * wavelength, with a separate dataKey per drawn line plus a bold mean.
 */
export function buildSpectraSeries(
  spectra: { values: number[]; partition: Partition }[],
  axis: number[],
  maxLines = 80,
): SpectraSeries {
  const step = Math.max(1, Math.ceil(spectra.length / maxLines))
  const drawn: { values: number[]; partition: Partition; key: string }[] = []
  let t = 0
  let v = 0
  for (let i = 0; i < spectra.length; i += step) {
    const s = spectra[i]
    const key = s.partition === 'test' ? `te${v++}` : `tr${t++}`
    drawn.push({ values: s.values, partition: s.partition, key })
  }
  const trainKeys = drawn.filter((d) => d.partition !== 'test').map((d) => d.key)
  const testKeys = drawn.filter((d) => d.partition === 'test').map((d) => d.key)

  const nFeatures = axis.length
  // Mean spectrum over *all* spectra (not just drawn) for a stable overlay.
  const mean = new Array<number>(nFeatures).fill(0)
  for (const s of spectra) for (let j = 0; j < nFeatures; j++) mean[j] += s.values[j] ?? 0
  for (let j = 0; j < nFeatures; j++) mean[j] /= Math.max(1, spectra.length)

  const rows: Record<string, number>[] = []
  for (let j = 0; j < nFeatures; j++) {
    const row: Record<string, number> = { x: axis[j] ?? j, mean: mean[j] }
    for (const d of drawn) row[d.key] = d.values[j] ?? 0
    rows.push(row)
  }
  return { rows, trainKeys, testKeys }
}

export interface HistBin {
  bin: string
  count: number
  center: number
}

/** Equal-width histogram of finite values into ~nBins buckets. */
export function histogram(values: number[], nBins = 24): HistBin[] {
  const vals = values.filter((v) => Number.isFinite(v))
  if (vals.length === 0) return []
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [{ bin: min.toFixed(2), count: vals.length, center: min }]
  const width = (max - min) / nBins
  const bins: HistBin[] = Array.from({ length: nBins }, (_, i) => {
    const lo = min + i * width
    return { bin: lo.toFixed(2), count: 0, center: lo + width / 2 }
  })
  for (const v of vals) {
    let idx = Math.floor((v - min) / width)
    if (idx >= nBins) idx = nBins - 1
    if (idx < 0) idx = 0
    bins[idx].count++
  }
  return bins
}

export function hasTestPartition(ds: MaterializedDataset): boolean {
  return ds.partitions.some((p) => p === 'test')
}
