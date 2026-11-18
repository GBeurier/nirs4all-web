// Prop contracts for the feature components. App.tsx imports these; each
// component implements its matching interface exactly. This is the integration
// boundary between the parallel UI workstreams — keep it the single source of
// truth for component shapes.
import type { Engine, ExplainAxis, FittedPipeline, MaterializedDataset, PipelineDSL, RunLogEntry, RunProgress, RunResult, ScoreNode, TaskType } from '@/engine/types'
import type { DatasetSummary } from '@/data/dataset'
import type { Analysis } from '@/data/wasm-io'
import type { SampleId } from '@/data/samples'

// --- dataset group (src/components/dataset/) ---
export interface DatasetUploadProps {
  onDataset: (ds: MaterializedDataset, sourceName: string, analysis?: Analysis) => void
  onLoadSample: (sample?: SampleId) => void
  /** import a saved .n4a model bundle → jump straight to Predict (no dataset needed) */
  onImportModel?: (file: File) => void
  busy?: boolean
  error?: string | null
}
export interface DatasetViewProps {
  ds: MaterializedDataset
  summary: DatasetSummary
  /** Current run CV configuration supplies preview defaults and grouping policy. */
  cv?: PipelineDSL['cv']
  onOpenConfig: () => void
  /** change the projected target of a dataset with several targets (absent: the view cannot change it) */
  onSelectTarget?: (name: string) => void
}
export interface DatasetConfigDialogProps {
  open: boolean
  ds: MaterializedDataset
  /** present when the dataset was loaded through the formats/io WASM stack */
  analysis?: Analysis | null
  onOpenChange: (open: boolean) => void
  onApply: (patch: DatasetConfigPatch) => void
}

/** `target`: another target of the dataset becomes the projected one; `targetName`: the display name of
 *  the projected target; `repetition`: the nirs4all repetition column, null clears it. */
export interface DatasetConfigPatch { target?: string; targetName?: string; taskType?: TaskType; testFraction?: number; repetition?: string | null }

export type { Analysis }

// --- pipeline group (src/components/pipeline/) ---
export interface PipelineBuilderProps {
  pipeline: PipelineDSL
  taskType: TaskType
  datasetLabel?: string
  running: boolean
  progress: RunProgress | null
  runLog: RunLogEntry[]
  onChange: (pipeline: PipelineDSL) => void
  onRun: () => void
  onCancel: () => void
}

// --- results group (src/components/results/) ---
export interface ResultsListProps {
  runs: RunResult[]
  /** re-serializes a run's model for the .n4a export (training-row policy) */
  engine: Engine
  selectedRunId: string | null
  selectedScoreId: string | null
  onSelect: (run: RunResult, score: ScoreNode) => void
  onClearSelection?: () => void
  /** Inspecting a non-selected variant changes the run without borrowing winner predictions. */
  onSelectRun?: (run: RunResult) => void
}
export interface ResultsVisualizationProps {
  run: RunResult
  score: ScoreNode
}
export interface PredictionPanelProps {
  /** the fitted model to score with — from a run or an imported .n4a bundle */
  model: FittedPipeline
  /** display name of the model's source (pipeline / bundle name) */
  sourceName: string
  /** scalar training target; matrix replay supplies its own target names */
  targetName?: string
  engine: Engine
  /** swap in a different model from a .n4a bundle */
  onImportModel?: (file: File) => void
  /** the last successfully predicted input (null when cleared), offered to Explain */
  onPredicted?: (rows: PredictedRows | null) => void
}

/** A Predict input the model scored: its rows are the default rows to explain. */
export interface PredictedRows {
  /** the model that scored these rows (Explain ignores rows scored by another model) */
  model: FittedPipeline
  /** row-major nSamples x nFeatures */
  X: Float64Array
  nSamples: number
  nFeatures: number
  /** the file header's column names, checked by predict; absent: positional */
  featureNames?: string[]
  fileName: string
}

// --- explain group (src/components/explain/) ---
export interface ExplainPanelProps {
  /** the model Predict uses (selected run or imported .n4a) */
  model: FittedPipeline
  sourceName: string
  /** scalar training target name; multi-target models name their outputs */
  targetName?: string
  /** output names of a multi-target model, when known */
  targetNames?: string[]
  engine: Engine
  /** the dataset the selected run was fitted on (null for an imported model):
   *  its partitions supply rows to explain and the training background */
  dataset?: MaterializedDataset | null
  /** the last Predict input scored by this model */
  predicted?: PredictedRows | null
  /** recorded spectral axis of the model input (null/unknown unit: feature indices) */
  axis?: ExplainAxis | null
  /** go to Predict to score a file */
  onGoPredict?: () => void
}

// re-exports so components import everything from one place if they prefer
export type { Engine, ExplainAxis, FittedPipeline, MaterializedDataset, PipelineDSL, RunLogEntry, RunProgress, RunResult, ScoreNode, TaskType, DatasetSummary }
