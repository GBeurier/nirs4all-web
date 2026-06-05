// Pre-flight cost guard for the operator-adaptive models (AOM-PLS / POP-PLS).
// Both fit an INTERNAL screen_folds-fold CV over an operator bank *inside every
// outer CV fold*, so the work scales with nTrain · nFeatures · screen_folds ·
// |bank| — easily many minutes on a wide, large dataset (e.g. Cassava 3825×1050).
// The engine now runs in a Web Worker so this never freezes the UI, but a long
// run must not be SILENT: we (a) warn up front for heavy screens and (b) refuse
// the extreme cases that would not realistically finish in an in-browser demo.
import type { MaterializedDataset, PipelineDSL, RunProgress } from './types'
import { AOM_DEFAULT_BANK } from '@/catalog/types'

const AOM_MODELS = new Set(['AOMPLS', 'POPPLS'])

// Heuristic on (train rows × features × inner screen fits). Calibrated so a small
// demo dataset runs unremarked, a large one (Cassava) warns + runs (cancellable),
// and a pathological one is refused with actionable guidance rather than grinding.
const WARN_COST = 2e7
const REFUSE_COST = 8e8

/** Throw (extreme) or emit a warning (heavy) before an AOM/POP screen runs. */
export function assertAomBudget(ds: MaterializedDataset, dsl: PipelineDSL, onProgress?: (p: RunProgress) => void): void {
  const model = dsl.model
  if (!model || !AOM_MODELS.has(model.type)) return

  const nTrain = ds.partitions.reduce((a, p) => a + (p === 'train' ? 1 : 0), 0) || ds.nSamples
  const folds = Math.max(2, Math.round(Number(model.params.screen_folds ?? 5)))
  const bankRaw = model.params.operator_bank
  const bank = Array.isArray(bankRaw) && bankRaw.length ? bankRaw.length : AOM_DEFAULT_BANK.length
  const cost = nTrain * ds.nFeatures * folds * bank
  if (cost <= WARN_COST) return

  const human = `${nTrain}×${ds.nFeatures}, screening ${bank} operators × ${folds} folds`
  if (cost > REFUSE_COST) {
    throw new Error(
      `This ${model.type} screen is too large for the in-browser demo (${human}). ` +
        `Reduce it by subsampling rows, lowering "Screen CV folds" or the operator bank, ` +
        `using fewer components — or run plain PLS (no operator screen) instead.`,
    )
  }
  onProgress?.({
    phase: 'fit_cv',
    pct: 1,
    message: `Heavy ${model.type} screen (${human}) — this can take a while. It runs in the background; press Cancel to stop.`,
  })
}
