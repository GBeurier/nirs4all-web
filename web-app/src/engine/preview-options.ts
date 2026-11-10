import type { PipelineDSL } from './types'

/** Host preview options; execution and numerical methods stay in owner WASM. */
export interface OwnerPreviewOptions {
  profile?: 'dataset-view'
  /** Fit on trainRowsOf (labelled train / non-predict fallback), then transform all rows. */
  fitScope?: 'train'
  /** Complete run CV configuration over the shared training cohort and physical samples. */
  folds?: NonNullable<PipelineDSL['cv']>
}
