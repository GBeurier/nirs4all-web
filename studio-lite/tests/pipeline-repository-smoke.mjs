// End-to-end pipeline repository smoke: upload a non-sample CSV dataset fixture,
// import a deterministic repository pipeline descriptor, execute it, reload into
// a fresh session, import the same descriptor again, and compare the rendered run.
// This validates the client-only repository artifact path with the real Web/WASM app.
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import {
  assertResultsPanels,
  collectRuntimeEvidence,
  compareRunPredictionSummaries,
  runPredictionSummary,
  sha256File,
} from './smoke-evidence-helpers.mjs'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4355/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const PIPELINE_NAME = 'Pipeline repository roundtrip'
const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(TEST_DIR, 'fixtures', 'pipeline-repository')
const MANIFEST_PATH = join(FIXTURE_DIR, 'manifest.json')
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(tmpdir(), 'n4a-web-pipeline-repository-smoke')

const evidence = {
  schema_version: 'n4a.web.pipeline_repository_smoke/v1',
  status: 'failed',
  app_url: APP_URL,
  repository_manifest: null,
  repository_pipeline_id: null,
  repository_pipeline_id_stable: false,
  repository_dataset_id: null,
  repository_dataset_id_non_demo_sample: false,
  repository_descriptor_sha256: null,
  repository_descriptor_verified: false,
  repository_pipeline_artifact: null,
  repository_pipeline_bytes: null,
  repository_pipeline_sha256: null,
  repository_pipeline_shape: null,
  uploaded_dataset_files: [],
  dataset_badge: null,
  exported_pipeline_artifact: null,
  exported_pipeline_bytes: null,
  exported_pipeline_sha256: null,
  imported_pipeline_name: PIPELINE_NAME,
  executed_imported_pipeline: false,
  original_results_panels: null,
  imported_results_panels: null,
  original_runtime: null,
  imported_runtime: null,
  prediction_comparison: null,
  console_error_count: 0,
  console_errors_absent: false,
  failed_request_count: 0,
  unexpected_dialog_count: 0,
  screenshot_artifact: null,
  evidence_artifact: null,
  gaps: [
    {
      id: 'python_wasm_oracle',
      status: 'not_available_in_studio_lite_tests_scope',
      detail: 'This smoke compares deterministic browser Web/WASM runs from the repository descriptor. No Python oracle or cross-runtime WASM oracle artifact is available under studio-lite/tests.',
    },
    {
      id: 'app_preserved_repository_metadata',
      status: 'not_available_in_current_pipeline_dsl',
      detail: 'The app imports pure PipelineDSL JSON; repository pipeline_id and descriptor_sha256 are verified from the manifest fixture before import and recorded in evidence, but the editor does not preserve those fields in the DSL.',
    },
  ],
  console_errors: [],
  failed_requests: [],
  dialogs: [],
}

async function writeEvidence() {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  evidence.console_errors = errors
  evidence.console_error_count = errors.length
  evidence.console_errors_absent = errors.length === 0
  evidence.failed_requests = bad404
  evidence.failed_request_count = bad404.length
  evidence.dialogs = dialogs
  evidence.unexpected_dialog_count = dialogs.length
  const screenshotPath = join(ARTIFACTS_DIR, 'web-results.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const screenshotStats = await stat(screenshotPath)
  evidence.screenshot_artifact = { path: screenshotPath, bytes: screenshotStats.size, non_empty: screenshotStats.size > 0 }
  if (screenshotStats.size <= 0) {
    console.error('✗ screenshot artifact is empty')
    process.exitCode = 1
  }
  const evidencePath = join(ARTIFACTS_DIR, 'pipeline-repository-smoke.json')
  let evidenceText = ''
  let evidenceBytes = 0
  for (let index = 0; index < 4; index += 1) {
    evidence.evidence_artifact = { path: evidencePath, bytes: evidenceBytes, non_empty: evidenceBytes > 0 }
    evidenceText = JSON.stringify(evidence, null, 2) + '\n'
    const nextBytes = Buffer.byteLength(evidenceText)
    if (nextBytes === evidenceBytes) break
    evidenceBytes = nextBytes
  }
  evidence.evidence_artifact = { path: evidencePath, bytes: evidenceBytes, non_empty: evidenceBytes > 0 }
  evidenceText = JSON.stringify(evidence, null, 2) + '\n'
  await writeFile(evidencePath, evidenceText)
  if (evidenceBytes <= 0) {
    console.error('✗ evidence artifact is empty')
    process.exitCode = 1
  }
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
const bad404 = []
const dialogs = []

page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/.test(r.url())) bad404.push(`${r.status()} ${r.url()}`)
})
page.on('dialog', async (d) => {
  dialogs.push(d.message())
  await d.dismiss()
})

