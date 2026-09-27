// Split operators — apply a single train/test split BEFORE cross-validation.
// Every split node is an n4m splitter (Kennard-Stone, SPXY, KMeans, KBins, SPlit
// twinning, ...) run through the generic role API (methods/n4m.ts `split`); its
// FIRST fold OVERRIDES the dataset's partition: the fold's test rows are held out
// of CV, its train rows feed the CV fold builder (a K-fold splitter therefore
// holds out its first fold). Predict-partition rows are left untouched. The
// numerics never live here; this only marshals X/y and rewrites partitions.
import { nodeByType } from '@/catalog/nodes'
import { splitRows } from './methods/n4m'
import { loadMethodsWasm } from './nirs4all-core'
import type { MaterializedDataset, PipelineStep, Partition } from './types'

/** True for a catalog split operator (engine dispatch + UI). */
export function isSplitType(type: string): boolean {
  return nodeByType(type)?.category === 'split'
}

/**
 * Compute the split for `step` over the dataset's non-predict rows and return a
 * NEW dataset with `partitions` overridden to train/test from the splitter's first
 * fold. Rows already marked `predict` keep that role and are excluded from the
 * split. For classification, y-reading splitters see the encoded class index.
 */
export async function applySplit(ds: MaterializedDataset, step: PipelineStep): Promise<MaterializedDataset> {
  if (!isSplitType(step.type)) throw new Error(`Unknown split operator: ${step.type}`)
  await loadMethodsWasm()

  // Address only the non-predict universe; map split rows back to original indices.
  const universe: number[] = []
  for (let i = 0; i < ds.nSamples; i++) if (ds.partitions[i] !== 'predict') universe.push(i)
  if (universe.length < 2) throw new Error('Split needs at least 2 non-predict samples.')

  const nu = universe.length
  const p = ds.nFeatures
  const Xd = new Float64Array(nu * p)
  for (let i = 0; i < nu; i++) Xd.set(ds.X.subarray(universe[i] * p, universe[i] * p + p), i * p)
  const y = Float64Array.from(universe, (row) => ds.y[row])
  const [fold] = splitRows(step.type, step.params, { data: Xd, rows: nu, cols: p }, y)
  if (!fold) throw new Error(`${nodeByType(step.type)?.name ?? step.type} returned no split.`)

  const partitions: Partition[] = ds.partitions.slice()
  for (const i of fold.train) partitions[universe[i]] = 'train'
  for (const i of fold.test) partitions[universe[i]] = 'test'
  return { ...ds, partitions }
}
