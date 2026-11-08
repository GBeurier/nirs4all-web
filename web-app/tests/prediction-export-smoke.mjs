// Predict exports all rows locally, preserving class labels and Archive V2 identities.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const errors = []

async function open() {
  const page = await browser.newPage({ acceptDownloads: true })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  await page.goto(APP_URL, { waitUntil: 'load' })
  return page
}

async function predict(page, name, text, hasHeader) {
  await page.getByLabel('Spectra header row', { exact: true }).selectOption(hasHeader ? 'yes' : 'no')
  await page.locator('input[type=file][accept*="csv"]').first().setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: 'Export predictions', exact: true }).waitFor()
  await page.waitForFunction(() => !document.body.textContent.includes('Predicting…'))
}

async function download(page) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export predictions', exact: true }).click()
  const file = await event
  const csv = await readFile(await file.path(), 'utf8')
  return { name: file.suggestedFilename(), lines: csv.trimEnd().split('\r\n') }
}

try {
  // Regression: the on-screen preview is limited to 15 rows; the CSV is complete.
  for (const fixture of [
    { sample: 'Corn protein', path: '../src/data/demo/corn/Xtest.csv', classification: false },
    { sample: 'Meat species', path: '../src/data/demo/meat/Xtest.csv', classification: true },
  ]) {
    const page = await open()
    await page.locator('button').filter({ hasText: fixture.sample }).first().click()
    await page.locator('[data-step="pipeline"]').click()
    await page.getByRole('button', { name: /Run pipeline/i }).click()
    await page.getByText('CV Scores', { exact: true }).first().waitFor({ timeout: 60000 })
    await page.locator('[data-step="predict"]').click()
    const exportButton = page.getByRole('button', { name: 'Export predictions', exact: true })
    assert.equal(await exportButton.isDisabled(), true)
    const text = await readFile(new URL(fixture.path, import.meta.url), 'utf8')
    await predict(page, 'new-spectra.csv', text, true)
    assert.equal(await exportButton.isEnabled(), true)
    const csv = await download(page)
    const countText = await page.getByText(/First \d+ of \d+ predictions/).textContent()
    const [, preview, count] = countText.match(/First (\d+) of (\d+) predictions/)
    assert.equal(csv.lines.length, Number(count) + 1)
    assert.equal(Number(preview), Math.min(15, Number(count)))
    assert.equal(csv.name, 'new-spectra.predictions.csv')
    assert.match(csv.lines[0], fixture.classification ? /^row,predictedClass:/ : /^row,predicted:/)
    const displayed = await page.locator('tbody tr').first().locator('td').last().textContent()
    if (fixture.classification) assert.equal(csv.lines[1].split(',')[1], displayed)
    else assert.ok(Math.abs(Number(csv.lines[1].split(',')[1]) - Number(displayed)) < 0.001)

    // A failed replacement input must remove the old results and disable export.
    await predict(page, 'invalid.csv', '1\n2\n', false)
    assert.equal(await exportButton.isDisabled(), true)
    assert.equal(await page.getByText(/First \d+ of \d+ predictions/).count(), 0)
    console.log(`✓ ${fixture.classification ? 'classification labels' : 'regression values'} exported for all ${count} rows; failed input clears export`)
    await page.close()
  }

  // The accepted genuine Core V1 Package2 (SNV + Savitzky-Golay + PLS, width 7) staged by Root:
  // NIRS4ALL_WEB_OWNER_FIXTURES is the directory holding shared-model.n4a, independent.json
  // (.x 12x7) and shared-prediction.json (.point_prediction.values). The previous physical
  // Archive V2 fixtures are historical and intentionally refused, so they are not used here.
  const fixtures = process.env.NIRS4ALL_WEB_OWNER_FIXTURES
  if (!fixtures) {
    console.log('⚠ skipping the genuine Package2 section — NIRS4ALL_WEB_OWNER_FIXTURES is not set')
  } else {
    const model = await readFile(join(fixtures, 'shared-model.n4a'))
    const rows = JSON.parse(await readFile(join(fixtures, 'independent.json'), 'utf8')).x
    const expected = JSON.parse(await readFile(join(fixtures, 'shared-prediction.json'), 'utf8')).point_prediction.values.map((row) => row[0])
    const modelFile = (name) => ({ name, mimeType: 'application/octet-stream', buffer: model })
    const page = await open()
    await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(modelFile('shared-model.n4a'))
    await page.getByText('Predict on new spectra', { exact: true }).waitFor()
    const exportButton = page.getByRole('button', { name: 'Export predictions', exact: true })
    assert.equal(await exportButton.isDisabled(), true)
    await predict(page, 'matrix.csv', rows.map((row) => row.join(',')).join('\n') + '\n', false)
    const csv = await download(page)
    assert.match(csv.lines[0], /^sampleId,predicted:/)
    assert.equal(csv.lines.length, rows.length + 1)
    assert.deepEqual(csv.lines.slice(1).map((line) => line.split(',')[0]), rows.map((_, i) => `sample.${i}`))
    csv.lines.slice(1).forEach((line, i) => assert.ok(Math.abs(Number(line.split(',')[1]) - expected[i]) < 1e-10))
    console.log('✓ Package2 export preserves sample IDs, target header and the recorded owner values (< 1e-10)')

    // Selecting another model immediately invalidates completed and pending predictions.
    await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(modelFile('second-model.n4a'))
    await page.getByText('second-model', { exact: true }).waitFor()
    assert.equal(await exportButton.isDisabled(), true)
    assert.equal(await page.getByText(/First \d+ of \d+ predictions/).count(), 0)
    await page.evaluate(() => {
      const read = File.prototype.arrayBuffer // prediction files are read as bytes for nirs4all-io
      window.__predictionReadDone = false
      File.prototype.arrayBuffer = async function () {
        const bytes = await read.call(this)
        if (this.name === 'delayed.csv') {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          window.__predictionReadDone = true
        }
        return bytes
      }
    })
    await page.getByLabel('Spectra header row', { exact: true }).selectOption('no')
    await page.locator('input[type=file][accept*="csv"]').first().setInputFiles({
      name: 'delayed.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.map((row) => row.join(',')).join('\n') + '\n'),
    })
    await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(modelFile('third-model.n4a'))
    await page.getByText('third-model', { exact: true }).waitFor()
    await page.waitForFunction(() => window.__predictionReadDone)
    assert.equal(await exportButton.isDisabled(), true)
    assert.equal(await page.getByText(/First \d+ of \d+ predictions/).count(), 0)
    assert.equal(await page.getByText(/Scored delayed.csv/).count(), 0)
    console.log('✓ replacing a model clears completed results and ignores pending old input')
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