const fail = (m) => {
  console.error('✗ ' + m)
  process.exitCode = 1
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

function isStableId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{4,127}$/.test(value)
}

function isNonDemoDatasetId(value) {
  return typeof value === 'string' && value.length > 0 && !/(^|[-_:./])(demo|sample)([-_:./]|$)/i.test(value)
}

function assertRepositoryPipelineShape(value) {
  if (!value || typeof value !== 'object') throw new Error('repository pipeline descriptor is not an object')
  if (value.name !== PIPELINE_NAME) throw new Error(`repository pipeline name mismatch: ${value.name}`)
  if (!Array.isArray(value.steps)) throw new Error('repository pipeline descriptor has no steps array')
  if (!value.model || typeof value.model !== 'object') throw new Error('repository pipeline descriptor has no model')
  if (!isStableId(value.model.id)) throw new Error(`repository model id is not stable: ${value.model.id}`)
  for (const step of value.steps) {
    if (!isStableId(step?.id)) throw new Error(`repository step id is not stable: ${step?.id}`)
  }
  if (!value.cv || typeof value.cv !== 'object' || !Number.isInteger(value.cv.folds) || value.cv.folds < 2) {
    throw new Error('repository pipeline descriptor has no concrete CV config')
  }
  return {
    name: value.name,
    step_count: value.steps.length,
    step_ids: value.steps.map((step) => step.id),
    model_id: value.model.id,
    model_type: value.model.type ?? null,
    cv_folds: value.cv.folds,
    cv_seed: value.cv.seed ?? null,
  }
}

async function loadRepositoryFixture() {
  const manifest = await readJson(MANIFEST_PATH)
  evidence.repository_manifest = manifest
  evidence.repository_pipeline_id = manifest.pipeline_id ?? null
  evidence.repository_pipeline_id_stable = isStableId(manifest.pipeline_id)
  if (!evidence.repository_pipeline_id_stable) throw new Error(`repository pipeline_id is not stable: ${manifest.pipeline_id}`)

  evidence.repository_dataset_id = manifest.dataset_id ?? null
  evidence.repository_dataset_id_non_demo_sample = isNonDemoDatasetId(manifest.dataset_id)
  if (!evidence.repository_dataset_id_non_demo_sample) throw new Error(`repository dataset_id must not be demo/sample: ${manifest.dataset_id}`)

  const pipelinePath = join(FIXTURE_DIR, manifest.pipeline_file)
  const pipelineHash = await sha256File(pipelinePath)
  evidence.repository_pipeline_artifact = manifest.pipeline_file
  evidence.repository_pipeline_bytes = pipelineHash.bytes
  evidence.repository_pipeline_sha256 = pipelineHash.sha256
  evidence.repository_descriptor_sha256 = manifest.descriptor_sha256 ?? null
  evidence.repository_descriptor_verified = pipelineHash.sha256 === manifest.descriptor_sha256
  if (pipelineHash.bytes <= 0) throw new Error('repository pipeline descriptor is empty')
  if (!evidence.repository_descriptor_verified) {
    throw new Error(`repository descriptor_sha256 mismatch: manifest ${manifest.descriptor_sha256} != actual ${pipelineHash.sha256}`)
  }

  const pipeline = await readJson(pipelinePath)
  evidence.repository_pipeline_shape = assertRepositoryPipelineShape(pipeline)
  const datasetFiles = (manifest.dataset_files ?? []).map((file) => join(FIXTURE_DIR, file))
  if (datasetFiles.length === 0) throw new Error('repository manifest has no dataset_files')
  evidence.uploaded_dataset_files = manifest.dataset_files
  return { manifest, pipelinePath, datasetFiles }
}

