import type { LabCandidateResult, LabConfig, LabDataset, LabMetricScope, LabProgress, LabRunResult, LabSource } from './types'
import { describeRecipe, pipelineSourceIds, pipelineStrategy, validatePipelineDocument } from './recipes'
import { loadLabRuntime, nativeJson, N4mWasmSourceController, SEED_TOKEN, stableJson } from './runtime'
import { loadHostModels, noteModelTask, takeModelSelections, withHostModels } from './hostModels'

type Json = Record<string, any>
interface FoldSet {
  id: string; sample_ids: string[]; sample_groups: Record<string, string>
  folds: Array<{ fold_id: string; train_sample_ids: string[]; validation_sample_ids: string[] }>
}
const assertLab = (condition: unknown, message: string): void => { if (!condition) throw new Error(message) }
const unique = (ids: string[]) => ids.length > 0 && ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length
const widthOf = (source: LabSource) => source.shape.reduce((n, width) => n * width, 1)

function validate(dataset: LabDataset, configs: LabConfig[]): void {
  assertLab(configs.length > 0 && configs.length <= 32, 'Select between one and 32 fixed candidate recipes')
  assertLab(unique(dataset.sampleIds) && dataset.sampleIds.length === dataset.target.values.length &&
    dataset.target.values.every(Number.isFinite), 'Training requires unique sample IDs and one finite target per sample')
  assertLab(unique(dataset.sources.map(source => source.id)), 'Dataset source IDs must be distinct')
  assertLab(!dataset.groupIds || dataset.groupIds.length === dataset.sampleIds.length && dataset.groupIds.every(id => id.length > 0), 'Declared groups must cover every sample')
  assertLab(!dataset.partitions || dataset.partitions.length === dataset.sampleIds.length && dataset.partitions.every(part => ['train', 'test'].includes(part)), 'Invalid declared partition inventory')
  const reference = configs[0]
  const usedSources = new Set<string>()
  for (const config of configs) {
    assertLab(config.caseId === dataset.caseId && unique(config.sourceIds) &&
      stableJson(config.validation) === stableJson(reference.validation) && stableJson(config.sourceIds) === stableJson(reference.sourceIds),
    'Every comparison candidate must share the selected source identities and validation protocol')
    nativeJson({}, config.validation.seed)
    assertLab(Number.isSafeInteger(config.validation.outerFolds) && config.validation.outerFolds >= 2 &&
      Number.isSafeInteger(config.validation.innerFolds) && config.validation.innerFolds >= 2, 'Outer and inner fold counts must be at least two')
    if (config.pipeline !== undefined) {
      const document = validatePipelineDocument(dataset, config.pipeline)
      pipelineSourceIds(document).forEach(id => usedSources.add(id))
      continue
    }
    config.sourceIds.forEach(id => usedSources.add(id))
    assertLab(Number.isSafeInteger(config.nComponents) && config.nComponents >= 1 && Number.isFinite(config.ridgeAlpha) && config.ridgeAlpha >= 0,
      'PLS components and Ridge alpha must be fixed admissible values')
    assertLab(config.baseModels.length > 0 && new Set(config.baseModels).size === config.baseModels.length &&
      config.baseModels.every(family => family === 'pls' || family === 'ridge'), 'Declare one or both supported base model families')
  }
  for (const id of usedSources) {
    const source = dataset.sources.find(source => source.id === id)
    assertLab(source, `Unknown selected source ${id}`)
    const value = source!
    assertLab(unique(value.sampleIds) && value.sampleIds.length === dataset.sampleIds.length &&
      dataset.sampleIds.every(id => value.sampleIds.includes(id)), `Source ${id} has incomplete or ambiguous identity coverage`)
    assertLab(value.shape.length > 0 && value.shape.every(width => Number.isSafeInteger(width) && width > 0) &&
      value.data instanceof Float64Array && value.data.length === value.sampleIds.length * widthOf(value) &&
      value.featureNames.length === widthOf(value) && unique(value.featureNames), `Source ${id} has inconsistent shape or feature names`)
    assertLab(!value.validity || value.validity.length === value.data.length && value.validity.every(observed => observed === 1),
      `Source ${id} contains missing values. This training profile requires complete data; no global imputation is applied.`)
    assertLab(value.data.every(Number.isFinite), `Source ${id} contains a nonfinite value; complete-data training refused`)
    const alignment = dataset.alignment.find(row => row.sourceId === id)
    assertLab(alignment && alignment.missing === 0 && alignment.refused === 0 && alignment.matched === dataset.sampleIds.length,
      `Source ${id} has unresolved IO alignment issues`)
  }
}

