import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import {
  createConformalGuaranteeViewForArtifact,
  createConformalIntervalSummaryRows,
  parseCalibratedRunResultArtifact,
} from 'nirs4all-ui/conformal'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import {
  createKeywordRegistryFormSections,
  getKeywordRegistryValueOptions,
  parseKeywordRegistryDocument,
  resolveKeywordRegistryEntry,
} from 'nirs4all-ui/keywordRegistry'
import {
  createRobustnessGuaranteeView,
  createRobustnessSummaryCards,
  getRobustnessSpectralReplay,
  parseRobustnessSummaryArtifact,
  ROBUSTNESS_SUMMARY_FORMAT,
} from 'nirs4all-ui/robustness'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'
import {
  createTuningSearchSpacePreview,
  createTuningSummaryCard,
  createTuningSummaryTrialRows,
  parseOrderedTuningSearchSpaceArtifact,
  parseTuningSummaryArtifact,
} from 'nirs4all-ui/tuning'
import {
  artifactContracts,
  capabilityManifest,
  predictPortablePipeline,
  requiredKeywordRegistryEntries,
  runPortablePipeline,
  runtimeContracts,
  type PortableExecutionResult,
  type PortableMatrixDataset,
  type PortablePredictionResult,
  type PipelineDefinition,
} from 'nirs4all'

