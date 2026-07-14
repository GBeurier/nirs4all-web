import { existsSync, readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { RuntimeEngineBadge } from 'nirs4all-ui/components'
import orderedSearchSpaceFixture from './fixtures/ordered_search_space_v1.json' with { type: 'json' }
import {
  createConformalCoverageOptions,
  createConformalCoverageStrip,
  createConformalGuaranteeViewForArtifact,
  createConformalGuaranteeView,
  createConformalIntervalSummaryRows,
  createConformalMetricRows,
  createConformalPredictionRows,
  getCalibrationReplaySource,
  getConformalGuaranteeStatus,
  getTuningCalibrationSource,
  parseCalibratedRunResultArtifact,
  parseConformalMetricSet,
} from 'nirs4all-ui/conformal'
import {
  createKeywordRegistryFieldViews,
  createKeywordRegistryFormSections,
  createKeywordRegistryOptimizerPersistenceFields,
  getKeywordRegistryValueOptions,
  parseKeywordRegistryDocument,
  resolveKeywordRegistryEntry,
} from 'nirs4all-ui/keywordRegistry'
import { getMetricDefinition, isLowerBetter } from 'nirs4all-ui/score'
import { runtimeEngineLabel } from 'nirs4all-ui/runtime'
import {
  createTuningSearchSpacePreview,
  createTuningSummaryCard,
  createTuningSummaryTrialRows,
  createTuningStudySummary,
  createTuningTrialRows,
  parseOrderedTuningSearchSpaceArtifact,
  parseTuningResultArtifact,
  parseTuningSummaryArtifact,
} from 'nirs4all-ui/tuning'
import {
  createRobustnessDegradationHeatmap,
  createRobustnessDegradationRows,
  createRobustnessGuaranteeView,
  createRobustnessSummaryCards,
  createRobustnessWorstSliceRows,
  getRobustnessConformalGuaranteeStatus,
  getRobustnessModeOptionsFromRegistry,
  getRobustnessScenarioDistributionOptionsFromRegistry,
  getRobustnessScenarioKindOptionsFromRegistry,
  getRobustnessSpectralReplay,
  parseRobustnessSummaryArtifact,
  ROBUSTNESS_EXECUTABLE_MODES,
  ROBUSTNESS_SCENARIO_KINDS,
  ROBUSTNESS_SUMMARY_FORMAT,
  validateRobustnessScenarioDraft,
} from 'nirs4all-ui/robustness'
import { getNirs4allBrandDefinition } from 'nirs4all-ui/brand'
import { getNirs4allStyleAsset } from 'nirs4all-ui/styles'
import { artifactContracts } from 'nirs4all'
import { metricChips, primaryMetric } from '@/lib/format'

describe('shared nirs4all-ui contract', () => {
  it('keeps Web metric labels and score direction aligned with nirs4all-ui/score', () => {
    const regression = primaryMetric('regression')
    const rmse = getMetricDefinition('rmse')
    expect(regression).toEqual({
      key: 'rmse',
      label: rmse?.label,
      higherIsBetter: !isLowerBetter('rmse'),
    })

    expect(metricChips('regression')).toEqual([
      { key: 'rmse', label: getMetricDefinition('rmse')?.abbreviation },
      { key: 'r2', label: getMetricDefinition('r2')?.abbreviation },
      { key: 'mae', label: getMetricDefinition('mae')?.abbreviation },
    ])

    const binary = primaryMetric('binary')
    expect(binary).toEqual({
      key: 'accuracy',
      label: getMetricDefinition('accuracy')?.label,
      higherIsBetter: !isLowerBetter('accuracy'),
    })
  })

  it('renders the runtime engine badge from nirs4all-ui/components', () => {
    const lineage = { compiled: true, executed: true }
    const label = runtimeEngineLabel(lineage)
    const element = RuntimeEngineBadge({ lineage, className: 'shared-runtime' }) as ReactElement<{
      className: string
      children: unknown
    }>

    expect(label).toBe('executed by dag-ml')
    expect(element.type).toBe('span')
    expect(element.props.className).toBe('shared-runtime')
    expect(JSON.stringify(element.props.children)).toContain(label)
  })

  it('keeps shared nirs4all-ui asset exports available to custom hosts', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../vendor/nirs4all-ui/package.json', import.meta.url), 'utf8'),
    ) as { exports?: Record<string, string | { import?: string; types?: string }> }

    expect(packageJson.exports?.['./assets/*']).toBe('./assets/*')
    expect(packageJson.exports?.['./conformal']).toMatchObject({ import: './dist/conformal/index.js' })
    expect(packageJson.exports?.['./keywordRegistry']).toMatchObject({ import: './dist/keywordRegistry/index.js' })
    expect(packageJson.exports?.['./robustness']).toMatchObject({ import: './dist/robustness/index.js' })
    expect(packageJson.exports?.['./tuning']).toMatchObject({ import: './dist/tuning/index.js' })
    expect(packageJson.exports?.['./brand']).toMatchObject({ import: './dist/brand/index.js' })
    expect(packageJson.exports?.['./styles']).toMatchObject({ import: './dist/styles/index.js' })
    expect(getNirs4allBrandDefinition('nirs4all-ui').role).toBe('Shared visual system')
    expect(getNirs4allStyleAsset('default-theme').packageExport)
      .toBe('nirs4all-ui/assets/styles/nirs4all-default.css')
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brand/icon.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brand/horizontal.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/brands/nirs4all-core/horizontal.svg', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/styles/nirs4all-default.css', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../vendor/nirs4all-ui/assets/motion/nirs-spectra.svg', import.meta.url))).toBe(true)
  })

  it('projects calibrated conformal results through the public nirs4all-ui contract', () => {
    const artifact = parseCalibratedRunResultArtifact({
      artifact: {
        calibration_size: 4,
        qhat_by_coverage: [{ coverage: 0.8, qhat: 0.5 }],
        spec: {
          coverage: [0.8],
          group_by: [],
          method: 'split_absolute_residual',
          multi_target: 'marginal',
          unit: 'physical_sample',
        },
      },
      fingerprint: 'tcv1-conformal',
      metadata: {
        conformal_guarantee_status: {
          artifact_fingerprint: 'artifact-fp',
          calibrated_coverages: [0.8],
          calibration_data_fingerprint: 'calibration-data-fp',
          coverage: [0.8],
          effective_engine: 'nirs4all.conformal.v1',
          guarantee: 'split_conformal_marginal_coverage',
          invalidation_reasons: [],
          limitations: ['finite-sample marginal coverage requires exchangeable calibration and prediction samples'],
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
          predictor_bundle: 'model.n4a',
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
        intervals: [{ coverage: 0.8, lower: [0, 1], qhat: 0.5, upper: [1, 2] }],
        method: 'split_absolute_residual',
        unit: 'physical_sample',
        y_pred: [0.5, 1.5],
      },
      sample_ids: ['pred-a', 'pred-b'],
      version: 1,
    })

    expect(createConformalGuaranteeViewForArtifact(artifact)).toEqual(expect.objectContaining({
      calibrationReplayLabel: 'dataset predictor bundle via nirs4all.predict',
      coverageLabel: '80%',
      label: 'Active conformal guarantee',
      status: 'active',
      tone: 'success',
      tuningCalibrationLabel: 'tuning winner; score_data ranked trials only',
      tuningCalibrationSource: {
        score_data_role: 'hpo_objective_only',
        score_data_used: false,
        source: 'tuning.winner',
      },
    }))
    expect(createConformalGuaranteeView(getConformalGuaranteeStatus(artifact))).toEqual(expect.objectContaining({
      calibrationReplayLabel: 'unknown replay source',
      coverageLabel: '80%',
      label: 'Active conformal guarantee',
      status: 'active',
      tone: 'success',
    }))
    expect(getCalibrationReplaySource(artifact)).toEqual(expect.objectContaining({
      kind: 'dataset_predictor_bundle',
      predictor_bundle: 'model.n4a',
      route: 'nirs4all.predict',
    }))
    expect(getTuningCalibrationSource(artifact)).toEqual({
      score_data_role: 'hpo_objective_only',
      score_data_used: false,
      source: 'tuning.winner',
    })
    expect(artifactContracts.find((item) => item.id === 'conformal.calibrated_result')?.optionalPayloadFields)
      .toEqual(['conformal_guarantee_status', 'calibration_replay_source', 'tuning_calibration_source'])
    expect(createConformalIntervalSummaryRows(artifact)).toEqual([
      expect.objectContaining({ coverage: 0.8, coverageLabel: '80%', meanWidth: 1, nSamples: 2, qhat: 0.5 }),
    ])
    expect(createConformalCoverageOptions(artifact)).toEqual([
      {
        calibrated: true,
        coverage: 0.8,
        disabled: false,
        label: '80%',
        materialized: true,
        selected: true,
      },
    ])
    expect(createConformalCoverageStrip(
      createConformalCoverageOptions(artifact),
      createConformalIntervalSummaryRows(artifact),
    )).toEqual([
      expect.objectContaining({
        coverage: 0.8,
        coverageLabel: '80%',
        qhatLabel: '0.5000',
        tone: 'selected',
      }),
    ])
    expect(createConformalPredictionRows(artifact)).toEqual([
      expect.objectContaining({
        index: 0,
        intervals: [expect.objectContaining({ coverage: 0.8, lower: 0, upper: 1, width: 1 })],
        sampleId: 'pred-a',
        yPred: 0.5,
      }),
      expect.objectContaining({
        index: 1,
        sampleId: 'pred-b',
        yPred: 1.5,
      }),
    ])
    expect(createConformalMetricRows([
      parseConformalMetricSet({
        coverage: 0.8,
        coverage_gap: -0.05,
        fingerprint: 'metric-fp',
        mean_interval_score: 1.5,
        mean_width: 1.25,
        median_width: 1,
        n_covered: 3,
        n_missed_above: 0,
        n_missed_below: 1,
        n_samples: 4,
        observed_coverage: 0.75,
        unit: 'physical_sample',
        version: 1,
      }),
    ])).toEqual([
      expect.objectContaining({
        coverageGapDirection: 'under',
        coverageLabel: '80%',
        observedCoverageLabel: '75%',
      }),
    ])
  })

  it('keeps legacy status-only conformal projection available through the public contract', () => {
    const artifact = parseCalibratedRunResultArtifact({
      artifact: {
        calibration_size: 4,
        qhat_by_coverage: [{ coverage: 0.8, qhat: 0.5 }],
        spec: {
          coverage: [0.8],
          group_by: [],
          method: 'split_absolute_residual',
          multi_target: 'marginal',
          unit: 'physical_sample',
        },
      },
      fingerprint: 'tcv1-conformal-status-source',
      metadata: {
        conformal_guarantee_status: {
          artifact_fingerprint: 'artifact-fp',
          calibrated_coverages: [0.8],
          calibration_data_fingerprint: 'calibration-data-fp',
          calibration_replay_source: {
            dataset_backed: true,
            kind: 'dataset_predictor_bundle',
            predictor_bundle: 'model.n4a',
            requires_model_replay: true,
            route: 'nirs4all.predict',
            version: 1,
          },
          coverage: [0.8],
          effective_engine: 'nirs4all.conformal.v1',
          guarantee: 'split_conformal_marginal_coverage',
          invalidation_reasons: [],
          limitations: ['finite-sample marginal coverage requires exchangeable calibration and prediction samples'],
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
      },
      prediction: {
        intervals: [{ coverage: 0.8, lower: [0, 1], qhat: 0.5, upper: [1, 2] }],
        method: 'split_absolute_residual',
        unit: 'physical_sample',
        y_pred: [0.5, 1.5],
      },
      sample_ids: ['pred-a', 'pred-b'],
      version: 1,
    })

    expect(createConformalGuaranteeView(getConformalGuaranteeStatus(artifact))).toEqual(expect.objectContaining({
      calibrationReplayLabel: 'dataset predictor bundle via nirs4all.predict',
      coverageLabel: '80%',
      label: 'Active conformal guarantee',
      status: 'active',
      tone: 'success',
    }))
    expect(getCalibrationReplaySource(artifact)).toEqual(expect.objectContaining({
      kind: 'dataset_predictor_bundle',
      predictor_bundle: 'model.n4a',
      route: 'nirs4all.predict',
    }))
    expect(createConformalIntervalSummaryRows(artifact)).toEqual([
      expect.objectContaining({ coverage: 0.8, coverageLabel: '80%', meanWidth: 1, nSamples: 2, qhat: 0.5 }),
    ])
    expect(createConformalCoverageOptions(artifact)).toEqual([
      {
        calibrated: true,
        coverage: 0.8,
        disabled: false,
        label: '80%',
        materialized: true,
        selected: true,
      },
    ])
    expect(createConformalPredictionRows(artifact)).toEqual([
      expect.objectContaining({
        index: 0,
        intervals: [expect.objectContaining({ coverage: 0.8, lower: 0, upper: 1, width: 1 })],
        sampleId: 'pred-a',
        yPred: 0.5,
      }),
      expect.objectContaining({
        index: 1,
        sampleId: 'pred-b',
        yPred: 1.5,
      }),
    ])
    expect(createConformalMetricRows([
      parseConformalMetricSet({
        coverage: 0.8,
        coverage_gap: -0.05,
        fingerprint: 'metric-fp',
        mean_interval_score: 1.5,
        mean_width: 1.25,
        median_width: 1,
        n_covered: 3,
        n_missed_above: 0,
        n_missed_below: 1,
        n_samples: 4,
        observed_coverage: 0.75,
        unit: 'physical_sample',
        version: 1,
      }),
    ])).toEqual([
      expect.objectContaining({
        coverageGapDirection: 'under',
        coverageLabel: '80%',
        nCovered: 3,
        observedCoverageLabel: '75%',
      }),
    ])
  })

  it('projects tuning result payloads through the public nirs4all-ui contract', () => {
    const artifact = parseTuningResultArtifact({
      best_params: { alpha: 0.2 },
      best_value: 0.12,
      fingerprint: 'tcv1-demo-tune',
      optimizer: 'optuna',
      trials: [
        {
          diagnostics: { metric: 'rmse' },
          number: 1,
          params: { alpha: 0.2 },
          state: 'COMPLETE',
          value: 0.12,
        },
        {
          diagnostics: { metric: 'rmse' },
          number: 0,
          params: { alpha: 0.9 },
          state: 'PRUNED',
          value: null,
        },
      ],
      tuning: {
        direction: 'minimize',
        engine: 'optuna',
        metric: 'rmse',
        n_trials: 2,
        pruner: 'median',
        resume: false,
        sampler: 'tpe',
        seed: 42,
        space: { alpha: [0.2, 0.9] },
        storage: null,
        study_name: 'web-tune',
      },
    })

    expect(createTuningStudySummary(artifact)).toEqual(expect.objectContaining({
      bestParams: { alpha: 0.2 },
      completeTrials: 1,
      fingerprint: 'tcv1-demo-tune',
      nTrials: 2,
      optimizer: 'optuna',
      pruner: 'median',
      prunedTrials: 1,
      sampler: 'tpe',
      seed: 42,
      studyName: 'web-tune',
    }))
    expect(createTuningTrialRows(artifact)).toEqual([
      expect.objectContaining({ isBest: false, number: 0, status: 'pruned', tone: 'warning' }),
      expect.objectContaining({ isBest: true, number: 1, paramsLabel: 'alpha=0.2', status: 'complete' }),
    ])

    const summaryArtifact = parseTuningSummaryArtifact({
      best_params: { alpha: 0.2 },
      best_value: 0.12,
      direction: 'minimize',
      engine: 'optuna',
      fingerprint: 'tcv1-demo-tune',
      format: 'nirs4all.tuning.summary',
      metric: 'rmse',
      n_trials: 2,
      optimizer: 'optuna',
      persistence: {
        optimizer_state_resume_supported: true,
        resume: true,
        storage_configured: true,
        study_name: 'web-tune',
      },
      pruner: 'median',
      sampler: 'grid',
      schema_version: 1,
      seed: 42,
      trial_states: { COMPLETE: 1, PRUNED: 1 },
      trials: [
        { number: 1, state: 'COMPLETE', value: 0.12 },
        { number: 0, state: 'PRUNED', value: null },
      ],
      version: 1,
    })

    expect(createTuningSummaryCard(summaryArtifact)).toEqual(expect.objectContaining({
      bestParams: { alpha: 0.2 },
      completeTrials: 1,
      fingerprint: 'tcv1-demo-tune',
      nTrials: 2,
      optimizerStateResumeSupported: true,
      optimizer: 'optuna',
      persistence: {
        optimizer_state_resume_supported: true,
        resume: true,
        storage_configured: true,
        study_name: 'web-tune',
      },
      pruner: 'median',
      prunedTrials: 1,
      resume: true,
      sampler: 'grid',
      seed: 42,
      storageConfigured: true,
      studyName: 'web-tune',
    }))
    expect(createTuningSummaryTrialRows(summaryArtifact)).toEqual([
      expect.objectContaining({ number: 0, status: 'pruned', tone: 'warning', valueLabel: '—' }),
      expect.objectContaining({ number: 1, status: 'complete', tone: 'success' }),
    ])
  })

  it('projects the Python ordered search-space fixture through nirs4all-ui/tuning', () => {
    const preview = createTuningSearchSpacePreview(
      parseOrderedTuningSearchSpaceArtifact(orderedSearchSpaceFixture),
    )

    expect(preview).toMatchObject({
      fingerprint: 'ad5d4673e67321692f1635e3d8ed74efd3dbd26ad6ec236429d08c18f3466f5d',
      forceParamCount: 2,
      parameterCount: 3,
      schemaId: 'https://nirs4all.org/schemas/tuning-ordered-search-space/v1',
      tuningFingerprint: '97695b1bd406085eb72fbd254a7e1f348616729acfedf802099b0abb028da9ec',
    })
    expect(preview.parameters.map((parameter) => parameter.path)).toEqual([
      'model.alpha',
      'model.n_components',
      'train.batch_size',
    ])
    expect(preview.parameters[1]).toMatchObject({
      forced: true,
      forcedValue: 6,
      forcedValueLabel: '6',
    })
    expect(preview.parameters[2]).toMatchObject({
      forced: true,
      forcedValue: 32,
      spec: [16, 32, 64],
    })
  })

  it('projects robustness summary artifacts through the public nirs4all-ui contract', () => {
    const artifact = parseRobustnessSummaryArtifact({
      conformal_guarantee_status: {
        artifact_fingerprint: 'artifact-fp',
        calibrated_coverages: [0.8, 0.9],
        calibration_data_fingerprint: 'calibration-data-fp',
        coverage: [0.8],
        effective_engine: 'nirs4all.python.replayed_array_apply',
        guarantee: 'split_conformal_marginal_coverage',
        invalidation_reasons: ['predictor fingerprint changed'],
        limitations: ['finite-sample marginal coverage requires exchangeable calibration and prediction samples'],
        method: 'split_absolute_residual',
        multi_target: 'marginal',
        predictor_fingerprint: 'predictor-fp',
        requested_engine: 'nirs4all.conformal.v1',
        scope: 'finite_sample_marginal_exchangeability',
        source_calibrated_result_fingerprint: null,
        status: 'invalidated',
        unit: 'physical_sample',
        version: 1,
      },
      fingerprint: 'tcv1-demo',
      format: ROBUSTNESS_SUMMARY_FORMAT,
      mode: 'clean_frozen',
      report_version: 1,
      schema_version: 1,
      slice_by: ['Instrument'],
      spectral_replay: {
        all_predictions: false,
        predictor_bundle: 'model.n4a',
        route: 'nirs4all.predict',
        sample_ids_forwarded: true,
        source: 'predictor_bundle',
      },
      summary: [
        {
          bias: 0.01,
          conformal_max_abs_coverage_gap: 0.05,
          conformal_mean_width_mean: 0.42,
          conformal_min_observed_coverage: 0.91,
          delta_bias: 0,
          delta_mae: 0,
          delta_max_abs_error: 0,
          delta_rmse: 0,
          execution_scope: 'prediction_replay',
          mae: 0.12,
          mae_ratio: null,
          max_abs_error: 0.4,
          n_samples: 8,
          requires_spectral_replay: false,
          rmse: 0.16,
          rmse_ratio: null,
          scenario: { distribution: 'uniform', kind: 'prediction_noise', severity: 0.25 },
          scenario_index: 0,
          scenario_label: 'prediction_noise (distribution=uniform)',
          severity: 0.25,
          worst_slice_key: { Instrument: 'portable-demo' },
          worst_slice_label: 'Instrument=portable-demo',
          worst_slice_metric: 'rmse',
          worst_slice_value: 0.16,
        },
      ],
    })

    expect(artifact.format).toBe('nirs4all.robustness.summary')
    expect(createRobustnessGuaranteeView(artifact)).toEqual(expect.objectContaining({
      coverageLabel: '80%',
      effectiveEngine: 'nirs4all.python.replayed_array_apply',
      label: 'Invalidated conformal guarantee',
      status: 'invalidated',
      tone: 'error',
    }))
    expect(getRobustnessConformalGuaranteeStatus(artifact)?.invalidation_reasons).toEqual([
      'predictor fingerprint changed',
    ])
    expect(getRobustnessSpectralReplay(artifact)?.predictor_bundle).toBe('model.n4a')
    const cards = createRobustnessSummaryCards(artifact)

    expect(cards).toEqual([
      expect.objectContaining({
        nSamples: 8,
        rmse: 0.16,
        distribution: 'uniform',
        executionScope: 'prediction_replay',
        requiresSpectralReplay: false,
        scenario: { distribution: 'uniform', kind: 'prediction_noise', severity: 0.25 },
        scenarioLabel: 'prediction_noise (distribution=uniform)',
        status: 'ok',
        worstSlice: expect.objectContaining({ label: 'Instrument=portable-demo' }),
      }),
    ])
    expect(createRobustnessDegradationRows(cards)).toEqual([
      expect.objectContaining({
        coverageStatusLabel: 'Coverage OK',
        maeDeltaLabel: '0',
        rmseDeltaLabel: '0',
        scenarioLabel: 'prediction_noise (distribution=uniform)',
        worstSliceLabel: 'Instrument=portable-demo',
      }),
    ])
    expect(createRobustnessDegradationHeatmap(cards)).toEqual([
      expect.objectContaining({ metric: 'rmse_delta', scenarioLabel: 'prediction_noise (distribution=uniform)' }),
      expect.objectContaining({ metric: 'mae_delta', scenarioLabel: 'prediction_noise (distribution=uniform)' }),
      expect.objectContaining({ metric: 'coverage_gap', scenarioLabel: 'prediction_noise (distribution=uniform)' }),
    ])
    expect(createRobustnessWorstSliceRows(cards)).toEqual([
      expect.objectContaining({
        available: true,
        metric: 'rmse',
        scenarioLabel: 'prediction_noise (distribution=uniform)',
        sliceLabel: 'Instrument=portable-demo',
        value: 0.16,
        valueLabel: '0.16',
      }),
    ])
  })

  it('validates robustness scenario form drafts through the vendored nirs4all-ui contract', () => {
    expect(ROBUSTNESS_SCENARIO_KINDS).toContain('spectral_shift')
    expect(validateRobustnessScenarioDraft({ kind: 'prediction_noise', distribution: 'normal' })).toEqual([])
    expect(validateRobustnessScenarioDraft({ kind: 'spectral_noise', distribution: 'uniform' })).toEqual([])
    expect(validateRobustnessScenarioDraft({ kind: 'spectral_shift', distribution: 'normal' })).toEqual([
      expect.objectContaining({
        code: 'distribution_not_allowed',
        path: 'distribution',
      }),
    ])
    const robustnessRegistry = {
      entries: [
        {
          aliases: [],
          canonical_term: 'robustness_mode',
          changes: ['robustness_results'],
          docs_anchor: 'planned-robustness-campaigns',
          engine_support: { 'dag-ml': 'partial', legacy: 'unsupported' },
          id: 'robustness.mode',
          invalidates_calibration: 'mode_dependent',
          lifecycle_stage: 'robustness',
          path: 'robustness.mode',
          reads: ['external_test_or_production'],
          scope: 'robustness_campaign',
          status: 'partial',
          summary: 'Selects the robustness execution mode.',
          surface: 'robustness_argument',
          token: 'mode',
          ui: { control: 'select', group: 'robustness', label: 'Robustness mode', order: 210 },
          value_schema: {
            enum: ['clean_frozen', 'matched_recalibration', 'future_mode'],
            type: 'string',
            'x-executable-values': ['clean_frozen'],
          },
        },
        {
          aliases: [],
          canonical_term: 'robustness_scenarios',
          changes: ['robustness_results'],
          docs_anchor: 'planned-robustness-campaigns',
          engine_support: { 'dag-ml': 'partial', legacy: 'unsupported' },
          id: 'robustness.scenarios',
          invalidates_calibration: 'mode_dependent',
          lifecycle_stage: 'robustness',
          path: 'robustness.scenarios',
          reads: ['external_test_or_production'],
          scope: 'robustness_campaign',
          status: 'partial',
          summary: 'Defines report cells for robustness diagnostics.',
          surface: 'robustness_argument',
          token: 'scenarios',
          ui: { control: 'array', group: 'robustness', label: 'Robustness scenarios', order: 220 },
          value_schema: {
            items: {
              properties: {
                distribution: { enum: ['normal', 'uniform'], type: 'string' },
                kind: { enum: ['observed', 'prediction_noise', 'spectral_shift'], type: 'string' },
              },
              required: ['kind'],
              type: 'object',
            },
            minItems: 1,
            type: 'array',
          },
        },
      ],
      registry_version: '1.0.0',
      schema_id: 'https://nirs4all.org/schemas/keyword-effects/v1',
      schema_version: 1,
      scope: 'lifecycle-v1',
    }

    expect(ROBUSTNESS_EXECUTABLE_MODES).toEqual(['clean_frozen'])
    expect(getRobustnessModeOptionsFromRegistry(robustnessRegistry)).toEqual([
      { disabled: false, executable: true, label: 'clean frozen', value: 'clean_frozen' },
      { disabled: true, executable: false, label: 'matched recalibration', value: 'matched_recalibration' },
    ])
    expect(getRobustnessScenarioKindOptionsFromRegistry(robustnessRegistry).map((option) => option.value)).toEqual([
      'observed',
      'prediction_noise',
      'spectral_shift',
    ])
    expect(getRobustnessScenarioDistributionOptionsFromRegistry(robustnessRegistry, 'prediction_noise')).toEqual([
      { disabled: false, label: 'normal', value: 'normal' },
      { disabled: false, label: 'uniform', value: 'uniform' },
    ])
    expect(getRobustnessScenarioDistributionOptionsFromRegistry(robustnessRegistry, 'spectral_shift')).toEqual([
      { disabled: true, label: 'normal', value: 'normal' },
      { disabled: true, label: 'uniform', value: 'uniform' },
    ])
  })

  it('projects keyword registry documents through the public nirs4all-ui contract', () => {
    const registry = parseKeywordRegistryDocument({
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
        {
          aliases: [],
          canonical_term: 'optimizer_storage_uri',
          changes: ['optimizer_state'],
          docs_anchor: 'planned-full-dag-tuning',
          engine_support: { 'dag-ml': 'partial', n4m: 'unsupported', optuna: 'supported' },
          id: 'run.tuning.storage',
          invalidates_calibration: 'not_applicable',
          lifecycle_stage: 'storage',
          path: 'run.tuning.storage',
          reads: ['optimizer_state'],
          scope: 'optimizer_persistence',
          status: 'partial',
          summary: 'Optuna storage URI.',
          surface: 'nested_key',
          token: 'storage',
          ui: { control: 'text', group: 'tuning', label: 'Optuna storage URI', order: 254 },
          value_schema: { minLength: 1, pattern: '^[A-Za-z][A-Za-z0-9+.-]*://', type: 'string' },
        },
        {
          aliases: [],
          canonical_term: 'optimizer_study_name',
          changes: ['optimizer_state'],
          docs_anchor: 'planned-full-dag-tuning',
          engine_support: { 'dag-ml': 'partial', n4m: 'unsupported', optuna: 'supported' },
          id: 'run.tuning.study_name',
          invalidates_calibration: 'not_applicable',
          lifecycle_stage: 'storage',
          path: 'run.tuning.study_name',
          reads: ['optimizer_state'],
          scope: 'optimizer_persistence',
          status: 'partial',
          summary: 'Optuna study name.',
          surface: 'nested_key',
          token: 'study_name',
          ui: { control: 'text', group: 'tuning', label: 'Optuna study name', order: 255 },
          value_schema: { minLength: 1, pattern: '^[^\\u0000]+$', type: 'string' },
        },
      ],
      registry_version: '1.0.0',
      schema_id: 'https://nirs4all.org/schemas/keyword-effects/v1',
      schema_version: 1,
      scope: 'lifecycle-v1',
    })

    expect(createKeywordRegistryFieldViews(registry)).toEqual([
      expect.objectContaining({
        id: 'run.engine',
        invalidatesCalibration: 'if_predictor_changes',
        label: 'Execution backend',
        status: 'supported',
      }),
      expect.objectContaining({
        id: 'run.tuning.storage',
        invalidatesCalibration: 'not_applicable',
        label: 'Optuna storage URI',
        status: 'partial',
      }),
      expect.objectContaining({
        id: 'run.tuning.study_name',
        invalidatesCalibration: 'not_applicable',
        label: 'Optuna study name',
        status: 'partial',
      }),
    ])
    expect(resolveKeywordRegistryEntry(registry, { alias: 'backend' })?.id).toBe('run.engine')
    expect(createKeywordRegistryFormSections(registry)).toEqual([
      expect.objectContaining({
        fields: [expect.objectContaining({ id: 'run.engine' })],
        group: 'execution',
        label: 'Execution',
      }),
      expect.objectContaining({
        fields: [
          expect.objectContaining({ id: 'run.tuning.storage' }),
          expect.objectContaining({ id: 'run.tuning.study_name' }),
        ],
        group: 'tuning',
        label: 'Tuning',
      }),
    ])
    expect(getKeywordRegistryValueOptions(registry.entries[0]).map((option) => option.value)).toEqual([
      null,
      'legacy',
      'dag-ml',
      'dual',
    ])
    expect(createKeywordRegistryOptimizerPersistenceFields(registry).map((field) => field.id)).toEqual([
      'run.tuning.storage',
      'run.tuning.study_name',
    ])
  })
})
