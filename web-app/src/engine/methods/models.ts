// Model dispatch helper for the libn4m backend. PLS / PLS-DA keep the legacy
// fast-path (n4m_estimators_pls_fit / n4m_estimators_pls_lda_fit style coeffs via
// fitPls); every other catalog model routes through the generic coeff dispatcher
// (fitModel) with the positional vector from ./params.

/** Tokens fitted through the legacy PLS fast-path (fitPls / predictPls). */
export const LEGACY_PLS_MODELS = new Set(['PLS', 'PLSRegression', 'PLSDA'])
