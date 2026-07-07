import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || ''
const FAMILY_FILE = process.env.PIPELINE_FAMILY || (ARTIFACTS_DIR ? join(ARTIFACTS_DIR, 'pipeline-family.json') : '')

const pythonLedger = {
  schema_version: 'n4a.e2e.python_vs_dagml_perf/v1',
  status: 'failed',
  source: FAMILY_FILE,
}

const runtimeLedger = {
  schema_version: 'n4a.e2e.web_runtime_perf/v1',
  status: 'failed',
  app_url: APP_URL,
  source: FAMILY_FILE,
  web: {
    backend: null,
    pipeline_run_seconds: null,
    rendered_cv_scores: false,
    dag_ml: null,
  },
  studio: {
    included_in_gate: false,
    reason: 'nirs4all-studio production release is outside this Web-only performance gate; add a dedicated Studio runtime entrypoint before treating this as Studio coverage.',
  },
  console_errors: [],
}

function fail(message) {
  console.error('✗ ' + message)
  pythonLedger.failure = message
  runtimeLedger.failure = message
  process.exitCode = 1
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return value
}

function validateFamily(value) {
  const family = assertRecord(value, 'pipeline-family')
  if (family.status !== 'passed') throw new Error(`pipeline-family status must be passed, got ${JSON.stringify(family.status)}`)
  const parity = assertRecord(family.parity, 'pipeline-family.parity')
  const tolerance = assertNumber(parity.tolerance, 'parity.tolerance')
  const predictionAbsMax = assertNumber(parity.prediction_abs_max, 'parity.prediction_abs_max')
  const bestRmseAbs = assertNumber(parity.best_rmse_abs, 'parity.best_rmse_abs')
  if (predictionAbsMax > tolerance) throw new Error(`prediction_abs_max ${predictionAbsMax} exceeds ${tolerance}`)
  if (bestRmseAbs > 1e-9) throw new Error(`best_rmse_abs ${bestRmseAbs} exceeds 1e-9`)
  const performance = assertRecord(family.performance, 'pipeline-family.performance')
  assertNumber(performance.legacy_seconds, 'performance.legacy_seconds')
  assertNumber(performance.dag_ml_seconds, 'performance.dag_ml_seconds')
  return family
}

function assertDagMlRun(value) {
  const run = assertRecord(value, 'window.__n4aLastRun')
  if (run.engine !== 'dag-ml-wasm + libn4m') throw new Error(`web run engine must be dag-ml-wasm + libn4m, got ${JSON.stringify(run.engine)}`)
  const lineage = assertRecord(run.lineage, 'web run lineage')
  if (lineage.engine !== 'dag-ml-wasm') throw new Error(`web lineage engine must be dag-ml-wasm, got ${JSON.stringify(lineage.engine)}`)
  if (lineage.compiled !== true) throw new Error('web dag-ml lineage must report compiled=true')
  if (lineage.executed !== true) throw new Error('web dag-ml lineage must report executed=true')
  if (lineage.schedulerFallback) throw new Error('web dag-ml run used schedulerFallback')
  if (Array.isArray(run.diagnostics) && run.diagnostics.length > 0) throw new Error(`web dag-ml run reported diagnostics: ${JSON.stringify(run.diagnostics.slice(0, 3))}`)
  const cv = assertRecord(run.cv, 'web run cv')
  const predictions = Array.isArray(cv.predictions) ? cv.predictions : []
  if (predictions.length === 0) throw new Error('web dag-ml run produced no CV predictions')
  const variantCount = assertNumber(run.variantCount, 'web run variantCount')
  if (variantCount < 1) throw new Error(`web run variantCount must be >= 1, got ${variantCount}`)
  return {
    backend: run.engine,
    lineage: {
      engine: lineage.engine,
      compiled: lineage.compiled,
      executed: lineage.executed,
      schedulerFallback: Boolean(lineage.schedulerFallback),
      phase: lineage.phase ?? null,
      variantCount: lineage.variantCount ?? null,
      folds: lineage.folds ?? null,
      dataProviderStatus: lineage.dataProvider?.status ?? null,
    },
    cv_predictions: predictions.length,
    variantCount,
  }
}

async function writeEvidence() {
  if (!ARTIFACTS_DIR) return
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  await writeFile(join(ARTIFACTS_DIR, 'python-vs-dagml.json'), JSON.stringify(pythonLedger, null, 2) + '\n')
  await writeFile(join(ARTIFACTS_DIR, 'web-runtime.json'), JSON.stringify(runtimeLedger, null, 2) + '\n')
}

let browser
try {
  if (!ARTIFACTS_DIR) throw new Error('ARTIFACTS_DIR is required for performance comparison evidence')
  const family = validateFamily(JSON.parse(await readFile(FAMILY_FILE, 'utf8')))
  pythonLedger.status = 'passed'
  pythonLedger.case = family.case
  pythonLedger.parity = family.parity
  pythonLedger.performance = family.performance
  pythonLedger.runs = family.runs
  pythonLedger.python_open_pipeline = family.python_open_pipeline

  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push('PAGEERR: ' + error.message))

  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()

  const start = performance.now()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  runtimeLedger.web.pipeline_run_seconds = (performance.now() - start) / 1000
  runtimeLedger.web.rendered_cv_scores = true
  const observedDagMl = assertDagMlRun(await page.evaluate(() => window.__n4aLastRun))
  runtimeLedger.web.backend = observedDagMl.backend
  runtimeLedger.web.dag_ml = observedDagMl

  if (!/by dag-ml/i.test((await page.textContent('body')) || '')) {
    throw new Error('expected a visible "by dag-ml" badge after the Web run')
  }

  if (errors.length) {
    runtimeLedger.console_errors = errors.slice(0, 10)
    throw new Error(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  }

  runtimeLedger.status = 'passed'
  console.log(`✓ Python legacy/dag-ml parity ledger passed (${family.performance.verdict})`)
  console.log(`✓ Web dag-ml WASM run executed ${observedDagMl.cv_predictions} CV predictions in ${runtimeLedger.web.pipeline_run_seconds.toFixed(3)}s`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close()
  await writeEvidence()
}

console.log(process.exitCode ? 'PERFORMANCE-COMPARE SMOKE FAILED' : 'PERFORMANCE-COMPARE SMOKE PASSED')
