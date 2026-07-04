// End-to-end pipeline repository round-trip: export a pipeline JSON from the
// browser editor, reload into a fresh session, import that JSON, and run it.
// This validates the client-only pipeline artifact path with the real Web/WASM app.
import { tmpdir } from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || ''

const evidence = {
  schema_version: 'n4a.web.pipeline_repository_smoke/v1',
  status: 'failed',
  app_url: APP_URL,
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
  console_errors: [],
  failed_requests: [],
  dialogs: [],
}

async function writeEvidence() {
  if (!ARTIFACTS_DIR) return
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  evidence.console_errors = errors
  evidence.console_error_count = errors.length
  evidence.console_errors_absent = errors.length === 0
  evidence.failed_requests = bad404
  evidence.failed_request_count = bad404.length
  evidence.dialogs = dialogs
  evidence.unexpected_dialog_count = dialogs.length
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'web-results.png'), fullPage: true })
  await writeFile(join(ARTIFACTS_DIR, 'pipeline-repository-smoke.json'), JSON.stringify(evidence, null, 2) + '\n')
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

async function loadSampleAndOpenPipeline() {
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
}

try {
  // 1. export a concrete pipeline artifact from the editor
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadSampleAndOpenPipeline()
  await page.getByLabel('Pipeline name').fill(PIPELINE_NAME)
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
  if (!/\.pipeline\.json$/.test(download.suggestedFilename())) fail('exported file is not a .pipeline.json artifact')
  else console.log(`✓ exported pipeline artifact → ${download.suggestedFilename()}`)

  // 2. run the source pipeline once so the imported artifact has a numeric baseline.
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.original_results_panels = await assertResultsPanels(page)
  evidence.original_runtime = await collectRuntimeEvidence(page)
  const originalPredictions = await runPredictionSummary(page)
  if (!originalPredictions?.prediction_count) fail('source pipeline did not expose numeric predictions')
  else console.log(`✓ source pipeline produced ${originalPredictions.prediction_count} comparable predictions`)

  // 3. reload the app fresh, re-open the editor, and import the pipeline JSON
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadSampleAndOpenPipeline()
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(pipelinePath)
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector('input[aria-label="Pipeline name"]')
      return input instanceof HTMLInputElement && input.value === expected
    },
    PIPELINE_NAME,
    { timeout: 15000 },
  )
  console.log('✓ imported pipeline artifact into a fresh session')

  // 4. run the imported pipeline to prove the artifact is actionable client-side
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