export interface CustomHostState {
  artifactContractCount: number
  artifactContractIds: string
  conformalCoverageLabel: string
  conformalIntervalCount: number
  conformalStatus: string
  conformalTuningCalibrationLabel: string
  controllerCount: number
  datasetTitle: string
  engineLabel: string
  keywordEngineOptions: string
  keywordRequiredRegistryEntryCount: number
  keywordRequiredRegistryEntries: string
  keywordRegistrySectionCount: number
  predictSurface: string
  robustnessGuaranteeCoverageLabel: string
  robustnessGuaranteeStatus: string
  robustnessReplaySource: string
  robustnessStatus: string
  runtimeLabel: string
  sampleCount: number
  tuningBestValue: string
  tuningCompleteTrials: number
  tuningPruner: string
  tuningResume: string
  tuningSampler: string
  tuningSeed: string
  tuningSpaceForcedParameters: number
  tuningSpaceParameters: number
  tuningSpaceSchema: string
  tuningStorageConfigured: string
  tuningTrialCount: number
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

function createDemoKeywordRegistry() {
  return parseKeywordRegistryDocument({
    entries: [
      {
        aliases: [{ canonical: 'engine', kind: 'token', mode: 'read_only', name: 'backend' }],
        canonical_term: 'execution_backend',
        changes: ['execution_backend'],
        docs_anchor: 'execution-engine-versus-optimizer-engine',
        engine_support: { 'dag-ml': 'partial', legacy: 'supported' },
        id: 'run.engine',
        invalidates_calibration: 'if_predictor_changes',
        lifecycle_stage: 'execution',
        path: 'run.engine',
        reads: [],
        scope: 'pipeline_execution',
        status: 'supported',
        summary: 'Selects the pipeline execution backend.',
        surface: 'run_argument',
        token: 'engine',
        ui: { control: 'select', group: 'execution', label: 'Execution backend', order: 10 },
        value_schema: { enum: [null, 'legacy', 'dag-ml', 'dual'], type: ['string', 'null'] },
      },
    ],
    registry_version: '1.0.0',
    schema_id: 'https://nirs4all.org/schemas/keyword-effects/v1',
    schema_version: 1,
    scope: 'lifecycle-v1',
  })
}

function createDemoConformalArtifact() {
  return parseCalibratedRunResultArtifact({
    artifact: {
      calibration_size: 6,
      qhat_by_coverage: [
        { coverage: 0.8, qhat: 0.18 },
        { coverage: 0.9, qhat: 0.25 },
      ],
      spec: {
        coverage: [0.8, 0.9],
        group_by: [],
        method: 'split_absolute_residual',
        multi_target: 'marginal',
        unit: 'physical_sample',
      },
    },
    fingerprint: 'custom-host-conformal-demo',
    metadata: {
      conformal_guarantee_status: {
        artifact_fingerprint: 'custom-host-conformal-artifact',
        calibrated_coverages: [0.8, 0.9],
        calibration_data_fingerprint: 'custom-host-calibration-data',
        coverage: [0.8, 0.9],
        effective_engine: 'nirs4all.conformal.v1',
        guarantee: 'split_conformal_marginal_coverage',
        invalidation_reasons: [],
        limitations: [
          'finite-sample marginal coverage requires exchangeable calibration and prediction samples',
        ],
        method: 'split_absolute_residual',
        multi_target: 'marginal',
        predictor_fingerprint: null,
        requested_engine: 'nirs4all.conformal.v1',
        scope: 'finite_sample_marginal_exchangeability',
        source_calibrated_result_fingerprint: null,
        status: 'active',
        unit: 'physical_sample',
        version: 1,
      },
      calibration_replay_source: {
        dataset_backed: true,
        kind: 'dataset_predictor_bundle',
        predictor_bundle: 'custom-host-model.n4a',
        requires_model_replay: true,
        route: 'nirs4all.predict',
        version: 1,
      },
      tuning_calibration_source: {
        score_data_role: 'hpo_objective_only',
        score_data_used: false,
        source: 'tuning.winner',
      },
    },
    prediction: {
      intervals: [
        { coverage: 0.8, lower: [0.82, 0.95], qhat: 0.18, upper: [1.18, 1.31] },
        { coverage: 0.9, lower: [0.75, 0.88], qhat: 0.25, upper: [1.25, 1.38] },
      ],
      method: 'split_absolute_residual',
      unit: 'physical_sample',
      y_pred: [1.0, 1.13],
    },
    sample_ids: ['prediction-001', 'prediction-002'],
    version: 1,
  })
}

function createDemoTuningArtifact() {
  return parseTuningSummaryArtifact({
    best_params: { n_components: 2 },
    best_value: 0.03125,
    direction: 'minimize',
    engine: 'optuna',
    fingerprint: 'custom-host-tuning-demo',
    format: 'nirs4all.tuning.summary',
    metric: 'rmse',
    n_trials: 3,
    optimizer: 'optuna',
    persistence: {
      optimizer_state_resume_supported: true,
      resume: true,
      storage_configured: true,
      study_name: 'custom-host-study',
    },
    pruner: 'median',
    sampler: 'grid',
    schema_version: 1,
    seed: 42,
    trial_states: { COMPLETE: 2, PRUNED: 1 },
    trials: [
      {
        number: 0,
        state: 'COMPLETE',
        value: 0.044,
      },
      {
        number: 1,
        state: 'COMPLETE',
        value: 0.03125,
      },
      {
        number: 2,
        state: 'PRUNED',
        value: null,
      },
    ],
    version: 1,
  })
}

function createDemoTuningSearchSpaceArtifact() {
  return parseOrderedTuningSearchSpaceArtifact({
    fingerprint: 'ad5d4673e67321692f1635e3d8ed74efd3dbd26ad6ec236429d08c18f3466f5d',
    force_params: [
      {
        path: 'model.n_components',
        segments: ['model', 'n_components'],
        value: 6,
      },
      {
        path: 'train.batch_size',
        segments: ['train', 'batch_size'],
        value: 32,
      },
    ],
    format: 'nirs4all.tuning.ordered_search_space',
    parameters: [
      {
        index: 0,
        path: 'model.alpha',
        segments: ['model', 'alpha'],
        spec: { high: 1, log: true, low: 0.0001, type: 'log_float' },
      },
      {
        index: 1,
        path: 'model.n_components',
        segments: ['model', 'n_components'],
        spec: { high: 12, low: 2, step: 1, type: 'int' },
      },
      {
        index: 2,
        path: 'train.batch_size',
        segments: ['train', 'batch_size'],
        spec: [16, 32, 64],
      },
    ],
    schema_version: 1,
    tuning_fingerprint: '97695b1bd406085eb72fbd254a7e1f348616729acfedf802099b0abb028da9ec',
  })
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
  const robustnessSummary = parseRobustnessSummaryArtifact({
    conformal_guarantee_status: {
      artifact_fingerprint: 'custom-host-conformal-artifact',
      calibrated_coverages: [0.8, 0.9],
      calibration_data_fingerprint: 'custom-host-calibration-data',
      coverage: [0.8],
      effective_engine: 'nirs4all.python.replayed_array_apply',
      guarantee: 'split_conformal_marginal_coverage',
      invalidation_reasons: ['predictor fingerprint changed'],
      limitations: [
        'finite-sample marginal coverage requires exchangeable calibration and prediction samples',
      ],
      method: 'split_absolute_residual',
      multi_target: 'marginal',
      predictor_fingerprint: 'custom-host-predictor',
      requested_engine: 'nirs4all.conformal.v1',
      scope: 'finite_sample_marginal_exchangeability',
      source_calibrated_result_fingerprint: null,
      status: 'invalidated',
      unit: 'physical_sample',
      version: 1,
    },
    fingerprint: 'custom-host-demo',
    format: ROBUSTNESS_SUMMARY_FORMAT,
    mode: 'clean_frozen',
    report_version: 1,
    schema_version: 1,
    slice_by: [],
    spectral_replay: {
      all_predictions: false,
      predictor_bundle: 'custom-host-model.n4a',
      route: 'nirs4all.predict',
      sample_ids_forwarded: true,
      source: 'predictor_bundle',
    },
    summary: [
      {
        bias: 0,
        conformal_max_abs_coverage_gap: 0.03,
        conformal_mean_width_mean: 0.25,
        conformal_min_observed_coverage: 0.92,
        delta_bias: 0,
        delta_mae: 0,
        delta_max_abs_error: 0,
        delta_rmse: 0,
        mae: 0.08,
        mae_ratio: null,
        max_abs_error: 0.2,
        n_samples: 12,
        rmse: 0.1,
        rmse_ratio: null,
        scenario: { kind: 'observed', severity: 0 },
        scenario_index: 0,
        scenario_label: 'observed',
        severity: 0,
        worst_slice_key: null,
        worst_slice_label: null,
        worst_slice_metric: 'rmse',
        worst_slice_value: null,
      },
    ],
  })
  const robustnessCards = createRobustnessSummaryCards(robustnessSummary)
  const robustnessGuarantee = createRobustnessGuaranteeView(robustnessSummary)
  const robustnessSpectralReplay = getRobustnessSpectralReplay(robustnessSummary)
  const conformalArtifact = createDemoConformalArtifact()
  const conformalGuarantee = createConformalGuaranteeViewForArtifact(conformalArtifact)
  const conformalRows = createConformalIntervalSummaryRows(conformalArtifact)
  const keywordRegistry = createDemoKeywordRegistry()
  const engineKeyword = resolveKeywordRegistryEntry(keywordRegistry, { alias: 'backend' })
  const tuningArtifact = createDemoTuningArtifact()
  const tuningSummary = createTuningSummaryCard(tuningArtifact)
  const tuningRows = createTuningSummaryTrialRows(tuningArtifact)
  const tuningSpacePreview = createTuningSearchSpacePreview(createDemoTuningSearchSpaceArtifact())
  return {
    artifactContractCount: artifactContracts.length,
    artifactContractIds: artifactContracts.map((item) => item.id).join(', '),
    conformalCoverageLabel: conformalGuarantee?.coverageLabel ?? 'unavailable',
    conformalIntervalCount: conformalRows.length,
    conformalStatus: conformalGuarantee?.status ?? 'unknown',
    conformalTuningCalibrationLabel: conformalGuarantee?.tuningCalibrationLabel ?? 'unknown tuning calibration source',
    controllerCount: manifest.controllers.length,
    datasetTitle: datasetPreview?.title ?? 'Dataset',
    engineLabel: engineStatus?.badgeLabel ?? 'nirs4all-core-wasm',
    keywordEngineOptions: engineKeyword === undefined
      ? 'unavailable'
      : getKeywordRegistryValueOptions(engineKeyword).map((option) => String(option.value)).join(', '),
    keywordRequiredRegistryEntryCount: requiredKeywordRegistryEntries.length,
    keywordRequiredRegistryEntries: requiredKeywordRegistryEntries.join(', '),
    keywordRegistrySectionCount: createKeywordRegistryFormSections(keywordRegistry).length,
    predictSurface,
    robustnessGuaranteeCoverageLabel: robustnessGuarantee.coverageLabel,
    robustnessGuaranteeStatus: robustnessGuarantee.status,
    robustnessReplaySource: robustnessSpectralReplay === null
      ? 'not provided'
      : `${robustnessSpectralReplay.source} via ${robustnessSpectralReplay.route}`,
    robustnessStatus: robustnessCards[0]?.status ?? 'unknown',
    runtimeLabel: runtimeEngineLabel({ compiled: true, executed: true }) ?? 'runtime ready',
    sampleCount: datasetPreview?.sampleCount ?? 0,
    tuningBestValue: tuningSummary.bestValueLabel,
    tuningCompleteTrials: tuningSummary.completeTrials,
    tuningPruner: tuningSummary.pruner ?? 'none',
    tuningResume: tuningSummary.resume === null ? 'unknown' : String(tuningSummary.resume),
    tuningSampler: tuningSummary.sampler ?? 'unknown',
    tuningSeed: tuningSummary.seed === null ? 'none' : String(tuningSummary.seed),
    tuningSpaceForcedParameters: tuningSpacePreview.forceParamCount,
    tuningSpaceParameters: tuningSpacePreview.parameterCount,
    tuningSpaceSchema: tuningSpacePreview.schemaId,
    tuningStorageConfigured: tuningSummary.storageConfigured === null ? 'unknown' : String(tuningSummary.storageConfigured),
    tuningTrialCount: tuningRows.length,
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
        <dt>Robustness summary status</dt>
        <dd>{state.robustnessStatus}</dd>
        <dt>Robustness guarantee status</dt>
        <dd>{state.robustnessGuaranteeStatus}</dd>
        <dt>Robustness guarantee coverage</dt>
        <dd>{state.robustnessGuaranteeCoverageLabel}</dd>
        <dt>Robustness spectral replay</dt>
        <dd>{state.robustnessReplaySource}</dd>
        <dt>Conformal guarantee status</dt>
        <dd>{state.conformalStatus}</dd>
        <dt>Conformal tuning calibration</dt>
        <dd>{state.conformalTuningCalibrationLabel}</dd>
        <dt>Conformal interval coverages</dt>
        <dd>{state.conformalCoverageLabel}</dd>
        <dt>Conformal interval rows</dt>
        <dd>{state.conformalIntervalCount}</dd>
        <dt>Controller contracts</dt>
        <dd>{state.controllerCount}</dd>
        <dt>Native artifact contracts</dt>
        <dd>{state.artifactContractCount}</dd>
        <dt>Native artifact contract ids</dt>
        <dd>{state.artifactContractIds}</dd>
        <dt>Keyword registry sections</dt>
        <dd>{state.keywordRegistrySectionCount}</dd>
        <dt>Required registry entries</dt>
        <dd>{state.keywordRequiredRegistryEntryCount}</dd>
        <dt>Required registry entry ids</dt>
        <dd>{state.keywordRequiredRegistryEntries}</dd>
        <dt>Execution backend options</dt>
        <dd>{state.keywordEngineOptions}</dd>
        <dt>Tuning best value</dt>
        <dd>{state.tuningBestValue}</dd>
        <dt>Tuning complete trials</dt>
        <dd>{state.tuningCompleteTrials}</dd>
        <dt>Tuning sampler</dt>
        <dd>{state.tuningSampler}</dd>
        <dt>Tuning pruner</dt>
        <dd>{state.tuningPruner}</dd>
        <dt>Tuning seed</dt>
        <dd>{state.tuningSeed}</dd>
        <dt>Tuning search-space schema</dt>
        <dd>{state.tuningSpaceSchema}</dd>
        <dt>Tuning search-space parameters</dt>
        <dd>{state.tuningSpaceParameters}</dd>
        <dt>Tuning forced parameters</dt>
        <dd>{state.tuningSpaceForcedParameters}</dd>
        <dt>Tuning resume requested</dt>
        <dd>{state.tuningResume}</dd>
        <dt>Tuning storage configured</dt>
        <dd>{state.tuningStorageConfigured}</dd>
        <dt>Tuning trial rows</dt>
        <dd>{state.tuningTrialCount}</dd>
      </dl>
    </main>
  )
}
