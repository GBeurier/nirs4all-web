// Model dispatch helper for the libn4m backend. PLS / PLS-DA keep the legacy
// fast-path (n4m_pls_fit_simple / n4m_pls_lda style coeffs via fitPls); every
// other catalog model routes through the generic coeff dispatcher (fitModel).
//
// The positional `params` vector handed to fitModel MUST match the C
// `n4m_wasm_model_fit` switch in nirs4all-methods/bindings/js/src/wasm_entry.c.
// n_components is passed separately, so it is NOT part of these vectors.

const num = (v: unknown, d: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** Tokens fitted through the legacy PLS fast-path (fitPls / predictPls). */
export const LEGACY_PLS_MODELS = new Set(['PLS', 'PLSRegression', 'PLSDA'])

/** Model hyper-parameter vector for fitModel (excludes n_components). */
export function modelParamVector(type: string, p: Record<string, unknown>): number[] {
  switch (type) {
    // Tier A — algorithm-enum family: only n_components (separate arg)
    case 'PCR':
    case 'PLSCanonical':
    case 'PLSSVD':
      return []
    // Tier B — standalone coeff fits
    case 'Ridge':
      return [num(p.lambda, 1)]
    case 'RidgePLS':
      return [num(p.ridge_lambda, 1)]
    case 'ContinuumRegression':
      return [num(p.tau, 0.5)]
    case 'RobustPLS':
      return [num(p.huber_k, 1.345), num(p.max_irls_iter, 5)]
    case 'CPPLS':
      return [num(p.gamma, 0.5)]
    case 'SparseSIMPLS':
      return [num(p.sparsity_lambda, 0)]
    case 'GroupSparsePLS':
      return [num(p.group_lambda, 0)]
    case 'FusedSparsePLS':
      return [num(p.l1_lambda, 0), num(p.fusion_lambda, 0)]
    case 'BaggingPLS':
      return [num(p.n_estimators, 10), num(p.seed, 0)]
    case 'BoostingPLS':
      return [num(p.n_estimators, 10), num(p.learning_rate, 0.1)]
    case 'RandomSubspacePLS':
      return [num(p.n_estimators, 10), num(p.features_per_subspace, 50), num(p.seed, 0)]
    // MIR-PLS (multiple inverse regression), MB-PLS (single-block) and
    // missing-aware NIPALS take only n_components (passed separately); no
    // positional hyper-params.
    case 'MIRPLS':
    case 'MBPLS':
    case 'MissingAwareNIPALS':
      return []
    default:
      return []
  }
}
