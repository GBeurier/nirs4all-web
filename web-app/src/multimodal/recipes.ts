import type { LabConfig, LabDataset, LabSource, LabStep, LabStrategy } from './types'

export const SOURCE_RECIPE_PARAM = 'source_composition_v1'
const PLS = 'models.pls.pls_regression'
const RIDGE = 'models.regularized.ridge'
export const NEURAL = 'models.neural.multibranch_regressor'
export const BLOCK_RMS = 'preprocessing.scaling.block_rms'
export interface SourceOperator {
  type: 'N4mSourcePipeline'
  sourceOps: Array<{ source_id: string; steps: LabStep[] }>
  sourceSchemas: Record<string, { representation: string; input_shape: number[]; feature_names: string[]; identity: string }>
  steps: LabStep[]
  hybrid: boolean
}
export interface RecipeDescription {
  operators: Record<string, SourceOperator>
  nodes: Array<{ id: string; sourceIds: string[]; inputName: string }>
  steps: unknown[]
  targetNode: string
  label: string
}
export const strategyLabel: Record<LabStrategy, string> = {
  single: 'One-source PLS baseline', early: 'Early feature concatenation → PLS',
  mbpls: 'MB-PLS (centered blocks, equal super weights)',
  late: 'Late fusion: fixed unweighted mean of source PLS predictions',
  stacking: 'Nested OOF source PLS/Ridge predictions → Ridge',
  hybrid: 'Transformed source features + nested OOF predictions → Ridge',
  mid: 'Jointly trained conv1d/dense/conv2d branches → learned regression head',
  'mid-stacking': 'Jointly trained multibranch network + source PLS/Ridge → nested OOF Ridge',
}

export function defaultLabConfig(dataset: LabDataset): LabConfig {
  return {
    caseId: dataset.caseId, sourceIds: dataset.sources.map(source => source.id), strategy: 'early',
    singleSourceId: dataset.sources[0]?.id ?? '',
    sourceChains: dataset.sources.map(source => ({ sourceId: source.id,
      steps: [{ methodId: 'preprocessing.scaling.standard_scale', params: { with_mean: true, with_std: true, ddof: 0 } }] })),
    nComponents: 3, ridgeAlpha: 1, blockScaling: false, baseModels: ['pls', 'ridge'],
    cnn: { filters: 4, kernel_size: 3, embedding_dim: 6, head_hidden: 8,
      epochs: 24, batch_size: 16, learning_rate: 0.003, weight_decay: 0.0001 },
    validation: { seed: '20261116', outerFolds: 3, innerFolds: 3, holdoutFraction: 0.2 },
  }
}

function sourceOperator(sources: LabSource[], config: LabConfig, head: LabStep, hybrid = false): SourceOperator {
  const sourceOps = sources.map(source => {
    const declarations = config.sourceChains.filter(chain => chain.sourceId === source.id)
    if (declarations.length !== 1) throw new Error(`Declare exactly one preprocessing chain for ${source.id}`)
    const steps = structuredClone(declarations[0].steps)
    if (source.modality !== 'spectroscopy' && steps.some(step => step.methodId.includes('.scatter.') || step.methodId.includes('.savitzky_golay'))) {
      throw new Error('Spectral SNV/SG preprocessing requires a spectroscopy source')
    }
    if (config.blockScaling) steps.push({ methodId: BLOCK_RMS, params: {} })
    return { source_id: source.id, steps }
  })
  return { type: 'N4mSourcePipeline', sourceOps, hybrid, steps: [head],
    sourceSchemas: Object.fromEntries(sources.map(source => [source.id, {
      representation: source.representation, input_shape: [...source.shape], feature_names: [...source.featureNames],
      identity: JSON.stringify({ source_id: source.id, representation: source.representation, shape: source.shape,
        feature_names: source.featureNames, axis: source.axis ?? null }),
    }])) }
}

