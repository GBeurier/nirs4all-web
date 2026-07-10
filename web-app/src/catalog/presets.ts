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
    model: { type: 'PLS', params: { n_components: 12 } },
  },
  {
    id: 'snv-sg-pls',
    name: 'SNV + SG + PLS',
    description: 'Scatter correction, Savitzky–Golay smoothing, then PLS — a robust everyday NIRS pipeline.',
    task: 'regression',
    steps: [
      { type: 'StandardNormalVariate' },
      { type: 'SavitzkyGolay', params: { window: 15, polyorder: 2, deriv: 0 } },
    ],
    model: { type: 'PLS', params: { n_components: 12 } },
  },
  {
    id: 'msc-deriv-pls',
    name: 'MSC + 1st deriv + PLS',
    description: 'Multiplicative scatter correction, first derivative, then PLS — strong on baseline-dominated spectra.',
    task: 'regression',
    steps: [
      { type: 'MSC' },
      { type: 'SavitzkyGolay', params: { window: 15, polyorder: 2, deriv: 1 } },
    ],
    model: { type: 'PLS', params: { n_components: 14 } },
  },
  {
    id: 'snv-deriv-plsda',
    name: 'SNV + 2nd deriv + PLS-DA',
    description: 'Scatter correction and second derivative feeding PLS-DA for classification tasks.',
    task: 'binary',
    steps: [
      { type: 'StandardNormalVariate' },
      { type: 'SavitzkyGolay', params: { window: 17, polyorder: 2, deriv: 2 } },
    ],
    model: { type: 'PLSDA', params: { n_components: 12 } },
  },
]