function cohorts(runtime: Awaited<ReturnType<typeof loadLabRuntime>>, dataset: LabDataset, config: LabConfig) {
  const { dag, fingerprint } = runtime, seed = config.validation.seed
  const groupMap = dataset.groupIds ? Object.fromEntries(dataset.sampleIds.map((id, index) => [id, dataset.groupIds![index]])) : {}
  const classOf = new Map(dataset.sampleIds.map((id, index) => [id, String(dataset.target.values[index])]))
  const categorical = dataset.target.kind === 'categorical'
  assertLab(!(categorical && dataset.groupIds), 'Grouped classification needs stratified group folds, which this laboratory does not schedule yet')
  const split = (samples: string[], count: number, id: string): FoldSet => {
    const groups = Object.fromEntries(samples.map(sample => [sample, groupMap[sample]]))
    // Classification folds are stratified by class (native), so every fit scope sees every class.
    if (categorical) return JSON.parse(dag.stratified_kfold_split_json(nativeJson({ n_splits: count, shuffle: true, seed: SEED_TOKEN }, seed),
      JSON.stringify(samples), JSON.stringify(Object.fromEntries(samples.map(sample => [sample, classOf.get(sample)]))), id))
    return JSON.parse(dataset.groupIds ? dag.group_kfold_split_json(JSON.stringify({ n_splits: count }), JSON.stringify(samples), JSON.stringify(groups), id) :
      dag.kfold_split_json(nativeJson({ n_splits: count, shuffle: true, seed: SEED_TOKEN }, seed), JSON.stringify(samples), id))
  }
  let calibrationIds: string[], holdoutIds: string[]
  if (dataset.partitions) {
    calibrationIds = dataset.sampleIds.filter((_, index) => dataset.partitions![index] === 'train')
    holdoutIds = dataset.sampleIds.filter((_, index) => dataset.partitions![index] === 'test')
  } else if (config.validation.holdoutFraction !== null && config.validation.holdoutFraction > 0) {
    const fraction = config.validation.holdoutFraction
    assertLab(Number.isFinite(fraction) && fraction > 0 && fraction <= 0.5, 'Held-out fraction must be in (0, 0.5] or zero/absent')
    // Native KFold/GroupKFold supplies the partition. The achieved grouped
    // fraction is reported by its actual sample counts, never repaired by rows.
    const holdout = split(dataset.sampleIds, Math.round(1 / fraction), 'lab:holdout').folds[0]
    calibrationIds = holdout.train_sample_ids; holdoutIds = holdout.validation_sample_ids
  } else { calibrationIds = [...dataset.sampleIds]; holdoutIds = [] }
  assertLab(calibrationIds.length > 0, 'A calibration cohort is required')
  if (dataset.groupIds) {
    const trainGroups = new Set(calibrationIds.map(id => groupMap[id]))
    assertLab(holdoutIds.every(id => !trainGroups.has(groupMap[id])), 'Declared groups cross calibration/test partitions')
  }
  const folds = split(calibrationIds, config.validation.outerFolds, 'lab:outer')
  return { calibrationIds, holdoutIds, folds, foldsFingerprint: fingerprint({ calibrationIds, holdoutIds, folds }) }
}

