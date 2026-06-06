// Pre-flight cost guard for the operator-adaptive models (AOM-PLS / POP-PLS).
// Both fit an INTERNAL screen_folds-fold CV over an operator bank *inside every
// outer CV fold*, so the work scales with nTrain · nFeatures · screen_folds ·
// |bank| — easily many minutes on a wide, large dataset (e.g. Cassava 3825×1050).
// The served engine runs in a Web Worker so heavy runs stay cancellable. The
// single-file build runs in the UI thread, so it must refuse heavy AOM/POP work
// before libn4m starts; otherwise the browser cannot repaint or handle Cancel.
import type { MaterializedDataset, PipelineDSL, RunProgress } from './types'
import { AOM_DEFAULT_BANK } from '@/catalog/types'

const AOM_MODELS = new Set(['AOMPLS', 'POPPLS'])

// Heuristic on (train rows × features × inner screen fits). Calibrated so a small
// demo dataset runs unremarked, a large one (Cassava) warns + runs (cancellable),
// and a pathological one is refused with actionable guidance rather than grinding.
const WARN_COST = 2e7
const REFUSE_COST = 8e8
const MAIN_THREAD_REFUSE_COST = WARN_COST

interface AomBudgetOptions {
  /** true for dist-single/file://, where compute runs on the UI thread. */
  mainThread?: boolean
}

/** Throw (extreme or main-thread heavy) or emit a warning before AOM/POP runs. */
export function assertAomBudget(
  ds: MaterializedDataset,
  dsl: PipelineDSL,
  onProgress?: (p: RunProgress) => void,
  opts: AomBudgetOptions = {},
): void {
  const model = dsl.model
  if (!model || !AOM_MODELS.has(model.type)) return

  const nTrain = ds.partitions.reduce((a, p) => a + (p === 'train' ? 1 : 0), 0) || ds.nSamples
  const folds = Math.max(2, Math.round(Number(model.params.screen_folds ?? 5)))
  const bankRaw = model.params.operator_bank
  const bank = Array.isArray(bankRaw) && bankRaw.length ? bankRaw.length : AOM_DEFAULT_BANK.length
  const outerFits = Math.max(1, Math.round(Number(dsl.cv?.folds ?? 0)) + 1) // CV folds + final refit
  const cost = nTrain * ds.nFeatures * folds * bank * outerFits
  if (cost <= WARN_COST) return

  const human = `${nTrain}×${ds.nFeatures}, screening ${bank} operators × ${folds} folds, ${outerFits} fit(s)`
  if (opts.mainThread && cost > MAIN_THREAD_REFUSE_COST) {
    throw new Error(
      `This ${model.type} screen is too large for the offline single-file build (${human}). ` +
        `AOM/POP would run on the browser UI thread, so Cancel cannot interrupt it. ` +
        `Use the served build for worker-backed execution, or reduce rows, features, Screen CV folds, the operator bank, or components.`,
    )
  }
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
