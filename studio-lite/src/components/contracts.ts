// Prop contracts for the feature components. App.tsx imports these; each
// component implements its matching interface exactly. This is the integration
// boundary between the parallel UI workstreams — keep it the single source of
// truth for component shapes.
import type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, RunProgress, RunResult, ScoreNode, TaskType } from '@/engine/types'
import type { DatasetSummary } from '@/data/dataset'
import type { Analysis } from '@/data/wasm-io'
import type { SampleId } from '@/data/samples'

// --- dataset group (src/components/dataset/) ---
export interface DatasetUploadProps {
  onDataset: (ds: MaterializedDataset, sourceName: string, analysis?: Analysis) => void
  onLoadSample: (sample?: SampleId) => void
  busy?: boolean
  error?: string | null
}
export interface DatasetViewProps {
  ds: MaterializedDataset
  summary: DatasetSummary
  onOpenConfig: () => void
}
export interface DatasetConfigDialogProps {
  open: boolean
  ds: MaterializedDataset
  /** present when the dataset was loaded through the formats/io WASM stack */
  analysis?: Analysis | null
  onOpenChange: (open: boolean) => void
  onApply: (patch: { targetName?: string; taskType?: TaskType; testFraction?: number }) => void
}

export type { Analysis }

// --- pipeline group (src/components/pipeline/) ---
export interface PipelineBuilderProps {
  pipeline: PipelineDSL
  taskType: TaskType
  running: boolean
  progress: RunProgress | null
  onChange: (pipeline: PipelineDSL) => void
  onRun: () => void
  onCancel: () => void
}

// --- results group (src/components/results/) ---
export interface ResultsListProps {
  runs: RunResult[]
  selectedRunId: string | null
  selectedScoreId: string | null
  onSelect: (run: RunResult, score: ScoreNode) => void
  onExport: (run: RunResult) => void
}
export interface ResultsVisualizationProps {
  run: RunResult
  score: ScoreNode
}
export interface PredictionPanelProps {
  run: RunResult
  engine: Engine
}

// re-exports so components import everything from one place if they prefer
export type { Engine, FittedPipeline, MaterializedDataset, PipelineDSL, RunProgress, RunResult, ScoreNode, TaskType, DatasetSummary }