export function describeRecipe(dataset: LabDataset, config: LabConfig): RecipeDescription {
  const selected = config.sourceIds.map(id => {
    const source = dataset.sources.find(source => source.id === id)
    if (!source) throw new Error(`Unknown selected source ${id}`)
    return source
  })
  const operators: Record<string, SourceOperator> = {}, nodes: RecipeDescription['nodes'] = []
  const baseHead = (family: 'pls' | 'ridge'): LabStep => family === 'pls' ?
    { methodId: PLS, params: { n_components: config.nComponents, center_x: true, scale_x: false, center_y: true, scale_y: false } } :
    { methodId: RIDGE, params: { alpha: config.ridgeAlpha, center_x: true, center_y: true, scale_x: false } }
  const neuralHead = (sources: LabSource[]): LabStep => ({ methodId: NEURAL, params: { ...config.cnn,
    branch_kinds: sources.map(source => source.modality === 'image' ? 2 : source.modality === 'genetics' ? 0 : 1),
    branch_shapes: sources.flatMap(source => source.modality === 'image' ? source.shape : [source.shape[0], 1, 1]),
    pool_size: 2, seed: BigInt.asIntN(64, BigInt(config.validation.seed)).toString() } })
  const model = (id: string, sources: LabSource[], head: LabStep, hybrid = false, inputName = 'x') => {
    const operator = sourceOperator(sources, config, head, hybrid)
    operators[id] = operator
    if (sources.length) nodes.push({ id, sourceIds: sources.map(source => source.id), inputName })
    // The complete source recipe is an immutable native node parameter. It is
    // explicitly reserved and never passed through as a numerical head param.
    return { kind: 'model', id, operator, params: { [SOURCE_RECIPE_PARAM]: operator } }
  }
  let steps: unknown[], targetNode = 'model:result'
  const name = config.strategy
  if (name === 'single') {
    const source = selected.find(source => source.id === config.singleSourceId)
    if (!source) throw new Error('The baseline source must belong to the selected source set')
    steps = [model(targetNode, [source], baseHead('pls'))]
  } else if (name === 'early' || name === 'mbpls' || name === 'mid') {
    const head = name === 'mid' ? neuralHead(selected) : name === 'mbpls' ?
      { methodId: 'models.multiblock.mb_pls', params: { n_components: config.nComponents } } : baseHead('pls')
    steps = [model(targetNode, selected, head)]
  } else {
    const branches: Array<{ id: string; steps: unknown[] }> = []
    for (let index = 0; index < selected.length; index++) {
      const source = selected[index]
      const families = name === 'late' ? ['pls' as const] : config.baseModels
      for (const family of families) {
        const id = `source-${index}-${family}`
        branches.push({ id, steps: [model(`model:${id}`, [source], baseHead(family))] })
      }
    }
    if (name === 'mid-stacking') branches.push({ id: 'mid', steps: [model('model:mid', selected, neuralHead(selected))] })
    if (branches.length < 2) throw new Error('Fusion/stacking requires at least two declared base branches')
    const branch = { kind: 'branch', branches }
    if (name === 'late') {
      targetNode = 'merge:mean'
      steps = [branch, { kind: 'merge', id: targetNode, merge_mode: 'fusion', output_as: 'predictions', include_original_data: false,
        metadata: { refit_prediction_partition: 'final' } }]
    } else {
      const hybrid = name === 'hybrid'
      const meta = model(targetNode, hybrid ? selected : [], baseHead('ridge'), hybrid, 'x_original')
      steps = [branch, { ...meta, kind: 'merge_model', include_original_data: hybrid,
        metadata: { stacking_oof_execution: 'nested_oof_v1', stacking_refit_oof: 'partitioned_inner_v1' } }]
    }
  }
  return { operators, nodes, steps, targetNode,
    label: strategyLabel[name] + (config.blockScaling ? '; Train-fitted block RMS scaling' : '') }
}
