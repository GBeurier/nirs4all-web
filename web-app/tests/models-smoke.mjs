// Exercise every model offered by the actual editor, with the shipped WASM,
// catalog defaults, real samples, CV/refit and prediction in a fresh worker.
// Model-only classification is deliberate: preprocessing bypassed the scheduler
// callback and hid its incorrect one-hot target metadata in older smoke tests.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const url = process.env.SMOKE_URL || 'http://localhost:4345/'
const samples = (process.env.MODEL_SAMPLES || 'corn,meat').split(',')
const sampleNames = { corn: 'Corn protein', beer: 'Beer extract', meat: 'Meat species', anopheles: 'Anopheles oocyst' }
const timeout = Number(process.env.MODEL_TIMEOUT_MS || 180000)
const selectedNames = process.env.MODEL_NAMES?.split(',')
const keepPreprocessing = process.env.MODEL_PREPROCESSING === 'preset'
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'],
})
const report = []

async function openSample(page, sample) {
  await page.goto(url, { waitUntil: 'load' })
  await page.locator('button').filter({ hasText: sampleNames[sample] }).first().click()
  await page.locator('[data-step="pipeline"]').click()
  // The last removable flow node is the model. Remove only preprocessing.
  const remove = page.getByRole('button', { name: 'Remove step', exact: true })
  if (!keepPreprocessing) {
    while (await remove.count() > 1) await remove.first().click()
  }
  await page.getByRole('button', { name: /PLS Regression|PLS-DA/ })
    .filter({ has: remove }).last().click()
}

try {
  for (const sample of samples) {
    assert(sampleNames[sample], `unknown sample ${sample}`)
    const discovery = await browser.newPage()
    await openSample(discovery, sample)
    await discovery.locator('#model-select').click()
    const offeredNames = await discovery.getByRole('option').allTextContents()
    const names = selectedNames ? offeredNames.filter((name) => selectedNames.includes(name)) : offeredNames
    await discovery.close()
    assert(names.length > 0, 'the model picker must expose models')

    for (const name of names) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
      const start = Date.now()
      try {
        await openSample(page, sample)
        await page.locator('#model-select').click()
        await page.getByRole('option', { name, exact: true }).click()
        await page.getByRole('button', { name: /Run pipeline/i }).click()
        // Stop on an error banner as well as success, avoiding a slow timeout
        // for a caught native exception that does not reach the JS console.
        await page.waitForFunction(() => window.__n4aLastRun || /Run refused|could not fit|n4m error/i.test(document.body.innerText), null, { timeout })
        const result = await page.evaluate(() => {
          const run = window.__n4aLastRun
          if (!run) return null
          return {
            type: run.model.dsl.model.type,
            steps: run.model.dsl.steps.length,
            cv: run.cv,
            refit: run.refit,
            folds: run.folds.length,
            classes: run.model.classes,
            lineage: run.lineage,
            diagnostics: run.diagnostics,
          }
        })
        assert(result, (await page.locator('body').innerText()).slice(-6000))
        if (!keepPreprocessing) assert.equal(result.steps, 0, 'exercise the model-only scheduler route')
        assert.equal(result.folds, 5)
        assert.equal(result.lineage.executed, true)
        assert(!result.lineage.schedulerFallback)
        assert.equal(result.diagnostics?.length || 0, 0)
        assert.equal(result.lineage.dataProvider.status, 'materialized')
        for (const score of [result.cv, result.refit]) {
          assert(score.predictions.length > 0)
          assert(score.predictions.every((row) => Number.isFinite(row.predicted)))
          assert.equal(new Set(score.predictions.map((row) => row.sampleId)).size, score.predictions.length)
          assert(Object.values(score.metrics).every(Number.isFinite))
        }
        if (sample === 'meat' || sample === 'anopheles') {
          assert.equal(result.classes.length, sample === 'meat' ? 3 : 2)
          assert(result.cv.predictions.every((row) => row.predicted >= 0 && row.predicted < result.classes.length))
        }
        await page.getByText('CV Scores', { exact: true }).first().waitFor()
        await page.locator('[data-step="predict"]').click()
        await page.locator('input[type=file]').last().setInputFiles(new URL(`../src/data/demo/${sample}/Xtest.csv`, import.meta.url).pathname)
        await page.locator('svg.recharts-surface').first().waitFor({ timeout: 30000 })
        assert.deepEqual(errors, [])
        report.push({ sample, name, type: result.type, status: 'passed', cv: result.cv.metrics, milliseconds: Date.now() - start })
        console.log(`✓ ${sample}: ${name} — CV, refit and prediction`)
      } catch (error) {
        report.push({ sample, name, status: 'failed', error: error.message, consoleErrors: errors, milliseconds: Date.now() - start })
        console.error(`✗ ${sample}: ${name} — ${error.message}`)
        process.exitCode = 1
      } finally {
        // Terminate an expensive worker via the same Cancel action as a user
        // before closing its page, including after a timeout.
        const cancel = page.getByRole('button', { name: 'Cancel', exact: true }).first()
        if (await cancel.isVisible()) await cancel.click()
        await page.close()
      }
      if (process.env.MODEL_REPORT) await writeFile(process.env.MODEL_REPORT, JSON.stringify({ url, report }, null, 2) + '\n')
    }
  }
} finally {
  await browser.close()
}
console.log(`MODEL SMOKE: ${report.filter((result) => result.status === 'passed').length}/${report.length} passed`)