function envelopeFor(dataset: LabDataset, ids: string[], runtime: Awaited<ReturnType<typeof loadLabRuntime>>, inference = false): Json {
  const sources = dataset.sources
  const plan = { id: 'lab:source-matrices', output_representation: 'tabular_numeric', issues: [], steps: [
    ...sources.map(source => ({ kind: 'materialize', source_id: source.id, adapter_id: null,
      input_representation: null, output_representation: 'tabular_numeric', fit_scope: 'stateless',
      requires_user_choice: false, metadata: { output: `src:${source.id}`, original_representation: source.representation,
        shape: source.shape, layout: source.modality === 'image' ? 'HWC' : 'sample_feature' } })),
    { kind: 'join', source_id: null, adapter_id: null, input_representation: 'tabular_numeric',
      output_representation: 'tabular_numeric', fit_scope: 'stateless', requires_user_choice: false,
      metadata: { inputs: sources.map(source => `src:${source.id}`), output: 'port:X' } },
  ] }
  const sampleIndex = new Map(dataset.sampleIds.map((id, index) => [id, index]))
  const records = ids.flatMap(sampleId => sources.map(source => ({
    observation_id: `observation:${runtime.fingerprint([sampleId, source.id])}`, sample_id: sampleId,
    target_id: inference ? null : `target:${runtime.fingerprint([sampleId, dataset.target.name])}`,
    group_id: dataset.groupIds?.[sampleIndex.get(sampleId)!] ?? null, origin_sample_id: null,
    source_id: source.id, is_augmented: false,
  })))
  const relations = { records }
  return { schema_version: 1, schema_fingerprint: runtime.fingerprint(sources.map(source => ({ source_id: source.id,
    representation: source.representation, shape: source.shape, feature_names: source.featureNames, axis: source.axis ?? null }))),
    plan_fingerprint: runtime.fingerprint(plan), relation_fingerprint: runtime.dag.sample_relation_set_fingerprint_json(JSON.stringify(relations)),
    plan, coordinator_relations: relations,
    data_content_fingerprint: runtime.fingerprint({ dataset: dataset.fingerprint, ids, sources: sources.map(source => source.id) }),
    target_content_fingerprint: inference ? null : runtime.fingerprint(ids.map(id => [id, dataset.target.values[sampleIndex.get(id)!]])),
    metadata: { io_dataset_fingerprint: dataset.fingerprint, provenance: dataset.provenance } }
}

function binding(nodeId: string, inputName: string, sources: string[], envelope: Json): Json {
  return { node_id: nodeId, input_name: inputName, request_id: envelope.plan.id,
    schema_fingerprint: envelope.schema_fingerprint, plan_fingerprint: envelope.plan_fingerprint,
    relation_fingerprint: envelope.relation_fingerprint, output_representation: 'tabular_numeric', feature_set_id: 'x',
    source_ids: sources, require_relations: true, view_policy: {
      fit_partition: 'fold_train', predict_partition: 'fold_validation', include_augmented_train: false,
      include_augmented_validation: false, include_excluded: false, require_sample_ids: true,
    }, metadata: {} }
}

