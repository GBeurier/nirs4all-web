import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'
import {
  capabilityManifest,
  predictPortablePipeline,
  runPortablePipeline,
  runtimeContracts,
  type PortableExecutionResult,
  type PortableMatrixDataset,
  type PortablePredictionResult,
  type PipelineDefinition,
} from 'nirs4all'

export interface CustomHostState {
  controllerCount: number
  datasetTitle: string
  engineLabel: string
  predictSurface: string
  runtimeLabel: string
  sampleCount: number
}

export function createDemoDataset(): PortableMatrixDataset {
  const rows = 12
  const cols = 4
  const X = Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    return 0.2 * row + 0.03 * col + Math.sin((row + col) / 5)
  })
  const y = Array.from({ length: rows }, (_, row) => 0.5 + row * 0.12 + Math.cos(row / 4) * 0.05)
  return { X, y, rows, cols }
}

export function createDemoPipeline(): PipelineDefinition {
  return {
    name: 'custom-host-pls-demo',
    description: 'Small portable PLS pipeline for a client-side custom host.',
    pipeline: [
      {
        class: 'nirs4all.operators.splitters.KennardStoneSplitter',
        params: { test_size: 0.25 },
      },
      {
        class: 'nirs4all.operators.transforms.StandardNormalVariate',
        params: {},
      },
      {
        model: {
          class: 'sklearn.cross_decomposition.PLSRegression',
          params: { n_components: 2 },
        },
      },
    ],
  }
}

export async function runDemoPipeline(): Promise<{
  predictions: PortablePredictionResult
  result: PortableExecutionResult
}> {
  const dataset = createDemoDataset()
  const result = await runPortablePipeline(createDemoPipeline(), dataset)
  const predictions = await predictPortablePipeline(result, {
    X: dataset.X,
    rows: dataset.rows,
    cols: dataset.cols,
  })
  return { predictions, result }
}

export function buildCustomHostState(): CustomHostState {
  const manifest = capabilityManifest()
  const predictSurface = runtimeContracts.find((item) => item.serializedModelPredict)?.surface ?? 'none'
  const datasetPreview = buildDatasetPreview({
    id: 'custom-host-demo',
    name: 'Custom host demo dataset',
    taskType: 'regression',
    sampleCount: 12,
    featureCount: 4,
    splitCounts: { train: 9, test: 3 },
    tags: ['nirs4all-core', 'nirs4all-ui', 'client-only'],
  })
  const engineStatus = buildRuntimeEngineStatus({
    engine: 'nirs4all-core-wasm',
    requestedEngine: 'nirs4all-core-wasm',
    diagnostics: [],
  })
  return {
    controllerCount: manifest.controllers.length,
    datasetTitle: datasetPreview?.title ?? 'Dataset',
    engineLabel: engineStatus?.badgeLabel ?? 'nirs4all-core-wasm',
    predictSurface,
    runtimeLabel: runtimeEngineLabel({ compiled: true, executed: true }) ?? 'runtime ready',
    sampleCount: datasetPreview?.sampleCount ?? 0,
  }
}

export function CustomAppHostDemo({ state = buildCustomHostState() }: { state?: CustomHostState }) {
  const datasetPreview = buildDatasetPreview({
    id: 'custom-host-demo',
    name: state.datasetTitle,
    taskType: 'regression',
    sampleCount: state.sampleCount,
    featureCount: 4,
    splitCounts: { train: 9, test: 3 },
    tags: ['nirs4all-core', 'nirs4all-ui', 'client-only'],
  })
  const engineStatus = buildRuntimeEngineStatus({
    engine: 'nirs4all-core-wasm',
    requestedEngine: 'nirs4all-core-wasm',
    diagnostics: [],
  })

  return (
    <main aria-label="nirs4all custom app host">
      <header>
        <h1>nirs4all custom host</h1>
        <p>{state.runtimeLabel}</p>
      </header>
      <section aria-label="Reusable UI contracts">
        <DatasetPreviewCard view={datasetPreview} className="custom-host-dataset" />
        <RuntimeEngineBadge status={engineStatus} className="custom-host-engine" />
        <MetricValueBadge metric="rmse" value={0.03125} className="custom-host-score" />
      </section>
      <dl>
        <dt>Runtime predict surface</dt>
        <dd>{state.predictSurface}</dd>
        <dt>Controller contracts</dt>
        <dd>{state.controllerCount}</dd>
      </dl>
    </main>
  )
}
