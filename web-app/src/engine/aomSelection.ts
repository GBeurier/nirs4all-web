/**
 * What an AOM-family estimator selected internally, summarized for display from
 * its Methods fit result (`fitResult()`, Methods 1.4.2 entries).
 *
 * Interim: Methods fit results carry no strings, so the chain and operator names
 * are formatted here from Methods' numeric descriptors (`N4M_OP_*` kinds and
 * their parameters). Ecosystem debt TD-2026-11-19-01 replaces this formatter by
 * owner names (a Methods string result entry) from 26 November 2026.
 *
 * The scores are AOM's internal cross-validation (or, in Fast mode, its
 * covariance screening criterion) inside the training data of the fit. They
 * describe the internal selection and are never outer out-of-fold or test scores.
 */

/** One screened candidate (a branch and chain, or one operator) with its internal score. */
export interface AomCandidate {
  label: string
  score: number
}

export interface AomSelection {
  methodId: string
  /** `cv_rmse`: internal mean-fold validation RMSE (lower is better);
   *  `screening`: Fast-mode covariance screening criterion (higher is better). */
  criterion: 'cv_rmse' | 'screening'
  /** the selected preprocessing (branch › chain, or operator per component) */
  selected: string
  /** the best candidates, best first; the selected one is first unless the
   *  criterion cannot rank it (POP-PLS has no candidate ranking) */
  ranking: AomCandidate[]
  /** how many candidates were screened */
  candidates: number
  nComponents?: number
  alpha?: number
}

type Matrix = { data: ArrayLike<number>; rows: number; cols: number }
type FitResult = Record<string, unknown>

const BRANCHES = ['raw', 'SNV', 'MSC']
const NAMES: Record<number, string> = {
  0: 'identity', 1: 'center', 2: 'autoscale', 3: 'Pareto', 4: 'SNV', 5: 'MSC', 6: 'EMSC',
  11: 'AsLS', 12: 'OSC', 13: 'EPO', 14: 'wavelet', 17: 'FCK', 19: 'LVSE',
}

/** Display name of one Methods operator (`N4M_OP_*` kind and its parameters). */
export function operatorLabel(kind: number, params: readonly number[]): string {
  const [a, b, c] = params
  switch (kind) {
    case 7: return `detrend d${a ?? 1}`
    case 8: return params.length ? `SG smooth w${a} p${b}` : 'SG smooth'
    case 9: return params.length ? `SG d${c} w${a} p${b}` : 'SG d1'
    case 10: return params.length ? `NW d${c} s${a} g${b}` : 'Norris–Williams'
    case 15: return `diff d${a ?? 1}`
    case 16: return params.length ? `Whittaker λ${a}` : 'Whittaker'
    case 18: return params.length ? `Gaussian σ${a}` : 'Gaussian'
    default: return NAMES[kind] ?? `operator ${kind}`
  }
}

const isMatrix = (value: unknown): value is Matrix =>
  typeof value === 'object' && value !== null && 'data' in value && 'rows' in value && 'cols' in value
const ints = (value: unknown): number[] | undefined =>
  Array.isArray(value) ? value.map(Number) : undefined
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/** Labels of the operator list `operator_kinds` / `operator_param_offsets` / `operator_params`. */
function operatorLabels(result: FitResult): string[] | undefined {
  const kinds = ints(result.operator_kinds), offsets = ints(result.operator_param_offsets)
  const values = result.operator_params
  if (!kinds || !offsets || offsets.length !== kinds.length + 1 || !isMatrix(values)) return undefined
  return kinds.map((kind, i) => operatorLabel(kind, Array.from(values.data).slice(offsets[i], offsets[i + 1])))
}

/** The best `top` of finite-scored candidates, best first. */
function rank(labels: string[], scores: ArrayLike<number>, lowerIsBetter: boolean, top: number): AomCandidate[] {
  return labels.map((label, i) => ({ label, score: scores[i] }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((x, y) => (lowerIsBetter ? x.score - y.score : y.score - x.score))
    .slice(0, top)
}

function calibration(methodId: string, result: FitResult, top: number): AomSelection | undefined {
  const branches = ints(result.branches), chains = ints(result.chain_offsets), ops = operatorLabels(result)
  const branch = num(result.selected_branch), chain = num(result.selected_chain_index)
  if (!branches || !chains || !ops || branch === undefined || chain === undefined) return undefined
  const chainLabels = chains.slice(0, -1).map((start, c) => ops.slice(start, chains[c + 1]).join(' › '))
  const labels = branches.flatMap((kind) => chainLabels.map((label) => `${BRANCHES[kind] ?? `branch ${kind}`} › ${label}`))
  const selected = `${BRANCHES[branch] ?? `branch ${branch}`} › ${chainLabels[chain]}`
  const extras = { nComponents: num(result.selected_n_components), alpha: num(result.selected_alpha) }
  if (isMatrix(result.screen_scores)) {
    return { methodId, criterion: 'screening', selected, ranking: rank(labels, result.screen_scores.data, false, top), candidates: labels.length, ...extras }
  }
  const scores = result.cv_scores
  if (!isMatrix(scores) || scores.rows !== labels.length) return undefined
  // Each (branch, chain) row is scored by its best parameter (components or alpha).
  const best = Array.from({ length: scores.rows }, (_, r) => {
    let value = Infinity
    for (let k = 0; k < scores.cols; k++) {
      const v = scores.data[r * scores.cols + k]
      if (Number.isFinite(v) && v < value) value = v
    }
    return value
  })
  return { methodId, criterion: 'cv_rmse', selected, ranking: rank(labels, best, true, top), candidates: labels.length, ...extras }
}

function operatorSelection(methodId: string, result: FitResult, top: number): AomSelection | undefined {
  const labels = operatorLabels(result)
  if (!labels) return undefined
  const nComponents = num(result.selected_n_components)
  const index = num(result.selected_operator_index)
  if (index !== undefined && isMatrix(result.operator_scores)) {
    return { methodId, criterion: 'cv_rmse', selected: labels[index], ranking: rank(labels, result.operator_scores.data, true, top), candidates: labels.length, nComponents }
  }
  const perComponent = ints(result.selected_operator_indices)
  if (!perComponent) return undefined
  return { methodId, criterion: 'cv_rmse', selected: perComponent.map((op, k) => `c${k + 1}: ${labels[op]}`).join(' · '), ranking: [], candidates: labels.length, nComponents }
}

/**
 * The internal selection of an AOM-family fit (`aom_pop.calibration`,
 * `aom_pop.aom_pls`, `aom_pop.pop_pls`), or undefined for another method or a
 * fit result without the Methods 1.4.2 descriptors.
 */
export function summarizeAomFit(methodId: string, result: FitResult | null | undefined, top = 5): AomSelection | undefined {
  if (!result) return undefined
  if (methodId === 'aom_pop.calibration') return calibration(methodId, result, top)
  if (methodId === 'aom_pop.aom_pls' || methodId === 'aom_pop.pop_pls') return operatorSelection(methodId, result, top)
  return undefined
}

/** `label (score)` list of the ranking, for one-line display. */
export function formatRanking(selection: AomSelection, count = 3): string {
  return selection.ranking.slice(0, count).map(({ label, score }) => `${label} (${Number(score.toPrecision(4))})`).join('; ')
}

/** Display label of the internal score criterion. */
export const AOM_CRITERION_LABEL: Record<AomSelection['criterion'], string> = {
  cv_rmse: 'internal CV RMSE',
  screening: 'Fast screening, higher is better',
}