function metricScope(runtime: Awaited<ReturnType<typeof loadLabRuntime>>, dataset: LabDataset, prediction: Json,
  scope: 'oof' | 'holdout', folds?: FoldSet): LabMetricScope {
  const byId = new Map(dataset.sampleIds.map((id, index) => [id, dataset.target.values[index]]))
  const sampleIds: string[] = prediction.sample_ids ?? prediction.unit_ids.map((unit: Json) => unit.id)
  assertLab(unique(sampleIds) && prediction.values.length === sampleIds.length, 'Native prediction identities are incomplete')
  const block = { producer_node: prediction.producer_node, partition: scope === 'oof' ? 'validation' : 'test', fold_id: null,
    sample_ids: sampleIds, values: prediction.values, target_names: [dataset.target.name] }
  const target = { level: 'sample', unit_ids: sampleIds.map(id => ({ level: 'sample', id })),
    values: sampleIds.map(id => { assertLab(byId.has(id), 'Prediction references unknown sample'); return [byId.get(id)!] }), target_names: [dataset.target.name] }
  const categorical = dataset.target.kind === 'categorical'
  const score = (selected: number[]) => {
    const p = { ...block, sample_ids: selected.map(index => sampleIds[index]), values: selected.map(index => prediction.values[index]) }
    const t = { ...target, unit_ids: selected.map(index => target.unit_ids[index]), values: selected.map(index => target.values[index]) }
    if (categorical) {
      // Owner classification metrics on class ids; no residual or variance-based metric applies.
      const report = JSON.parse(runtime.dag.score_regression_prediction_block_json(JSON.stringify(p), JSON.stringify(t), '["accuracy","balanced_accuracy","f1"]'))
      return { n: report.row_count as number, rmse: NaN, mae: NaN, r2: null, accuracy: report.metrics.accuracy as number,
        balancedAccuracy: report.metrics.balanced_accuracy as number, f1: report.metrics.f1 as number, undefinedReasons: {} as Record<string, string> }
    }
    const report = JSON.parse(runtime.dag.score_regression_prediction_block_json(JSON.stringify(p), JSON.stringify(t), '["rmse","mae"]'))
    const profile = JSON.parse(runtime.dag.score_regression_prediction_block_with_profile_json(JSON.stringify(p), JSON.stringify(t),
      '"regression_report.population_rmse_ratios.v1"'))
    return { n: report.row_count as number, rmse: report.metrics.rmse as number, mae: report.metrics.mae as number,
      r2: (profile.metrics.r2 ?? null) as number | null, undefinedReasons: (profile.undefined_metrics ?? {}) as Record<string, string> }
  }
  const all = sampleIds.map((_, index) => index), metrics = score(all)
  const foldById = new Map(folds?.folds.flatMap(fold => fold.validation_sample_ids.map(id => [id, fold.fold_id] as const)))
  return { scope, ...metrics, rows: sampleIds.map((id, index) => ({ sampleId: id, observed: byId.get(id)!,
    predicted: prediction.values[index][0], residual: categorical ? 0 : byId.get(id)! - prediction.values[index][0],
    ...(foldById.has(id) ? { foldId: foldById.get(id)! } : {}) })),
    perFold: folds?.folds.map(fold => { const members = new Set(fold.validation_sample_ids)
      return { foldId: fold.fold_id, ...score(all.filter(index => members.has(sampleIds[index]))) } }) ?? [] }
}

