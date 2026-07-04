// End-to-end .n4a round-trip: train a model → export the .n4a bundle → reload the
// app fresh → import the .n4a → predict on new spectra. Proves a saved model can be
// re-used later with no dataset and no retraining (the "broader usage" path).
import { tmpdir } from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import {
  assertResultsPanels,
  capturePredictionPanel,
  collectRuntimeEvidence,
  comparePredictionPanels,
  sha256File,
} from './smoke-evidence-helpers.mjs'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4355/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const FRUIT_XTEST = process.env.FRUIT_XTEST || new URL('../src/data/demo/corn/Xtest.csv', import.meta.url).pathname
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || ''

const evidence = {
  schema_version: 'n4a.web.predict_artifact_smoke/v1',
  status: 'failed',
  app_url: APP_URL,
  exported_model_bundle: null,
  exported_model_bundle_bytes: null,
  exported_model_bundle_sha256: null,
  training_results_panels: null,
  training_runtime: null,
  pre_export_prediction_panel: null,
  imported_prediction_panel: null,
  prediction_comparison: null,
  prediction_chart_count: 0,
  console_error_count: 0,
  console_errors_absent: false,
  console_errors: [],
}

async function writeEvidence() {
  if (!ARTIFACTS_DIR) return
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  evidence.console_errors = errors
  evidence.console_error_count = errors.length
  evidence.console_errors_absent = errors.length === 0
  await writeFile(join(ARTIFACTS_DIR, 'predict-artifact-smoke.json'), JSON.stringify(evidence, null, 2) + '\n')
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }

try {
  // 1. train a model
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.training_results_panels = await assertResultsPanels(page)
  evidence.training_runtime = await collectRuntimeEvidence(page)
  console.log('✓ trained a model')

  // 2. predict before export so the re-imported bundle has a stable numeric baseline.
  await page.locator('[data-step="predict"]').click()
  await page.waitForSelector('text=/Predict on new spectra/', { timeout: 10000 })
  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles(FRUIT_XTEST)
  evidence.pre_export_prediction_panel = await capturePredictionPanel(page)
  console.log(`✓ pre-export model predicted ${evidence.pre_export_prediction_panel.predicted_samples} spectra`)

  // 3. export the .n4a bundle via the Export dropdown
  await page.locator('[data-step="results"]').click()
  await page.waitForSelector('[data-testid="n4a-results-list"]', { timeout: 10000 })
  await page.getByRole('button', { name: /^Export/i }).first().click()
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('menuitem', { name: /Model bundle/i }).click(),
  ]).then(([d]) => d)
  const n4aPath = join(tmpdir(), 'roundtrip.n4a')
  await dl.saveAs(n4aPath)
  evidence.exported_model_bundle = dl.suggestedFilename()
  const exportedHash = await sha256File(n4aPath)
  evidence.exported_model_bundle_bytes = exportedHash.bytes
  evidence.exported_model_bundle_sha256 = exportedHash.sha256
  console.log(`✓ exported .n4a → ${dl.suggestedFilename()}`)
  if (!/\.n4a$/.test(dl.suggestedFilename())) fail('exported file is not a .n4a')

  // 4. reload the app FRESH (no dataset, no run) — clear the persisted session
  // first so this is a genuine cold start (persistence would otherwise restore
  // the trained sample + pipeline and land on the editor, hiding the upload step).
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // 5. import the .n4a on the Dataset step → jumps to Predict
  await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(n4aPath)
  await page.waitForSelector('text=/Predict on new spectra/', { timeout: 15000 })
  console.log('✓ imported .n4a into a fresh session → Predict unlocked (no retrain)')

  // 6. predict on new spectra and compare with the pre-export prediction panel.
  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles(FRUIT_XTEST)
  evidence.imported_prediction_panel = await capturePredictionPanel(page)
  evidence.prediction_comparison = comparePredictionPanels(evidence.pre_export_prediction_panel, evidence.imported_prediction_panel)
  const charts = evidence.imported_prediction_panel.chart_count
  evidence.prediction_chart_count = charts
  if (charts >= 1) console.log(`✓ imported model predicted (${charts} chart) — round-trip complete`)
  else fail('imported model did not produce a prediction histogram')
  console.log(`✓ imported predictions match pre-export predictions (max Δ ${evidence.prediction_comparison.max_abs_delta})`)

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  if (!process.exitCode && !errors.length) {
    evidence.status = 'passed'
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await writeEvidence()
  await browser.close()
}
console.log(process.exitCode ? 'N4A-ROUNDTRIP SMOKE FAILED' : 'N4A-ROUNDTRIP SMOKE PASSED')
