/** Host transport. IO owns assembly; native DAG and Methods own execution. */
export type LabCase = 'spectroscopy' | 'genetics' | 'images'
export type LabStrategy = 'single' | 'early' | 'mbpls' | 'late' | 'stacking' | 'hybrid' | 'mid' | 'mid-stacking'
export interface LabSource {
  id: string
  label: string
  modality: 'spectroscopy' | 'genetics' | 'image'
  representation: 'signal_1d' | 'tabular_numeric' | 'gray_image' | 'rgb_image'
  sampleIds: string[]
  data: Float64Array
  shape: number[]
  featureNames: string[]
  axis?: { values: number[]; unit: string; kind: string }
  validity?: Uint8Array
  provenance: Record<string, unknown>
}
export interface LabDataset {
  caseId: LabCase
  name: string
  fingerprint: string
  sampleIds: string[]
  sources: LabSource[]
  target: { name: string; unit: string; values: Float64Array }
  groupIds?: string[]
  partitions?: Array<'train' | 'test'>
  alignment: Array<{ sourceId: string; matched: number; missing: number; refused: number }>
  provenance: Record<string, unknown>
}
export interface LabStep { methodId: string; params: Record<string, unknown> }
export interface LabPipelineStep { methodId: string; params: Record<string, number | string | boolean> }
export interface LabSourceChain { readonly sourceId: string; readonly steps: readonly LabPipelineStep[] }
export interface LabPipelineBranch {
  readonly id: string
  readonly label: string
  readonly sourceIds: readonly string[]
  readonly sourceChains: readonly LabSourceChain[]
  readonly head: LabPipelineStep
}
export interface LabPipelineDocument {
  readonly label: string
  readonly branches: readonly LabPipelineBranch[]
  readonly merge: {
    readonly kind: 'none' | 'mean' | 'model'
    readonly head: LabPipelineStep
    readonly sourceIds: readonly string[]
    readonly sourceChains: readonly LabSourceChain[]
  }
}
export interface LabPipelinePreset {
  id: string; label: string; description: string; strategy: LabStrategy; document: LabPipelineDocument
}
export interface LabCnnConfig {
  filters: number; kernel_size: number; embedding_dim: number; head_hidden: number
  epochs: number; batch_size: number; learning_rate: number; weight_decay: number
}
export interface LabConfig {
  pipeline?: LabPipelineDocument
  caseId: LabCase
  sourceIds: string[]
  strategy: LabStrategy
  singleSourceId: string
  sourceChains: Array<{ sourceId: string; steps: LabStep[] }>
  nComponents: number
  ridgeAlpha: number
  blockScaling: boolean
  baseModels: Array<'pls' | 'ridge'>
  cnn: LabCnnConfig
  validation: { seed: string; outerFolds: number; innerFolds: number; holdoutFraction: number | null }
}
export interface LabPredictionRow {
  sampleId: string; observed: number; predicted: number; residual: number; foldId?: string
}
export interface LabMetricScope {
  scope: 'oof' | 'holdout'
  n: number; rmse: number; mae: number; r2: number | null
  rows: LabPredictionRow[]
  perFold: Array<{ foldId: string; n: number; rmse: number; mae: number; r2: number | null }>
  undefinedReasons: Record<string, string>
}
export interface LabCandidateResult {
  id: string
  strategy: LabStrategy
  label: string
  dataFingerprint: string
  recipe: unknown
  recipeFingerprint: string
  foldsFingerprint: string
  hyperparameters: 'fixed'
  ownerVersions: Record<string, unknown>
  elapsedMs: number
  oof: LabMetricScope
  holdout: LabMetricScope | null
  diagnostics: Array<Record<string, unknown>>
  /** Internal selections reported by native heads (AOM), in fit order; the last per source is the refit's. */
  modelSelections?: Array<{ methodId: string; sourceIds: string[]; values: Record<string, number> }>
  warnings: string[]
  /** Native portable package bytes, retained locally for explicit later replay. */
  portablePackageJson: string
}
export interface LabProgress {
  candidateIndex: number; candidateCount: number; strategy: LabStrategy
  phase: string; nodeId?: string; foldId?: string | null; message: string
}
export interface LabRunResult {
  dataFingerprint: string
  configs: LabConfig[]
  configFingerprint: string
  foldsFingerprint: string
  calibrationIds: string[]
  holdoutIds: string[]
  folds: unknown
  candidates: LabCandidateResult[]
  refusals: Array<{ candidateId: string; strategy: LabStrategy; reason: string }>
  validation: LabConfig['validation']
  ownerVersions: Record<string, unknown>
  elapsedMs: number
  warnings: string[]
}
export type LabWorkerRequest = { id: string; kind: 'run'; dataset: LabDataset; configs: LabConfig[] }
export type LabWorkerReply =
  | { id: string; kind: 'progress'; progress: LabProgress }
  | { id: string; kind: 'result'; result: LabRunResult }
  | { id: string; kind: 'error'; error: { name: string; message: string } }
