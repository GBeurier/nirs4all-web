import type { LabConfig, LabDataset, LabPipelineBranch, LabPipelineDocument, LabPipelinePreset, LabSource, LabStep, LabStrategy } from './types'

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

function describeLegacyRecipe(dataset: LabDataset, config: LabConfig): RecipeDescription {
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

const HEADS = new Set([PLS, RIDGE, 'models.multiblock.mb_pls', NEURAL])
const META_HEADS = new Set([PLS, RIDGE])
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
function insist(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function fields(value: Record<string, unknown>, names: string[], context: string): void {
  insist(Object.keys(value).every(key => names.includes(key)), `${context} contains unsupported fields`)
}
function validateStep(value: unknown, heads?: Set<string>): asserts value is LabStep {
  insist(object(value), 'Every operation requires a methodId and parameter object')
  fields(value, ['methodId', 'params'], 'Operation')
  insist(typeof value.methodId === 'string' && value.methodId.length > 0 && (!heads || heads.has(value.methodId)),
    'Unsupported model or missing native method ID')
  insist(object(value.params) && Object.values(value.params).every(param => typeof param === 'string' || typeof param === 'boolean' ||
    typeof param === 'number' && Number.isFinite(param)),
  'Operation parameters must be finite primitive values; native network geometry is derived from the selected sources')
  const params = value.params
  if (value.methodId === NEURAL) insist(!['branch_kinds', 'branch_shapes', 'seed'].some(key => Object.hasOwn(params, key)),
    'Network branch geometry and task seeds are derived by the host/native controller; remove these low-level parameters')
}

/** Import boundary only. Native manifests and Methods remain authoritative for roles and parameters. */
export function validatePipelineDocument(dataset: LabDataset, value: unknown): LabPipelineDocument {
  insist(object(value), 'A pipeline document is required')
  fields(value, ['label', 'branches', 'merge'], 'Pipeline document')
  insist(typeof value.label === 'string' && value.label.trim().length > 0, 'Give the pipeline a label')
  insist(Array.isArray(value.branches) && value.branches.length > 0, 'Add at least one prediction branch')
  insist(object(value.merge), 'Declare how branch predictions are combined')
  fields(value.merge, ['kind', 'head', 'sourceIds', 'sourceChains'], 'Merge')
  insist(['none', 'mean', 'model'].includes(String(value.merge.kind)), 'Unsupported merge kind')
  const known = new Set(dataset.sources.map(source => source.id))
  const validateInputs = (input: Record<string, unknown>, allowEmpty: boolean) => {
    insist(Array.isArray(input.sourceIds) && (allowEmpty || input.sourceIds.length > 0) &&
      input.sourceIds.every(id => typeof id === 'string' && known.has(id)) && new Set(input.sourceIds).size === input.sourceIds.length,
    'Select distinct existing dataset sources for every prediction branch')
    insist(Array.isArray(input.sourceChains) && input.sourceChains.length === input.sourceIds.length,
      'Declare exactly one preprocessing chain per selected source')
    const seen = new Set<string>()
    for (const chain of input.sourceChains) {
      insist(object(chain), 'Invalid source preprocessing chain')
      fields(chain, ['sourceId', 'steps'], 'Source chain')
      insist(typeof chain.sourceId === 'string' && input.sourceIds.includes(chain.sourceId) && !seen.has(chain.sourceId),
        'Source chains must match the selected sources without duplicates')
      seen.add(chain.sourceId)
      insist(Array.isArray(chain.steps), 'Source preprocessing must be an ordered list')
      chain.steps.forEach(step => validateStep(step))
    }
  }
  const ids = new Set<string>()
  for (const branch of value.branches) {
    insist(object(branch), 'Invalid prediction branch')
    fields(branch, ['id', 'label', 'sourceIds', 'sourceChains', 'head'], 'Prediction branch')
    insist(typeof branch.id === 'string' && branch.id.length > 0 && !ids.has(branch.id), 'Branch IDs must be nonempty and unique')
    ids.add(branch.id)
    insist(typeof branch.label === 'string' && branch.label.trim().length > 0, 'Give every branch a label')
    validateInputs(branch, false)
    validateStep(branch.head, HEADS)
  }
  validateInputs(value.merge, true)
  validateStep(value.merge.head, META_HEADS)
  insist(value.merge.kind === 'none' ? value.branches.length === 1 : value.branches.length >= 2,
    'No merge requires exactly one branch; mean or learned merging requires at least two branches')
  insist(value.merge.kind === 'model' || (value.merge.sourceIds as unknown[]).length === 0,
    'Raw merge inputs require a learned meta-model; remove them explicitly for a fixed mean or no merge')
  // The document contains no executable code or fitted state. Clone at the host boundary.
  return structuredClone(value) as unknown as LabPipelineDocument
}

export function pipelineSourceIds(document: LabPipelineDocument): string[] {
  return [...new Set([...document.branches.flatMap(branch => [...branch.sourceIds]), ...document.merge.sourceIds])]
}

/** Presentation category only: this value never chooses executable graph structure. */
export function pipelineStrategy(document: LabPipelineDocument): LabStrategy {
  if (document.merge.kind === 'mean') return 'late'
  if (document.merge.kind === 'model') return document.merge.sourceIds.length ? 'hybrid' :
    document.branches.some(branch => branch.head.methodId === NEURAL) ? 'mid-stacking' : 'stacking'
  const branch = document.branches[0]
  return branch.head.methodId === NEURAL ? 'mid' : branch.head.methodId === 'models.multiblock.mb_pls' ? 'mbpls' :
    branch.sourceIds.length === 1 ? 'single' : 'early'
}

function documentFromLegacy(dataset: LabDataset, config: LabConfig): LabPipelineDocument {
  const recipe = describeLegacyRecipe(dataset, config)
  const input = (operator: SourceOperator) => ({ sourceIds: operator.sourceOps.map(source => source.source_id),
    sourceChains: operator.sourceOps.map(source => ({ sourceId: source.source_id, steps: structuredClone(source.steps) })) })
  const head = (operator: SourceOperator): LabStep => {
    const result = structuredClone(operator.steps[0])
    if (result.methodId === NEURAL) {
      delete result.params.branch_kinds; delete result.params.branch_shapes; delete result.params.seed
    }
    return result
  }
  const learned = recipe.steps.some(step => (step as { kind: string }).kind === 'merge_model')
  const mean = recipe.targetNode === 'merge:mean'
  const operators = Object.entries(recipe.operators).filter(([id]) => !learned || id !== recipe.targetNode)
  const branches = operators.map(([id, operator]) => ({ id: id.slice('model:'.length),
    label: id === 'model:result' ? recipe.label : id.slice('model:'.length), ...input(operator), head: head(operator) }))
  const meta = learned ? recipe.operators[recipe.targetNode] : null
  return validatePipelineDocument(dataset, { label: recipe.label, branches, merge: { kind: learned ? 'model' : mean ? 'mean' : 'none',
    head: meta ? head(meta) : { methodId: RIDGE, params: { alpha: config.ridgeAlpha, center_x: true, center_y: true, scale_x: false } },
    ...(meta ? input(meta) : { sourceIds: [], sourceChains: [] }) } })
}

/** Each preset is a fresh editable document; loading it is an explicit host action. */
export function createPipelinePresets(dataset: LabDataset, config: LabConfig): LabPipelinePreset[] {
  const candidates: Array<{ strategy: LabStrategy; singleSourceId?: string }> = [
    ...config.sourceIds.map(singleSourceId => ({ strategy: 'single' as const, singleSourceId })),
    ...(['early', 'mbpls', 'late', 'stacking', 'hybrid', 'mid', 'mid-stacking'] as const).map(strategy => ({ strategy })),
  ]
  return candidates.filter(candidate => candidate.strategy === 'late' ? config.sourceIds.length >= 2 :
    candidate.strategy === 'stacking' || candidate.strategy === 'hybrid' ? config.sourceIds.length * config.baseModels.length >= 2 : true)
    .map(candidate => {
      const preset = { ...config, pipeline: undefined, strategy: candidate.strategy,
        singleSourceId: candidate.singleSourceId ?? config.singleSourceId }
      const document = documentFromLegacy(dataset, preset)
      return { id: candidate.strategy === 'single' ? `single:${preset.singleSourceId}` : candidate.strategy,
        label: candidate.strategy === 'single' ? `${strategyLabel.single}: ${dataset.sources.find(source => source.id === preset.singleSourceId)?.label ?? preset.singleSourceId}` : document.label,
        description: 'Load this editable source/transform/model composition; validation settings stay unchanged.',
        strategy: candidate.strategy, document }
    })
}

function describeDocument(dataset: LabDataset, config: LabConfig): RecipeDescription {
  const document = validatePipelineDocument(dataset, config.pipeline)
  const operators: Record<string, SourceOperator> = {}, nodes: RecipeDescription['nodes'] = []
  const model = (id: string, input: Pick<LabPipelineBranch, 'sourceIds' | 'sourceChains' | 'head'>, hybrid = false) => {
    const sources = input.sourceIds.map(sourceId => dataset.sources.find(source => source.id === sourceId)!)
    const head: LabStep = structuredClone(input.head)
    if (head.methodId === NEURAL) head.params = { ...head.params,
      branch_kinds: sources.map(source => source.modality === 'image' ? 2 : source.modality === 'genetics' ? 0 : 1),
      branch_shapes: sources.flatMap(source => source.modality === 'image' ? source.shape : [source.shape[0], 1, 1]),
      pool_size: head.params.pool_size ?? 2, seed: BigInt.asIntN(64, BigInt(config.validation.seed)).toString() }
    const localConfig: LabConfig = { ...config, blockScaling: false,
      sourceChains: input.sourceChains.map(chain => ({ sourceId: chain.sourceId, steps: structuredClone([...chain.steps]) })) }
    const operator = sourceOperator(sources, localConfig, head, hybrid)
    operators[id] = operator
    if (sources.length) nodes.push({ id, sourceIds: sources.map(source => source.id), inputName: hybrid ? 'x_original' : 'x' })
    return { kind: 'model', id, operator, params: { [SOURCE_RECIPE_PARAM]: operator } }
  }
  let steps: unknown[], targetNode = 'model:result'
  if (document.merge.kind === 'none') steps = [model(targetNode, document.branches[0])]
  else {
    // Preserve qualified preset IDs/seeds, and escape the reserved output namespace
    // injectively when an edited branch is named result or already uses branch:.
    const nodeId = (id: string) => `model:${id === 'result' || id.startsWith('branch:') ? 'branch:' : ''}${id}`
    const branch = { kind: 'branch', branches: document.branches.map(input => ({ id: input.id, steps: [model(nodeId(input.id), input)] })) }
    if (document.merge.kind === 'mean') {
      targetNode = 'merge:mean'
      steps = [branch, { kind: 'merge', id: targetNode, merge_mode: 'fusion', output_as: 'predictions', include_original_data: false,
        metadata: { refit_prediction_partition: 'final' } }]
    } else {
      const hybrid = document.merge.sourceIds.length > 0
      steps = [branch, { ...model(targetNode, document.merge, hybrid), kind: 'merge_model', include_original_data: hybrid,
        metadata: { stacking_oof_execution: 'nested_oof_v1', stacking_refit_oof: 'partitioned_inner_v1' } }]
    }
  }
  return { operators, nodes, steps, targetNode, label: document.label }
}

export function describeRecipe(dataset: LabDataset, config: LabConfig): RecipeDescription {
  return config.pipeline === undefined ? describeLegacyRecipe(dataset, config) : describeDocument(dataset, config)
}
