import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCustomHostState, CustomAppHostDemo } from '../../examples/custom-app-host/src/App'

const exampleRoot = join(process.cwd(), 'examples', 'custom-app-host')

describe('standalone custom app host template', () => {
  it('uses only public nirs4all and nirs4all-ui imports', () => {
    const source = readFileSync(join(exampleRoot, 'src', 'App.tsx'), 'utf8')
    const readme = readFileSync(join(exampleRoot, 'README.md'), 'utf8')

    expect(source).toContain("from 'nirs4all'")
    expect(source).toContain("from 'nirs4all-ui/components'")
    expect(source).toContain("from 'nirs4all-ui/conformal'")
    expect(source).toContain("from 'nirs4all-ui/dataset'")
    expect(source).toContain("from 'nirs4all-ui/keywordRegistry'")
    expect(source).toContain("from 'nirs4all-ui/robustness'")
    expect(source).toContain("from 'nirs4all-ui/runtime'")
    expect(source).toContain("from 'nirs4all-ui/tuning'")
    expect(source).not.toContain("from '@/")
    expect(source).not.toContain("from '../../src/")
    expect(readme).toContain('conformal.calibrated_result')
    expect(readme).toContain('robustness.summary')
    expect(readme).toContain('tuning.summary')
    expect(readme).toContain('tuning.ordered_search_space')
    expect(readme).toContain('keyword.registry')
    expect(readme).toContain('capabilityManifest()')
    expect(readme).toContain('executionProfiles')
    expect(readme).toContain('availability, not qualification')
    expect(readme).toContain('metadata artifacts')
    expect(readme).toContain('not a Core capability or a required-entry contract')
    expect(readme).toContain('does not compute conformal quantiles')
    expect(readme).toContain('../../vendor/npm/nirs4all-ui-0.2.2-local.20261107.2.tgz')
    expect(readme).not.toContain('nirs4all-ui-0.1.17.tgz')
    expect(readme).not.toContain('required_registry_entries')
  })

  it('reports the Core execution profiles, their content types and JavaScript/WASM predict declarations', () => {
    const state = buildCustomHostState()

    // Expected values are the owner declarations in vendor/nirs4all/src/capability-profiles.js
    // (generated from nirs4all-core compat/capabilities.toml), written out independently of the host.
    expect(state.executionProfileCount).toBe(5)
    expect(state.executionProfileIds).toBe(
      'native-workflow, native-conformal, native-methods-package, native-n4a-canonical, n4a-container',
    )
    expect(state.profileContentTypeCount).toBe(6)
    expect(state.profileContentTypeSchemas).toBe(
      'nirs4all.native-pipeline.v1, nirs4all.calibrated.v1, dagml.portable_predictor_package, '
        + 'dagml.portable_refit_package, nirs4all.n4a.container.v1, nirs4all.dataset.v1',
    )
    expect(state.javascriptWasmPredict).toBe(
      'native-workflow: BrowserNativePipeline.predict, predictBrowserPipeline; '
        + 'native-conformal: predictCalibrated; '
        + 'native-methods-package: replayMethodsArchiveV2; '
        + 'native-n4a-canonical: predictN4aNative; '
        + 'n4a-container: unsupported (stored host or foreign models are opaque bytes and are never executed '
        + 'or deserialized by Core; closed native-produced models are predicted by native-n4a-canonical)',
    )
  })

  it('exposes reusable core and UI surfaces without app internals', () => {
    const state = buildCustomHostState()
    const source = readFileSync(join(exampleRoot, 'src', 'App.tsx'), 'utf8')

    expect(state.conformalCoverageLabel).toBe('80%, 90%')
    expect(state.conformalIntervalCount).toBe(2)
    expect(state.conformalStatus).toBe('active')
    expect(state.conformalTuningCalibrationLabel).toBe('tuning winner; score_data ranked trials only')
    expect(state.datasetTitle).toBe('Custom host demo dataset')
    expect(state.engineLabel).toBe('Nirs4all Core Wasm')
    expect(state.keywordEngineOptions).toBe('null, legacy, dag-ml, dual')
    expect(state.keywordRegistrySectionCount).toBe(1)
    expect(state.runtimeLabel).toBe('executed by dag-ml')
    expect(state.robustnessGuaranteeCoverageLabel).toBe('80%')
    expect(state.robustnessGuaranteeStatus).toBe('invalidated')
    expect(state.robustnessReplaySource).toBe('predictor_bundle via nirs4all.predict')
    expect(state.robustnessStatus).toBe('ok')
    expect(state.tuningBestValue).toBe('0.031')
    expect(state.tuningCompleteTrials).toBe(2)
    expect(state.tuningPruner).toBe('median')
    expect(state.tuningSampler).toBe('grid')
    expect(state.tuningSeed).toBe('42')
    expect(state.tuningSpaceForcedParameters).toBe(2)
    expect(state.tuningSpaceParameters).toBe(3)
    expect(state.tuningSpaceSchema).toBe('https://nirs4all.org/schemas/tuning-ordered-search-space/v1')
    expect(state.tuningTrialCount).toBe(3)
    expect(CustomAppHostDemo).toBeTypeOf('function')
    expect(source).toContain('aria-label="nirs4all custom app host"')
    expect(source).toContain('DatasetPreviewCard')
    expect(source).toContain('RuntimeEngineBadge')
    expect(source).toContain('MetricValueBadge')
    expect(source).toContain('createRobustnessSummaryCards')
    expect(source).toContain('createRobustnessGuaranteeView')
    expect(source).toContain('getRobustnessSpectralReplay')
    expect(source).toContain('parseRobustnessSummaryArtifact')
    expect(source).toContain('createConformalGuaranteeViewForArtifact')
    expect(source).toContain('createConformalIntervalSummaryRows')
    expect(source).toContain('createKeywordRegistryFormSections')
    expect(source).toContain('JavaScript/WASM predict entrypoints by execution profile')
    expect(source).toContain('Robustness guarantee status')
    expect(source).toContain('Robustness guarantee coverage')
    expect(source).toContain('Robustness spectral replay')
    expect(source).toContain('Core execution profiles')
    expect(source).toContain('Core execution profile ids')
    expect(source).toContain('Profile content types')
    expect(source).toContain('Profile content type schemas')
    expect(source).toContain('Conformal guarantee status')
    expect(source).toContain('Conformal interval coverages')
    expect(source).toContain('Sample keyword registry sections')
    expect(source).toContain('Sample execution backend options')
    expect(source).not.toContain('artifactContracts')
    expect(source).not.toContain('runtimeContracts')
    expect(source).not.toContain('requiredKeywordRegistryEntries')
    expect(source).not.toContain('.controllers')
    expect(source).toContain('Tuning best value')
    expect(source).toContain('Tuning complete trials')
    expect(source).toContain('Tuning sampler')
    expect(source).toContain('Tuning pruner')
    expect(source).toContain('Tuning seed')
    expect(source).toContain('Tuning search-space schema')
    expect(source).toContain('Tuning search-space parameters')
    expect(source).toContain('Tuning forced parameters')
    expect(source).toContain('Tuning trial rows')
    expect(source).toContain('parseOrderedTuningSearchSpaceArtifact')
    expect(source).toContain('createTuningSearchSpacePreview')
  })
})
