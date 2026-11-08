import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readPortableArchiveV2 } from 'nirs4all'
import {
  inspectMethodsArchiveV2Predictors,
  loadArchiveV2Native,
  loadDatasetsWasm,
  loadMethodsWasm,
  openN4aContainer,
  replayMethodsArchiveV2,
  upstreams,
  writeN4aContainer,
  coreExecutionProfileDefinitions,
  coreExecutionProfileDefinitionsSha256,
} from './nirs4all-core'
import * as nirs4allCore from './nirs4all-core'
import { predictPortablePipeline, runPortablePipeline } from './testing/frozen-core-0.5/execution.js'
import { CORE_EXECUTION_PROFILES_JSON } from './core-execution-profiles.generated'
import { createHash } from 'node:crypto'
import { isPortableCoreModel } from './portable-core'
import { tryRunSingleHoldout } from './single-holdout'
import type { FittedPipeline, MaterializedDataset, PipelineDSL } from './types'

const oracleUrl = new URL('./fixtures/core-parity/portable_python_oracle.json', import.meta.url)
const fixtureDir = new URL('./fixtures/core-parity/', import.meta.url)

function maxAbsDiff(actual: number[], expected: number[]): number {
  expect(actual.length).toBe(expected.length)
  return actual.reduce((max, value, index) => Math.max(max, Math.abs(value - expected[index])), 0)
}

