import type { Preset } from './types'

// The "claque" preset gallery — ready-to-run pipelines that double as editable
// starting points. Each maps directly onto catalog node `type` tokens.
export const PRESETS: Preset[] = [
  {
    id: 'pls-baseline',
    name: 'PLS baseline',
    description: 'Raw spectra → PLS. The simplest honest reference model.',
    task: 'regression',
    steps: [],
    model: { type: 'n4m:models.pls.pls_regression', params: { n_components: 12 } },
  },
  {
    id: 'snv-sg-pls',
    name: 'SNV + SG + PLS',
    description: 'Scatter correction, Savitzky–Golay smoothing, then PLS — a robust everyday NIRS pipeline.',
    task: 'regression',
    steps: [
      { type: 'n4m:preprocessing.scatter.snv' },
      { type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 15, polyorder: 2, deriv: 0 } },
    ],
    model: { type: 'n4m:models.pls.pls_regression', params: { n_components: 12 } },
  },
  {
    id: 'msc-deriv-pls',
    name: 'MSC + 1st deriv + PLS',
    description: 'Multiplicative scatter correction, first derivative, then PLS — strong on baseline-dominated spectra.',
    task: 'regression',
    steps: [
      { type: 'n4m:preprocessing.scatter.msc' },
      { type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 15, polyorder: 2, deriv: 1 } },
    ],
    model: { type: 'n4m:models.pls.pls_regression', params: { n_components: 14 } },
  },
  {
    id: 'snv-deriv-plsda',
    name: 'SNV + 2nd deriv + PLS-LDA',
    description: 'Scatter correction and second derivative feeding PLS-LDA for classification tasks.',
    task: 'binary',
    steps: [
      { type: 'n4m:preprocessing.scatter.snv' },
      { type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 17, polyorder: 2, deriv: 2 } },
    ],
    model: { type: 'n4m:models.classification.pls_lda', params: { n_components: 8 } },
  },
]