export async function executeLab(dataset: LabDataset, configs: LabConfig[], onProgress?: (progress: LabProgress) => void): Promise<LabRunResult> {
  const started = performance.now()
  validate(dataset, configs)
  const native = await loadLabRuntime()
  // Host JavaScript models (random forest, TF.js CNN) are loaded only when a recipe uses them.
  const heads = configs.flatMap(config => config.pipeline ? [...config.pipeline.branches.map(branch => branch.head.methodId), config.pipeline.merge.head.methodId] : [])
  const hostVersions = await loadHostModels(heads)
  const runtime = { ...native, methods: withHostModels(native.methods), ownerVersions: { ...native.ownerVersions, ...hostVersions } }
  const { dag, methods, hash, fingerprint } = runtime
  const protocol = cohorts(runtime, dataset, configs[0]), seed = configs[0].validation.seed
  const trainingEnvelope = envelopeFor(dataset, protocol.calibrationIds, runtime)
  const sourceRows = new Map(dataset.sources.map(source => [source.id, new Map(source.sampleIds.map((id, index) => [id, index]))]))
  const targetRows = new Map(dataset.sampleIds.map((id, index) => [id, index]))
  const candidates: LabCandidateResult[] = [], refusals: LabRunResult['refusals'] = []
  for (let candidateIndex = 0; candidateIndex < configs.length; candidateIndex++) {
    const config = configs[candidateIndex], strategy = config.pipeline ? pipelineStrategy(config.pipeline) : config.strategy
    const candidateId = config.pipeline ? `pipeline:${fingerprint(config.pipeline)}` : strategy === 'single' ? `single:${config.singleSourceId}` : strategy
    const reportProgress = (phase: string, message: string, nodeId?: string, foldId?: string | null) =>
      onProgress?.({ candidateIndex, candidateCount: configs.length, strategy, phase, message, nodeId, foldId })
    reportProgress('COMPILE', 'Compiling the current native pipeline')
    const begun = performance.now()
    takeModelSelections()
    let controller: N4mWasmSourceController | undefined
    try {
      const description = describeRecipe(dataset, config)
      controller = new N4mWasmSourceController({ methods, operators: description.operators, digest: hash,
        targetNames: [dataset.target.name],
        ...(dataset.target.kind === 'categorical' ? { task: 'classification' as const, classLabels: dataset.target.classes ?? [] } : {}),
        resolveSource: ({ sourceId, sampleIds }) => {
          const source = dataset.sources.find(source => source.id === sourceId)!
          const lookup = sourceRows.get(sourceId)!, width = widthOf(source), data = new Float64Array(sampleIds.length * width)
          sampleIds.forEach((id, row) => { const index = lookup.get(id); assertLab(index !== undefined, `Unknown source identity ${id}`)
            data.set(source.data.subarray(index! * width, (index! + 1) * width), row * width) })
          return { sampleIds: [...sampleIds], matrix: { data, rows: sampleIds.length, cols: width }, featureNames: [...source.featureNames] }
        },
        resolveTargets: ({ sampleIds }) => ({ sampleIds: [...sampleIds], matrix: {
          data: Float64Array.from(sampleIds, id => { assertLab(targetRows.has(id), `Unknown target identity ${id}`); return dataset.target.values[targetRows.get(id)!] }),
          rows: sampleIds.length, cols: 1 } }),
        onTask: task => { noteModelTask(task); reportProgress(task.phase, 'Native DAG task executing', task.nodeId, task.foldId) },
      })
      const manifests: Json[] = [controller.manifest(dag)]
      if (description.targetNode === 'merge:mean') manifests.push(JSON.parse(dag.derive_controller_manifest_json(JSON.stringify({
        controller_id: 'controller:native.prediction-merge', controller_version: '1.0.0',
        operator_kind: 'prediction_join', added_capabilities: ['consumes_oof_predictions', 'emits_predictions'],
      }))))
      const policy = { split_unit: dataset.groupIds ? 'group' : 'sample', forbid_origin_cross_fold: true,
        allow_observation_split_with_shared_target: false, require_group_ids: Boolean(dataset.groupIds), unsafe_flags: [] }
      const bindings = description.nodes.map(node => binding(node.id, node.inputName, node.sourceIds, trainingEnvelope))
      const categorical = dataset.target.kind === 'categorical'
      // Inner (stacking) folds are stratified by the calibration labels only; held-out labels never enter.
      const strata = categorical ? Object.fromEntries(protocol.calibrationIds.map(id => [id, String(dataset.target.values[targetRows.get(id)!])])) : null
      const dsl = { id: `dsl:lab.${candidateIndex}`, campaign_id: `campaign:lab.${candidateIndex}`,
        input: { name: 'x', representation: 'tabular_numeric' }, root_seed: SEED_TOKEN, leakage_policy: policy,
        inner_cv: strata ? { kind: 'stratified_kfold', n_splits: config.validation.innerFolds, shuffle: true, seed: SEED_TOKEN, strata } :
          dataset.groupIds ? { kind: 'group_kfold', n_splits: config.validation.innerFolds } :
          { kind: 'kfold', n_splits: config.validation.innerFolds, shuffle: true, seed: SEED_TOKEN },
        split_invocation: { id: 'split:lab.outer', controller_id: null, leakage_policy: policy, params: {}, fold_set: protocol.folds },
        data_bindings: bindings, steps: description.steps }
      const compiled = JSON.parse(dag.compile_pipeline_dsl_artifact_with_controllers_json(nativeJson(dsl, seed), JSON.stringify(manifests)))
      // Parsed u64 numbers are replaced from the independently retained decimal
      // seed before being sent back to the owner; no rounded Number is reused.
      compiled.campaign_template.root_seed = SEED_TOKEN
      if (['kfold', 'stratified_kfold'].includes(compiled.campaign_template.inner_cv?.kind)) compiled.campaign_template.inner_cv.seed = SEED_TOKEN
      const request = { schema_version: 1, request_id: `training:lab.${candidateIndex}`, plan_id: `plan:lab.${candidateIndex}`,
        graph: compiled.graph, campaign: compiled.campaign_template, controller_manifests: manifests,
        data_identities: bindings.map(value => JSON.parse(dag.training_data_identity_json(JSON.stringify(value), JSON.stringify(trainingEnvelope))))
          .sort((a, b) => a.requirement_key.localeCompare(b.requirement_key)),
        parameter_patches: [], patch_policies: [], influence_requirements: [], request_fingerprint: '0'.repeat(64),
        options: { refit: true, refit_strategy: 'refit_one', seed: SEED_TOKEN,
          selection: { id: 'selection:fixed', metric: categorical ? { name: 'balanced_accuracy', objective: 'maximize' } : { name: 'rmse', objective: 'minimize' },
            require_finite: true, evaluation_scope: 'oof' },
          selection_output_id: 'output:prediction', outputs: [{ output_id: 'output:prediction', node_id: description.targetNode,
            ...(categorical ? { port_name: description.targetNode === 'merge:mean' ? 'prediction' : 'oof' } : {}),
            prediction_level: 'sample', unit_level: 'physical_sample', prediction_kind: categorical ? 'class_label' : 'regression_point',
            target_names: [dataset.target.name], target_units: [categorical ? null : dataset.target.unit || null],
            class_labels: [categorical ? dataset.target.classes ?? [] : []], output_order: 'target_order', target_space: 'raw' }],
          scheduler: { kind: 'sequential', backend: null, workers: 1 }, resources: { cpu_threads: 1, memory_bytes: null, gpu_devices: [], wall_time_ms: null },
          artifacts: { cv_artifacts: 'discard', prediction_caches: 'retain', fitted_artifacts: 'portable_required' } } }
      const signed = dag.sign_training_request_json(nativeJson(request, seed))
      const envelopes = Object.fromEntries(bindings.map(value => [`${value.node_id}.${value.input_name}`, trainingEnvelope]))
      const callback = controller.callback
      const invoke = (owner: string, task: string, exactSeed?: string | null) => {
        if (owner === 'controller:native.prediction-merge') throw new Error('The native fixed-mean merge unexpectedly requested a host reducer')
        return callback(owner, task, exactSeed)
      }
      const capture = JSON.parse(dag.execute_training_json(signed, JSON.stringify(envelopes), JSON.stringify(trainingEnvelope.coordinator_relations),
        `package:lab.${candidateIndex}`, `outcome:lab.${candidateIndex}`, `run:lab.${candidateIndex}`, `bundle:lab.${candidateIndex}`, invoke))
      const outcome = JSON.parse(capture.training_outcome_json)
      // The report-grade OOF label block of the output node (never its auxiliary probability port).
      const labelBlocks = outcome.oof_averages.filter((block: Json) => block.predictions.producer_node === description.targetNode &&
        (block.predictions.producer_port ?? 'oof') !== 'probabilities')
      const averaged = labelBlocks.find((block: Json) => block.predictions.fold_id === 'avg') ?? labelBlocks[0]
      assertLab(averaged, 'Native training produced no report-grade OOF predictions for this output')
      const oof = metricScope(runtime, dataset, averaged.predictions, 'oof', protocol.folds)
      assertLab(oof.n === protocol.calibrationIds.length && protocol.calibrationIds.every(id => oof.rows.some(row => row.sampleId === id)), 'Native OOF output does not cover calibration identities exactly')
      let holdout: LabMetricScope | null = null
      if (protocol.holdoutIds.length) {
        reportProgress('PREDICT', 'Replaying the fitted native package on retained test identities')
        const inference = envelopeFor(dataset, protocol.holdoutIds, runtime, true)
        const predictEnvelope = JSON.parse(dag.attach_predict_cohort_to_envelope_json(JSON.stringify(trainingEnvelope), JSON.stringify({
          role: 'inference', target_names: [dataset.target.name], data_content_fingerprint: inference.data_content_fingerprint,
          target_content_fingerprint: null, relations: inference.coordinator_relations,
        })))
        const predictEnvelopes = Object.fromEntries(Object.keys(envelopes).map(key => [key, predictEnvelope]))
        const packageView = JSON.parse(capture.portable_predictor_package_json)
        const replayRequest = dag.sign_training_replay_request_json(JSON.stringify({ schema_version: 1, request_id: `replay:lab.${candidateIndex}`,
          source_outcome_fingerprint: packageView.training_outcome.outcome_fingerprint, phase: 'PREDICT',
          data_envelope_keys: Object.keys(predictEnvelopes).sort(), output_binding_ids: ['output:prediction'], request_fingerprint: '0'.repeat(64) }))
        const replay = JSON.parse(dag.replay_training_package_json(capture.portable_predictor_package_json, replayRequest,
          JSON.stringify(predictEnvelopes), JSON.stringify(manifests), `outcome:lab.${candidateIndex}.test`, `run:lab.${candidateIndex}.test`, invoke))
        const prediction = replay.outputs.find((output: Json) => output.binding.binding_id === 'output:prediction')?.predictions?.[0]
        assertLab(prediction, 'Native package replay produced no retained-test output')
        holdout = metricScope(runtime, dataset, prediction, 'holdout')
        assertLab(holdout.n === protocol.holdoutIds.length && protocol.holdoutIds.every(id => holdout!.rows.some(row => row.sampleId === id)), 'Retained-test prediction identities differ')
      }
      candidates.push({ id: candidateId, strategy, label: description.label, dataFingerprint: dataset.fingerprint,
        recipe: { config, dsl }, recipeFingerprint: fingerprint({ config, operators: description.operators }), foldsFingerprint: protocol.foldsFingerprint,
        hyperparameters: 'fixed', ownerVersions: runtime.ownerVersions, elapsedMs: performance.now() - begun, oof, holdout,
        diagnostics: controller.audit, modelSelections: takeModelSelections(), warnings: outcome.warnings ?? [], portablePackageJson: capture.portable_predictor_package_json })
      reportProgress('COMPLETE', 'Candidate completed with native OOF and refit provenance')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      refusals.push({ candidateId, strategy, reason: message })
      reportProgress('REFUSED', message)
    } finally { controller?.close() }
  }
  return { dataFingerprint: dataset.fingerprint, configs: structuredClone(configs), configFingerprint: fingerprint(configs),
    foldsFingerprint: protocol.foldsFingerprint, calibrationIds: protocol.calibrationIds, holdoutIds: protocol.holdoutIds,
    folds: protocol.folds, candidates, refusals, validation: { ...configs[0].validation }, ownerVersions: runtime.ownerVersions,
    elapsedMs: performance.now() - started, warnings: ['Fixed a priori hyperparameters. Comparisons after interactive changes are exploratory.',
      ...(!dataset.partitions && protocol.holdoutIds.length ? ['Native grouped/fold holdout uses the achieved sample count shown in this result.'] : [])] }
}
