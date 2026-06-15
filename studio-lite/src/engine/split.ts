// Split operators — apply a single train/test split BEFORE cross-validation.
// The split (Kennard-Stone / SPXY / KMeans / KBinsStratified) is computed in
// libn4m (computeSplit → n4m_wasm_split → n4m_split_*) and OVERRIDES the
// dataset's partition: its test rows are held out of CV, the train rows feed the
// CV fold builder. Predict-partition rows (if any) are left untouched. The
// numerics never live here; this only marshals X/Y and rewrites partitions.
import { loadMethodsWasm } from './nirs4all-lite'
import type { MaterializedDataset, PipelineStep, Partition } from './types'

export type SplitKind = 'KennardStone' | 'SPXY' | 'KMeans' | 'KBinsStratified' | 'DataTwinning' | 'SystematicCircular'

/** The catalog `type` tokens that are split operators (engine dispatch + UI). */
export const SPLIT_KINDS: ReadonlySet<string> = new Set(['KennardStone', 'SPXY', 'KMeans', 'KBinsStratified', 'DataTwinning', 'SystematicCircular'])

/** Split kinds that split on Y (the target) rather than X. */
const Y_SPLIT_KINDS: ReadonlySet<string> = new Set(['SPXY', 'KBinsStratified', 'SystematicCircular'])

const num = (v: unknown, d: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/**
 * Compute the split for `step` over the dataset's non-predict rows and return a
 * NEW dataset with `partitions` overridden to train/test from the libn4m mask.
 * Rows already marked `predict` keep that role and are excluded from the split.
 * For classification, SPXY/KBins use the encoded class index as Y (one column).
 */
export async function applySplit(ds: MaterializedDataset, step: PipelineStep): Promise<MaterializedDataset> {
  const kind = step.type as SplitKind
  if (!SPLIT_KINDS.has(kind)) throw new Error(`Unknown split operator: ${kind}`)
  const n4m = await loadMethodsWasm()

  // Address only the non-predict universe; map split rows back to original indices.
  const universe: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') universe.push(i)
  if (universe.length < 2) throw new Error('Split needs at least 2 non-predict samples.')

  const nu = universe.length
  const p = ds.nFeatures
  const Xd = new Float64Array(nu * p)
  for (let i = 0; i < nu; i++) Xd.set(ds.X.subarray(universe[i] * p, universe[i] * p + p), i * p)
  // Single-column Y (regression value or class index) for SPXY / KBins.
  const Yd = new Float64Array(nu)
  for (let i = 0; i < nu; i++) Yd[i] = ds.y[universe[i]]
  const X = { data: Xd, rows: nu, cols: p }
  const Y = { data: Yd, rows: nu, cols: 1 }

  const opts = {
    testSize: Math.min(0.6, Math.max(0.05, num(step.params.test_size, 0.25))),
    seed: num(step.params.seed, 42) >>> 0,
    maxIter: num(step.params.max_iter, 100),
    nBins: num(step.params.n_bins, 5),
    strategy: num(step.params.strategy, 0),
  }
  const mask = n4m.computeSplit(kind, X, Y_SPLIT_KINDS.has(kind) ? Y : null, opts)

  const partitions: Partition[] = ds.partitions.slice()
  for (let i = 0; i < nu; i++) partitions[universe[i]] = mask[i] === 1 ? 'test' : 'train'
  return { ...ds, partitions }
}