async function loadRepositoryDatasetAndOpenPipeline() {
  await page.locator('input[type=file][accept*=".csv"]').first().setInputFiles(repository.datasetFiles)
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  evidence.dataset_badge = ((await page.locator('text=/samples ×/').first().textContent()) || '').trim()
  if (!evidence.dataset_badge || !/20 samples × 6 wavelengths/.test(evidence.dataset_badge)) {
    throw new Error(`repository dataset did not render the expected non-sample badge: ${evidence.dataset_badge}`)
  }
  await page.locator('[data-step="pipeline"]').click()
}

async function importRepositoryPipeline() {
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(repository.pipelinePath)
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector('input[aria-label="Pipeline name"]')
      return input instanceof HTMLInputElement && input.value === expected
    },
    PIPELINE_NAME,
    { timeout: 15000 },
  )
}

const repository = await loadRepositoryFixture()

try {
  // 1. import a concrete repository pipeline artifact over a non-sample uploaded dataset.
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadRepositoryDatasetAndOpenPipeline()
  await importRepositoryPipeline()
  console.log(`✓ repository descriptor verified (${repository.manifest.pipeline_id}, ${repository.manifest.descriptor_sha256})`)
  console.log(`✓ uploaded repository dataset ${repository.manifest.dataset_id} → "${evidence.dataset_badge}"`)
  console.log('✓ imported repository pipeline artifact into the editor')

  // 2. export the imported pipeline once to prove the editor still emits a non-empty artifact.
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: /^Export/i }).click(),
  ]).then(([d]) => d)
  const pipelinePath = join(tmpdir(), 'pipeline-repository-roundtrip.pipeline.json')
  await download.saveAs(pipelinePath)
  evidence.exported_pipeline_artifact = download.suggestedFilename()
  const exportedHash = await sha256File(pipelinePath)
  evidence.exported_pipeline_bytes = exportedHash.bytes
  evidence.exported_pipeline_sha256 = exportedHash.sha256
  if (exportedHash.bytes <= 0) fail('exported pipeline artifact is empty')
  if (!/\.pipeline\.json$/.test(download.suggestedFilename())) fail('exported file is not a .pipeline.json artifact')
  else console.log(`✓ exported pipeline artifact → ${download.suggestedFilename()}`)
  const exportedJson = await readFile(pipelinePath, 'utf8')
  if (sha256Text(exportedJson) !== exportedHash.sha256) fail('exported pipeline artifact hash is not reproducible')

  // 3. run the repository-imported pipeline once so the fresh import has a numeric baseline.
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.original_results_panels = await assertResultsPanels(page)
  evidence.original_runtime = await collectRuntimeEvidence(page)
  const originalPredictions = await runPredictionSummary(page)
  if (!originalPredictions?.prediction_count) fail('repository pipeline did not expose numeric predictions')
  else console.log(`✓ repository pipeline produced ${originalPredictions.prediction_count} comparable predictions`)

  // 4. reload the app fresh, re-upload the non-sample dataset, and import the repository pipeline JSON again.
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadRepositoryDatasetAndOpenPipeline()
  await importRepositoryPipeline()
  console.log('✓ imported repository pipeline artifact into a fresh session')

  // 5. run the imported pipeline to prove the artifact is actionable client-side.
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.executed_imported_pipeline = true
  evidence.imported_results_panels = await assertResultsPanels(page)
  evidence.imported_runtime = await collectRuntimeEvidence(page)
  const importedPredictions = await runPredictionSummary(page)
  evidence.prediction_comparison = compareRunPredictionSummaries(originalPredictions, importedPredictions)
  console.log('✓ imported pipeline executed to results')
  console.log(`✓ imported predictions match source run (max Δ ${evidence.prediction_comparison.max_abs_delta})`)

  if (dialogs.length) fail(`unexpected dialog(s): ${dialogs.join(' | ')}`)
  if (bad404.length) fail(`${bad404.length} failed request(s): ${bad404.slice(0, 4).join(' | ')}`)
  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  if (!process.exitCode && !errors.length && !bad404.length && !dialogs.length) {
    evidence.status = 'passed'
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
  for (const d of dialogs.slice(0, 4)) console.error('   dialog: ' + d)
} finally {
  await writeEvidence()
  await browser.close()
}

console.log(process.exitCode ? 'PIPELINE-REPOSITORY SMOKE FAILED' : 'PIPELINE-REPOSITORY SMOKE PASSED')
