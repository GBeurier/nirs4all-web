import { predictPortablePipeline, runPortablePipeline } from './nirs4all-lite'
import { scoreNode } from './orchestrate'
import type { PortablePlsModel } from './nirs4all-lite'
import type { FittedPipeline, MaterializedDataset, PipelineDSL, PipelineStep, PredictResult, PredRow, RunOptions, RunResult } from './types'

const BACKEND_ID = 'nirs4all-lite-wasm'

interface PortableLiteState {
  backendId: typeof BACKEND_ID
  source: Record<string, unknown>
  result: {
    preprocessing: { type: string; params: number[] }[]
    model: PortablePlsModel
  }
}

export function isPortableLiteModel(model: FittedPipeline): boolean {
  return (model.state as { backendId?: string }).backendId === BACKEND_ID
}

export async function tryRunPortableLite(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult | null> {
  const source = toPortableSource(ds, dsl)
  if (!source) return null

  opts.onProgress?.({ phase: 'preprocess', pct: 3, message: 'running nirs4all-lite portable pipeline' })
  const result = await runPortablePipeline(source, {
    X: ds.X,
    y: ds.y,
    rows: ds.nSamples,
    cols: ds.nFeatures,
  })
  const scoreIdx = result.split.testIndices
  if (result.selected.predictions.length !== scoreIdx.length) {
    throw new Error('nirs4all-lite returned a prediction vector that does not match the scored split.')
  }
  const refitRows: PredRow[] = scoreIdx.map((row, i) => {
    const actual = ds.y[row]
    const predicted = result.selected.predictions[i]
    return {
      sampleId: ds.sampleIds[row],
      actual,
      predicted,
      residual: predicted - actual,
    }
  })
  const refit = scoreNode('refit', result.split.kind === 'all' ? 'Refit · train' : 'Refit · test', 'refit', refitRows, 'regression', [])
  const fitted: FittedPipeline = {
    dsl: selectedDsl(dsl, result.selected.n_components),
    taskType: 'regression',
    nFeatures: ds.nFeatures,
    state: {
      backendId: BACKEND_ID,
      source,
      result: {
        preprocessing: result.preprocessing,
        model: result.model,
      },
    } as PortableLiteState,
  }
  opts.onProgress?.({ phase: 'done', pct: 100 })
  return {
    id: `run-${Date.now().toString(36)}`,
    pipelineName: dsl.name,
    taskType: 'regression',
    targetName: ds.targetName,
    refit,
    folds: [],
    seed: 0,
    engine: BACKEND_ID,
    scoreMetric: 'rmse',
    lineage: { engine: BACKEND_ID, portableSubset: true, split: result.split.kind, variantCount: result.variants.length },
    model: fitted,
    createdAt: new Date().toISOString(),
    variantCount: result.variants.length,
    variants:
      result.variants.length > 1
        ? result.variants.map((variant) => ({
            variantId: `n_components:${variant.n_components}`,
            label: `n_components=${variant.n_components}`,
            metrics: { rmse: variant.rmse, n: result.targets.length },
            selected: variant.n_components === result.selected.n_components,
          }))
        : undefined,
  }
}

export async function predictPortableLite(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
  const state = model.state as PortableLiteState
  const predicted = await predictPortablePipeline(state.result, {
    X: Xnew,
    rows: nSamples,
    cols: nFeatures,
  })
  return { values: Float64Array.from(predicted.data) }
}

function toPortableSource(ds: MaterializedDataset, dsl: PipelineDSL): Record<string, unknown> | null {
  if (ds.taskType !== 'regression' || !dsl.model || dsl.model.type !== 'PLS') return null
  if (dsl.cv || dsl.branch || dsl.generation || hasFeatureContainers(dsl)) return null
  if (ds.partitions.some((part) => part === 'predict')) return null
  if (!dsl.split && ds.partitions.some((part) => part === 'test')) return null
  if (dsl.split && !compatibleSplit(dsl.split)) return null
  if (dsl.steps.some((step) => !compatiblePreprocessing(step))) return null
  if (dsl.model.variants || unsupportedSweepKeys(dsl.model, ['n_components'])) return null

  const pipeline: unknown[] = []
  if (dsl.split) {
    pipeline.push({
      class: 'nirs4all.operators.splitters.KennardStoneSplitter',
      params: { ...dsl.split.params },
    })
  }
  for (const step of dsl.steps) {
    if (step.type === 'StandardNormalVariate') {
      pipeline.push({ class: 'nirs4all.operators.transforms.StandardNormalVariate', params: { ...step.params } })
    } else if (step.type === 'SavitzkyGolay') {
      pipeline.push({ class: 'nirs4all.operators.transforms.SavitzkyGolay', params: { ...step.params } })
    }
  }

  const modelStep: Record<string, unknown> = {
    model: {
      class: 'sklearn.cross_decomposition.PLSRegression',
      params: { n_components: componentValue(dsl.model) },
    },
  }
  const sweep = dsl.model.sweeps?.n_components
  if (sweep) {
    if (sweep.type !== 'range' || sweep.from === undefined || sweep.to === undefined) return null
    const step = sweep.step ?? 1
    if (!Number.isFinite(sweep.from) || !Number.isFinite(sweep.to) || !Number.isFinite(step) || step <= 0 || sweep.from > sweep.to) return null
    modelStep.param = 'n_components'
    modelStep._range_ = [Math.round(sweep.from), Math.round(sweep.to), Math.round(step)]
  }
  pipeline.push(modelStep)
  return { name: dsl.name, pipeline }
}

function compatibleSplit(step: PipelineStep): boolean {
  return step.type === 'KennardStone' && !step.variants && !step.sweeps
}

function compatiblePreprocessing(step: PipelineStep): boolean {
  return (step.type === 'StandardNormalVariate' || step.type === 'SavitzkyGolay') && !step.variants && !step.sweeps
}

function unsupportedSweepKeys(step: PipelineStep, allowed: string[]): boolean {
  const keys = Object.keys(step.sweeps ?? {})
  return keys.some((key) => !allowed.includes(key))
}

function hasFeatureContainers(dsl: PipelineDSL): boolean {
  return (dsl.containers ?? []).some((container) => container.container !== 'generator' || container.branches.length > 0)
}

function componentValue(model: PipelineStep): number {
  const value = Number(model.params.n_components ?? 2)
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 2))
}

function selectedDsl(dsl: PipelineDSL, nComponents: number): PipelineDSL {
  if (!dsl.model) return dsl
  return {
    ...dsl,
    model: {
      ...dsl.model,
      params: { ...dsl.model.params, n_components: nComponents },
      sweeps: undefined,
    },
  }
}
