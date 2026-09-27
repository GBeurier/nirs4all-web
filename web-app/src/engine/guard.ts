// Pre-flight cost guard for the operator-adaptive models (the n4m AOM/POP
// family). They fit an INTERNAL `cv`-fold screen over an operator bank *inside
// every outer CV fold*, so the work scales with nTrain · nFeatures · cv · |bank| ·
// components — easily many minutes on a wide, large dataset (e.g. Cassava
// 3825×1050). Worker-backed engines run heavy screens in the background so the
// UI stays cancellable. Only a main-thread fallback must refuse heavy AOM/POP
// work before libn4m starts; otherwise the browser cannot repaint or handle Cancel.
import { nodeByType } from '@/catalog/nodes'
import { RtErrorException, makeRtError } from './rt'
import type { MaterializedDataset, PipelineDSL, RunProgress } from './types'

// Heuristic on (train rows × features × inner screen fits). Calibrated so a small
// demo dataset runs unremarked, a large one warns + runs when worker-backed, and
// the main-thread fallback refuses before the tab becomes unresponsive.
const WARN_COST = 2e7
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
  const def = model ? nodeByType(model.type) : undefined
  if (!model || !def?.autonomous) return

  // The screen's size from the node's params (the manifest default when unset).
  const param = (name: string): unknown => model.params[name] ?? def.params.find((p) => p.name === name)?.default
  const nTrain = ds.partitions.reduce((a, p) => a + (p === 'train' ? 1 : 0), 0) || ds.nSamples
  const folds = Math.max(2, Math.round(Number(param('cv') ?? 5)))
  const nComp = Math.max(1, Math.round(Number(param('max_components') ?? param('n_components') ?? 10)))
  const kinds = param('op_kinds')
  const bank = Array.isArray(kinds) && kinds.length ? kinds.length : 1
  const outerFits = Math.max(1, Math.round(Number(dsl.cv?.folds ?? 0)) + 1) // outer CV folds + final refit
  const cost = nTrain * ds.nFeatures * folds * bank * nComp * outerFits
  if (cost <= WARN_COST) return

  const human = `${nTrain}×${ds.nFeatures}, screening ${bank} operators × ${folds} inner folds × ${nComp} components, ${outerFits} outer fit${outerFits === 1 ? '' : 's'}`
  if (opts.mainThread && cost > MAIN_THREAD_REFUSE_COST) {
    // Refuse before libn4m starts. Surface a typed RtError (B-018) — an
    // unsupported_capability (cancellable background compute) for this environment.
    const mitigation = 'Use the served build for worker-backed execution, or reduce rows, features, the inner CV folds, the operator bank, or components.'
    throw new RtErrorException(
      makeRtError({
        verb: 'run',
        cause: 'unsupported_capability',
        unsupported_capability: 'cancellable_background_compute',
        message:
          `This ${def.name} screen is too large for the offline single-file build (${human}). ` +
          `AOM/POP would run on the browser UI thread, so Cancel cannot interrupt it. ` +
          mitigation,
        mitigation,
      }),
    )
  }
  onProgress?.({
    phase: 'fit_cv',
    pct: 1,
    message: `Heavy ${def.name} screen (${human}) — this can take a while. It runs in the background; press Cancel to stop.`,
  })
}
