import { predictPortablePipeline, runPortablePipeline } from './nirs4all-core'
import { scoreNode } from './orchestrate'
import type { PortablePlsModel } from './nirs4all-core'
import type { FittedPipeline, MaterializedDataset, PipelineDSL, PipelineStep, PredictResult, PredRow, RunOptions, RunResult } from './types'

const BACKEND_ID = 'nirs4all-core-wasm'
// Read compatibility for models/session bundles produced before the core rename.
const LEGACY_BACKEND_IDS = ['nirs4all-lite-wasm']
const PORTABLE_BACKEND_IDS = [BACKEND_ID, ...LEGACY_BACKEND_IDS]

interface PortableCoreState {
  backendId: string
  source: Record<string, unknown>
  result: {
    preprocessing: { type: string; params: number[] }[]
    model: PortablePlsModel
  }
}

export function isPortableCoreModel(model: FittedPipeline): boolean {
  const backendId = (model.state as { backendId?: unknown } | null | undefined)?.backendId
  return typeof backendId === 'string' && PORTABLE_BACKEND_IDS.includes(backendId)
}

export async function tryRunPortableCore(ds: MaterializedDataset, dsl: PipelineDSL, opts: RunOptions = {}): Promise<RunResult | null> {
  const source = toPortableSource(ds, dsl)
  if (!source) return null

  opts.onProgress?.({ phase: 'preprocess', pct: 3, message: 'running nirs4all-core portable pipeline' })
  const result = await runPortablePipeline(source, {
    X: ds.X,
    y: ds.y,
    rows: ds.nSamples,
    cols: ds.nFeatures,
  })
  const scoreIdx = result.split.testIndices
  if (result.selected.predictions.length !== scoreIdx.length) {
    throw new Error('nirs4all-core returned a prediction vector that does not match the scored split.')
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
    } as PortableCoreState,
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

export async function predictPortableCore(model: FittedPipeline, Xnew: Float64Array, nSamples: number, nFeatures: number): Promise<PredictResult> {
  const state = model.state as PortableCoreState
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
    const start = integerValue(sweep.from, undefined, 'n_components range start')
    const stop = integerValue(sweep.to, undefined, 'n_components range stop')
    const step = integerValue(sweep.step ?? 1, undefined, 'n_components range step')
    if (start < 1 || stop < 1) throw new RangeError('n_components range start and stop must be >= 1.')
    if (step < 1) throw new RangeError('n_components range step must be >= 1.')
    if (start > stop) throw new RangeError('n_components range start must be <= stop.')
    modelStep.param = 'n_components'
    modelStep._range_ = [start, stop, step]
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
  return integerValue(model.params.n_components ?? 2, undefined, 'n_components')
}

function integerValue(value: unknown, fallback: number | undefined, label: string): number {
  const raw = value ?? fallback
  const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be numeric.`)
  if (!Number.isInteger(number)) throw new RangeError(`${label} must be an integer.`)
  if (number < 1) throw new RangeError(`${label} must be >= 1.`)
  return number
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