describe('nirs4all-core aggregate loaders', () => {

  it('binds the test-only historical source to the named dcc35fbe oracle', () => {
    const root = new URL('./testing/frozen-core-0.5/', import.meta.url)
    const provenance = JSON.parse(readFileSync(new URL('PROVENANCE.json', root), 'utf8')) as { files: { file: string; sha256: string; byte_length: number }[] }
    expect(provenance.files.find(file => file.file === 'execution.js')?.sha256).toBe('dcc35fbe1a741764864c75786172362949e79815c862a014a08eafe535bee962')
    for (const file of provenance.files) {
      const bytes = readFileSync(new URL(file.file, root))
      expect(bytes.length).toBe(file.byte_length)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
    }
  })

  it('uses core names for the vendored aggregate sync path', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }
    const vendorPkg = JSON.parse(readFileSync(new URL('../../vendor/nirs4all/package.json', import.meta.url), 'utf8')) as {
      name: string
      version: string
    }
    const provenance = JSON.parse(readFileSync(new URL('../../vendor/nirs4all/PROVENANCE.json', import.meta.url), 'utf8'))
    const syncScript = readFileSync(new URL('../../scripts/sync-core-shim.mjs', import.meta.url), 'utf8')

    expect(pkg.scripts['vendor:core']).toBe('node scripts/sync-core-shim.mjs')
    expect(pkg.scripts['check:core-shim']).toBe('node scripts/sync-core-shim.mjs --check')
    expect(Object.keys(pkg.scripts).filter((name) => name.includes('lite'))).toEqual([])
    expect(Object.values(pkg.scripts).filter((script) => /sync-lite|vendor:lite|check:lite/.test(script))).toEqual([])
    expect(existsSync(new URL('../../scripts/sync-core-shim.mjs', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../../scripts/sync-lite-shim.mjs', import.meta.url))).toBe(false)
    expect(syncScript).not.toMatch(/NIRS4ALL_LITE|nirs4all-lite|sync-lite/)
    expect(vendorPkg).toMatchObject({ name: 'nirs4all', version: '0.5.0' })
    expect(provenance).toMatchObject({
      package: 'nirs4all',
      version: '0.5.0',
      source: {
        kind: 'local-working-tree-export',
        base_commit_sha: '1dffd9f4472551cc09ad9d99ed9d40814bd003cc',
        base_tree_sha: '3990c98a44a49c2c3827f61daad78915e33e948a',
        working_tree_dirty: true,
      },
      acquisition: { kind: 'local-unpublished' },
      reproducibility: { performed_by_web: false, independent_rebuild_claimed: false },
      files: {
        'native/nirs4all_core_wasm_native.js': { sha256: '39f8505794cc05e81c121654403cbac1d83d57b8a3a5d100e1191af1b9598f40' },
        'native/nirs4all_core_wasm_native_bg.wasm': { sha256: '3377eb6c0e2bcff7a042fce6c5c4af0dd7d5db3940ec15a645114c69cef1eab3' },
      },
    })
  })

  it('verifies the pinned local unpublished package without requiring a mutable sibling', () => {
    const script = fileURLToPath(new URL('../../scripts/sync-core-shim.mjs', import.meta.url))
    const verified = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
    expect(verified.status).toBe(0)
    expect(verified.stdout).toContain('nirs4all@0.5.0 local-unpublished (no registry identity) inventory and acquisition verified')
  })

  it('keeps the datasets upstream candidate aligned with the vendored WASM package', () => {
    const datasets = upstreams.find((item) => item.key === 'datasets')
    const pkg = JSON.parse(readFileSync(new URL('./wasm/datasets/package.json', import.meta.url), 'utf8')) as { name: string }

    expect(datasets?.candidates).toContain(pkg.name)
    expect(pkg.name).toBe('@nirs4all/datasets-wasm')
  })

  it('resolves methods through the V1 @nirs4all/methods package name', () => {
    const methods = upstreams.find((item) => item.key === 'methods')
    const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
    const vitestConfig = readFileSync(new URL('../../vitest.config.ts', import.meta.url), 'utf8')
    const vendorPkg = JSON.parse(readFileSync(new URL('../../vendor/nirs4all/package.json', import.meta.url), 'utf8')) as {
      peerDependencies: Record<string, string>
      peerDependenciesMeta: Record<string, unknown>
    }

    expect(methods?.candidates).toEqual(['@nirs4all/methods'])
    expect(viteConfig).toContain("'@nirs4all/methods':")
    expect(vitestConfig).toContain("'@nirs4all/methods':")
    expect(vendorPkg.peerDependencies['@nirs4all/methods']).toBe('>=1.3.13 <2')
    expect(vendorPkg.peerDependenciesMeta['@nirs4all/methods']).toBeTruthy()
    expect(viteConfig + vitestConfig + JSON.stringify(methods) + JSON.stringify(vendorPkg)).not.toContain('@nirs4all/methods' + '-wasm')
  })

  it('keeps current storage/loaders without retired runner exports', () => {
    for (const retired of ['parseExecutionPlan', 'runPortablePipeline', 'predictPortablePipeline']) expect(retired in nirs4allCore).toBe(false)
    expect(typeof openN4aContainer).toBe('function')
    expect(typeof writeN4aContainer).toBe('function')
    expect(typeof loadArchiveV2Native).toBe('function')
    expect(typeof inspectMethodsArchiveV2Predictors).toBe('function')
    expect(typeof replayMethodsArchiveV2).toBe('function')
    expect(typeof loadMethodsWasm).toBe('function')
    expect(typeof loadDatasetsWasm).toBe('function')
  })

  it('publishes only the native execution-profile definitions and no coarse capability metadata', () => {
    for (const retired of ['artifactContracts', 'capabilityManifest', 'controllerCapabilities',
      'requiredKeywordRegistryEntries', 'runtimeContracts', 'runtimeSurfaces']) {
      expect(retired in nirs4allCore).toBe(false)
    }
    const definitions = coreExecutionProfileDefinitions()
    expect(definitions.schema).toBe('nirs4all-core.execution-profiles.v1')
    expect(definitions.version).toBe(1)
    expect(definitions.runtime_surfaces).toEqual(['python', 'javascript_wasm', 'rust', 'matlab_octave'])
    expect(definitions.operations).toEqual([
      'compile', 'fit', 'predict', 'import', 'export', 'produce', 'inspect', 'calibrate', 'retrain', 'read', 'write', 'update',
    ])
    expect(definitions.profiles.map((item) => [item.id, item.version])).toEqual([
      ['native-workflow', 1],
      ['native-conformal', 1],
      ['native-methods-package', 1],
      ['native-n4a-canonical', 1],
      ['n4a-container', 1],
    ])
    const [workflow, conformal] = definitions.profiles
    expect(workflow.content_types).toEqual([
      { schema: 'nirs4all.native-pipeline.v1', owner: 'nirs4all-core', carried_in: 'native pipeline JSON envelope' },
    ])
    expect(conformal.content_types.map((item) => [item.schema, item.owner])).toEqual([['nirs4all.calibrated.v1', 'nirs4all-core']])
    expect(conformal.dependencies).toContain('dag_ml')
    expect(workflow.content_routes).toEqual([])
    const wasmRoutes = conformal.content_routes.filter((route) => route.surface === 'javascript_wasm')
    expect(wasmRoutes.map((route) => route.schema)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(wasmRoutes.filter((route) => route.route === 'archive_transfer').every((route) => route.archive_schema_version === 2)).toBe(true)
    expect(conformal.content_routes.filter((route) => route.schema).map((route) => route.schema)).not.toContain(undefined)
    expect(JSON.stringify(definitions)).not.toMatch(/legacy|portable_pipeline|runtime_contract|parity-validated|conformal_store/)
  })

  it('declares and exports the package replay and container storage cells used by Web', () => {
    // Metadata and exported functions are not numerical qualification.
    const profiles = new Map(coreExecutionProfileDefinitions().profiles.map((profile) => [String(profile.id), profile]))
    for (const [profileId, operation, symbol, entrypoint] of [
      ['native-methods-package', 'import', 'readPortableArchiveV2', readPortableArchiveV2],
      ['native-methods-package', 'predict', 'replayMethodsArchiveV2', replayMethodsArchiveV2],
      ['n4a-container', 'read', 'openN4aContainer', openN4aContainer],
      ['n4a-container', 'write', 'writeN4aContainer', writeN4aContainer],
    ] as const) {
      const profile = profiles.get(profileId)
      expect(profile, profileId).toBeDefined()
      const cell = new Map(Object.entries(profile!.operations)).get(operation)?.javascript_wasm
      expect(cell?.status, `${profileId}.${operation}`).toBe('supported')
      expect(cell?.status === 'supported' ? cell.entrypoints.map((item) => item.symbol) : [], `${profileId}.${operation}`).toEqual([symbol])
      expect(typeof entrypoint, symbol).toBe('function')
    }

    const methodsPackage = profiles.get('native-methods-package')!
    expect(methodsPackage.operations.fit.javascript_wasm.status).toBe('unsupported')
    expect(methodsPackage.limits).toContain(
      'Package V3 execution is not claimed on JavaScript/WASM: V3 is readable and storable there while its execution stays an explicit refusal. A V3 child is stored standalone; no archive-path retrain operation is introduced.',
    )
    const canonical = profiles.get('native-n4a-canonical')!
    expect(canonical.operations.fit.javascript_wasm.status).toBe('unsupported')
    expect(canonical.operations.export.javascript_wasm.status).toBe('unsupported')
  })

  it('declares the browser entrypoints and requirements of the JavaScript/WASM surface exactly', () => {
    const [workflow, conformal] = coreExecutionProfileDefinitions().profiles
    const symbols = (profile: typeof workflow, operation: 'fit' | 'predict' | 'import' | 'export' | 'compile') => {
      const entry = profile.operations[operation].javascript_wasm
      return entry.status === 'supported' ? entry.entrypoints.map((item) => item.symbol) : entry.reason
    }
    expect(symbols(workflow, 'fit')).toEqual(['runBrowserPipeline'])
    expect(symbols(workflow, 'predict')).toEqual(['BrowserNativePipeline.predict', 'predictBrowserPipeline'])
    expect(symbols(workflow, 'import')).toEqual(['loadBrowserPipeline'])
    expect(symbols(workflow, 'export')).toEqual(['BrowserNativePipeline.export'])
    expect(workflow.operations.compile.javascript_wasm.status).toBe('unsupported')
    expect(symbols(conformal, 'fit')).toEqual(['calibrate'])
    expect(conformal.operations.compile.javascript_wasm.status).toBe('unsupported')
    for (const profile of [workflow, conformal]) {
      expect(profile.runtime_requirements.javascript_wasm.join(' ')).toMatch(/WASM builds.*no native library path and no CLI/)
      expect(profile.runtime_requirements.python.join(' ')).toContain('nirs4all-core-archive CLI')
    }
  })

  it('keeps the snapshot a definition only: hash-verified, R federated and outside the Core surfaces', () => {
    const embedded = CORE_EXECUTION_PROFILES_JSON
    expect(createHash('sha256').update(embedded).digest('hex')).toBe(coreExecutionProfileDefinitionsSha256)
    expect(coreExecutionProfileDefinitions()).toEqual(JSON.parse(embedded))
    const mutated = coreExecutionProfileDefinitions()
    mutated.profiles.length = 0
    expect(coreExecutionProfileDefinitions().profiles).toHaveLength(5)
    const definitions = coreExecutionProfileDefinitions()
    expect(definitions.runtime_surfaces).not.toContain('r')
    const [federation] = definitions.external_federation
    expect(federation).toMatchObject({ surface: 'r', core_runtime_surface: false, status: 'externally-federated' })
    expect(federation.profiles).toEqual([
      'native-workflow', 'native-conformal', 'native-methods-package', 'native-n4a-canonical', 'n4a-container',
    ])
    // The generated file must not read as installed-runtime certification.
    const generated = readFileSync(new URL('./core-execution-profiles.generated.ts', import.meta.url), 'utf8')
    expect(generated).toContain('not\n// installed-runtime certification')
  })

  const coreFixture = new URL('../../../../nirs4all-core/tests/parity/expected/capability_profiles.json', import.meta.url)
  it.skipIf(!existsSync(coreFixture))('equals the Core owner fixture when the Core checkout is present', () => {
    expect(coreExecutionProfileDefinitions()).toEqual(JSON.parse(readFileSync(coreFixture, 'utf8')))
  })

  it('loads the vendored datasets WASM artifact', async () => {
    const datasets = await import('./wasm/datasets/nirs4all_datasets_wasm.js')
    const wasm = readFileSync(new URL('./wasm/datasets/nirs4all_datasets_wasm_bg.wasm', import.meta.url))
    const provenance = JSON.parse(
      readFileSync(new URL('./wasm/datasets/PROVENANCE.json', import.meta.url), 'utf8'),
    ) as { version: string; source: { commit: string }; build: { executions: number }; reproducibility: { independent_rebuild_claimed: boolean; byte_identical_rebuild_claimed: boolean } }
    datasets.initSync({ module: wasm })

    expect(datasets.abiVersion()).toBe('0.3.18')
    expect(provenance).toMatchObject({
      schema: 'nirs4all-web.public-npm-acquisition.v1',
      version: '0.3.18',
      source: { commit: '15fe4ce830f4985e5b628bcaf49d4106f45fa1e1' },
      build: { target: 'web', cargo_locked: true, executions: 1, wasm_bindgen: '0.2.129' },
      reproducibility: { performed_by_web: true, independent_rebuild_claimed: false },
    })
    expect(datasets.sha256(new Uint8Array([97, 98, 99]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('loads the pinned local dag-ml WASM coordinator', async () => {
    const dagml = await import('./wasm/dagml/dag_ml_wasm.js')
    const wasm = readFileSync(new URL('./wasm/dagml/dag_ml_wasm_bg.wasm', import.meta.url))
    const provenance = JSON.parse(
      readFileSync(new URL('./wasm/dagml/PROVENANCE.json', import.meta.url), 'utf8'),
    ) as { version: string; source: { kind: string; base_commit_sha: string }; reproducibility: { performed_by_web: boolean; independent_rebuild_claimed: boolean } }
    dagml.initSync({ module: wasm })

    const manifest = JSON.parse(dagml.contract_manifest_json()) as { crate: string; capabilities: string[] }
    expect(dagml.dag_ml_version()).toBe('0.4.0')
    expect(manifest.crate).toBe('dag-ml')
    expect(manifest.capabilities).toContain('execute_execution_plan_phase')
    expect(manifest.capabilities).toContain('loss_execution_attestation')
    expect(provenance).toMatchObject({
      version: '0.4.0',
      source: {
        kind: 'local-working-tree-export',
        base_commit_sha: '963abc4531789d6483e9d60d8d2e30549fc5ca9e',
        working_tree_dirty: true,
      },
      acquisition: { kind: 'local-unpublished' },
      reproducibility: { performed_by_web: false, independent_rebuild_claimed: false },
    })
  })

  it('compares the shared numerical oracle with the explicit frozen Core0.5 source reference', async () => {
    expect(existsSync(oracleUrl)).toBe(true)
    const oracle = JSON.parse(readFileSync(oracleUrl, 'utf8')) as {
      metadata: { tolerances: { targets_abs: number; rmse_abs: number; predictions_abs: number } }
      dataset: { X: number[]; y: number[]; rows: number; cols: number }
      cases: {
        name: string
        split: unknown
        targets: number[]
        variants: { n_components: number; rmse: number; predictions: number[] }[]
        selected: { n_components: number }
      }[]
    }
    const dataset = {
      X: Float64Array.from(oracle.dataset.X),
      y: Float64Array.from(oracle.dataset.y),
      rows: oracle.dataset.rows,
      cols: oracle.dataset.cols,
    }

    for (const expected of oracle.cases) {
      const fixture = readFileSync(new URL(`${expected.name}.json`, fixtureDir), 'utf8')
      const actual = await runPortablePipeline(fixture, dataset)
      expect(actual.split, expected.name).toEqual(expected.split)
      expect(maxAbsDiff(actual.targets, expected.targets), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.targets_abs)
      expect(actual.variants.length, expected.name).toBe(expected.variants.length)
      for (let i = 0; i < expected.variants.length; i += 1) {
        expect(actual.variants[i].n_components, expected.name).toBe(expected.variants[i].n_components)
        expect(Math.abs(actual.variants[i].rmse - expected.variants[i].rmse), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.rmse_abs)
        expect(maxAbsDiff(actual.variants[i].predictions, expected.variants[i].predictions), expected.name).toBeLessThanOrEqual(oracle.metadata.tolerances.predictions_abs)
      }
      expect(actual.selected.n_components, expected.name).toBe(expected.selected.n_components)
    }
  })

  it('preserves the historical Core reference separately from current Web execution', async () => {
    expect(existsSync(oracleUrl)).toBe(true)
    const oracle = JSON.parse(readFileSync(oracleUrl, 'utf8')) as {
      metadata: { tolerances: { predictions_abs: number } }
      dataset: { X: number[]; y: number[]; rows: number; cols: number }
      cases: {
        name: string
        split: { testIndices: number[] }
        selected: { n_components: number; predictions: number[] }
      }[]
    }
    const expected = oracle.cases.find((item) => item.name === 'portable_methods_pipeline')
    expect(expected).toBeTruthy()

    const ds: MaterializedDataset = {
      X: Float64Array.from(oracle.dataset.X),
      y: Float64Array.from(oracle.dataset.y),
      nSamples: oracle.dataset.rows,
      nFeatures: oracle.dataset.cols,
      axis: Array.from({ length: oracle.dataset.cols }, (_, i) => i),
      axisUnit: 'index',
      targetName: 'target',
      taskType: 'regression',
      sampleIds: Array.from({ length: oracle.dataset.rows }, (_, i) => `s${i}`),
      partitions: Array.from({ length: oracle.dataset.rows }, () => 'train' as const),
    }
    const dsl: PipelineDSL = {
      name: 'portable_methods_pipeline',
      split: { id: 'split', type: 'n4m:splitters.kennard_stone', params: { test_size: 0.3 } },
      steps: [
        { id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {} },
        { id: 'sg', type: 'n4m:preprocessing.derivatives.savitzky_golay', params: { window_length: 11, polyorder: 2, deriv: 0 } },
      ],
      model: {
        id: 'pls',
        type: 'n4m:models.pls.pls_regression',
        params: { n_components: 2 },
        sweeps: { n_components: { type: 'range', from: 2, to: 11, step: 2 } },
      },
    }

    // The imported dcc35fbe source copy is test-only, never the current Core facade or MainEngine.
    const source = { name: dsl.name, pipeline: [
      { class: 'nirs4all.operators.splitters.KennardStoneSplitter', params: dsl.split!.params },
      { class: 'nirs4all.operators.transforms.StandardNormalVariate', params: {} },
      { class: 'nirs4all.operators.transforms.SavitzkyGolay', params: dsl.steps[1].params },
      { model: { class: 'sklearn.cross_decomposition.PLSRegression', params: dsl.model!.params }, param: 'n_components', _range_: [2, 11, 2] },
    ] }
    const run = await runPortablePipeline(source, { X: ds.X, y: ds.y, rows: ds.nSamples, cols: ds.nFeatures })
    expect(run).toBeTruthy()
    expect(run.variants).toHaveLength(5)
    expect(run.selected.n_components).toBe(expected!.selected.n_components)
    expect(maxAbsDiff(run.selected.predictions, expected!.selected.predictions)).toBeLessThanOrEqual(
      oracle.metadata.tolerances.predictions_abs,
    )

    const predicted = await predictPortablePipeline(run, { X: ds.X, rows: ds.nSamples, cols: ds.nFeatures })
    const heldOut = expected!.split.testIndices.map((index) => predicted.data[index])
    expect(maxAbsDiff(Array.from(heldOut), expected!.selected.predictions)).toBeLessThanOrEqual(
      oracle.metadata.tolerances.predictions_abs,
    )

    const historicalModel = { dsl, nFeatures: ds.nFeatures, taskType: 'regression', state: { backendId: 'nirs4all-core-wasm' } } as FittedPipeline
    expect(isPortableCoreModel(historicalModel)).toBe(true)
    const retiredModel = { ...historicalModel, state: { backendId: 'nirs4all-lite-wasm' } } as FittedPipeline
    expect(isPortableCoreModel(retiredModel)).toBe(false)
  })

  it('rejects lossy n_components declarations before the owner holdout bank', async () => {
    const ds: MaterializedDataset = {
      X: Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      y: Float64Array.from([1, 2, 3, 4]),
      nSamples: 4,
      nFeatures: 2,
      axis: [0, 1],
      axisUnit: 'index',
      targetName: 'target',
      taskType: 'regression',
      sampleIds: ['s0', 's1', 's2', 's3'],
      partitions: ['train', 'train', 'train', 'train'],
    }

    await expect(tryRunSingleHoldout(ds, {
      name: 'fractional_component',
      split: { id: 's', type: 'n4m:splitters.kennard_stone', params: {} },
      steps: [],
      model: { id: 'pls', type: 'n4m:models.pls.pls_regression', params: { n_components: 1.5 } },
    })).rejects.toThrow(/n_components must be a positive safe integer/)

    await expect(tryRunSingleHoldout(ds, {
      name: 'fractional_component_range',
      split: { id: 's', type: 'n4m:splitters.kennard_stone', params: {} },
      steps: [],
      model: {
        id: 'pls',
        type: 'n4m:models.pls.pls_regression',
        params: { n_components: 2 },
        sweeps: { n_components: { type: 'range', from: 1.5, to: 3, step: 1 } },
      },
    })).rejects.toThrow(/range start must be a positive safe integer/)
  })
})
