// Explain computes a grouped, model-agnostic explanation in the browser worker with the
// Methods WASM explain session, renders the shared charts and exports an additive
// nirs4all.explanation.v1 envelope whose explained rows map to source sample indices.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const errors = []

try {
  const page = await browser.newPage({ acceptDownloads: true })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.getByText('CV Scores', { exact: false }).first().waitFor({ timeout: 90000 })

  // Score a prediction file so the Explain step can explain those rows.
  await page.locator('[data-step="predict"]').click()
  await page.getByLabel('Spectra header row', { exact: true }).selectOption('yes')
  const text = await readFile(new URL('../src/data/demo/corn/Xtest.csv', import.meta.url), 'utf8')
  await page.locator('input[type=file][accept*="csv"]').first().setInputFiles({ name: 'corn-test.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
  await page.getByRole('button', { name: 'Export predictions', exact: true }).waitFor()
  await page.waitForFunction(() => !document.body.textContent.includes('Predicting…'))

  await page.locator('[data-step="explain"]').click()
  await page.getByText('Explain predictions', { exact: false }).first().waitFor()
  // The model picker lists the run's refit model and keeps it selected.
  const picked = await page.getByLabel('Model', { exact: true }).evaluate((select) => select.options[select.selectedIndex]?.textContent ?? '')
  assert.match(picked, /RMSE|best of|·/, `model picker shows the selected run (${picked})`)
  await page.getByLabel('Explain method').selectOption('permutation_shap')
  await page.getByLabel('Explain baseline').selectOption('background')
  await page.getByLabel('Explain grouping').selectOption('fixed_width')
  const started = Date.now()
  await page.getByRole('button', { name: /Run explanation/ }).click()
  await page.getByRole('button', { name: /Download explanation/ }).waitFor({ timeout: 180000 })
  const seconds = (Date.now() - started) / 1000
  await page.getByText('Spectral importance', { exact: true }).waitFor()
  assert.ok(await page.locator('text=Waterfall').count() > 0, 'additive methods show a waterfall')

  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download explanation/ }).click()
  const envelope = JSON.parse(await readFile(await (await event).path(), 'utf8'))
  assert.equal(envelope.schema, 'nirs4all.explanation.v1')
  assert.equal(envelope.kind, 'permutation_shap')
  assert.equal(envelope.engine.name, 'nirs4all-methods')
  assert.equal(envelope.additive, true)
  assert.equal(envelope.attribution_space, 'raw_input')
  assert.equal(envelope.rows.count, envelope.rows.sample_indices.length)
  assert.equal(envelope.attributions.length, envelope.rows.count)
  assert.equal(new Set(envelope.rows.sample_indices).size, envelope.rows.count, 'source indices are distinct')
  assert.ok(envelope.additivity_max_abs_error < 1e-8, `additivity error ${envelope.additivity_max_abs_error}`)
  for (let r = 0; r < envelope.rows.count; r += 1) {
    const total = envelope.attributions[r].reduce((sum, group) => sum + group[0], 0)
    assert.ok(Math.abs(envelope.expected_value[r][0] + total - envelope.prediction[r][0]) < 1e-8)
  }
  assert.equal(envelope.groups.length, envelope.attributions[0].length)
  assert.ok(envelope.axis.unit === null ? envelope.axis.kind === 'feature_index' : envelope.axis.values.length > 0)
  console.log(`✓ permutation SHAP explained ${envelope.rows.count} rows x ${envelope.groups.length} groups in ${seconds.toFixed(1)}s (axis ${envelope.axis.kind}${envelope.axis.unit ? ` ${envelope.axis.unit}` : ''}); additive to ${envelope.additivity_max_abs_error.toExponential(1)}`)
  await page.screenshot({ path: process.env.EXPLAIN_SCREENSHOT || '/tmp/explain-smoke.png', fullPage: true })

  // Full-resolution option: every wavelength, every dataset row (test + train), single-reference baseline.
  await page.getByLabel('Explained rows source').selectOption('dataset_rows')
  await page.getByLabel('Explain all rows').check()
  await page.getByLabel('Explain grouping').selectOption('per_feature')
  await page.getByLabel('Explain baseline').selectOption('mean')
  const estimate = await page.locator('[data-explain-estimate]').textContent()
  const fullStart = Date.now()
  const fullDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /Run explanation/ }).click()
  await page.getByRole('button', { name: /Download explanation/ }).waitFor({ timeout: 600000 })
  const fullSeconds = (Date.now() - fullStart) / 1000
  await page.getByRole('button', { name: /Download explanation/ }).click()
  const full = JSON.parse(await readFile(await (await fullDownload).path(), 'utf8'))
  assert.equal(full.groups.length, envelope.feature_names?.length ?? full.groups.length)
  assert.equal(full.rows.source, 'dataset_rows')
  assert.ok(full.additivity_max_abs_error < 1e-8)
  console.log(`✓ per-wavelength SHAP: ${full.rows.count} rows (test + train) x ${full.groups.length} wavelengths in ${fullSeconds.toFixed(1)}s, mean baseline; estimate "${estimate?.trim()}"; additive to ${full.additivity_max_abs_error.toExponential(1)}`)
  assert.deepEqual(errors, [])
  await page.close()
} finally {
  await browser.close()
}
