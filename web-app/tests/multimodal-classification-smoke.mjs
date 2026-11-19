// Real-data classification: the bundled public rice subset (declared class vocabulary)
// -> worker -> native DAG (stratified folds, OOF probabilities) / Methods PLS-DA -> Inspector.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const output = process.env.MULTIMODAL_CLASSIFICATION_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-classification')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = [], mutations = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
const lab = page.locator('[data-fusion-lab]')
const status = page.locator('.n4fl-status')

async function run(preset, count) {
  await lab.locator('.n4fl-chip', { hasText: preset }).first().click()
  await page.getByRole('button', { name: 'Run this pipeline', exact: true }).click()
  await page.waitForFunction(expected => new RegExp(`${expected} runs? added to the comparison`).test(document.querySelector('.n4fl-status')?.textContent ?? ''),
    count, { timeout: 600000 })
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Example datasets', exact: true }).click()
  await page.locator('.n4mm-list__item', { hasText: 'Rice varieties' }).getByRole('button').click()
  await lab.waitFor({ timeout: 120000 })
  // The analysis follows the data: spectra and images, with classifier presets only.
  assert.equal(await page.locator('input[name="n4mm-case"][value="images"]').isChecked(), true)
  const presets = await lab.locator('.n4fl-chip').allInnerTexts()
  assert.ok(presets.includes('Late · average') && presets.includes('Late · stacking') && presets.includes('Mid · CNN (Burn)'))

  await run('HSI pixel centre alone', 3) // PLS-DA, components swept 5/10/15
  await run('Late · average', 1)          // mean of OOF class probabilities, argmax label
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const path = join(output, 'rice-results.json')
  await download.saveAs(path)
  const results = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(results.runs.length, 4)
  const classes = ['A128', 'BQ10', 'CL61', 'HL', 'HP28', 'LT183', 'MT151', 'NBP', 'NPT3', 'TXHQ']
  for (const { candidate, protocol } of results.runs) {
    // Declared partition: 19 calibration / 5 test kernels per variety, never mixed.
    assert.equal(protocol.calibrationIds.length, 190)
    assert.equal(protocol.holdoutIds.length, 50)
    assert.equal(new Set([...protocol.calibrationIds, ...protocol.holdoutIds]).size, 240)
    // Stratified outer folds: every validation fold holds every variety.
    const truth = new Map(candidate.oof.rows.map(row => [row.sampleId, row.observed]))
    for (const fold of protocol.folds.folds) {
      assert.equal(new Set(fold.validation_sample_ids.map(id => truth.get(id))).size, classes.length, 'a fold lacks a class')
    }
    assert.equal(candidate.oof.n, 190)
    assert.equal(candidate.holdout.n, 50)
    for (const scope of [candidate.oof, candidate.holdout]) {
      assert.ok(scope.rows.every(row => Number.isInteger(row.predicted) && row.predicted >= 0 && row.predicted < classes.length))
      for (const metric of ['accuracy', 'balancedAccuracy', 'f1']) assert.ok(scope[metric] >= 0 && scope[metric] <= 1, metric)
    }
    // Ten classes: chance is 0.1; the public subset is clearly separable from its spectra.
    assert.ok(candidate.oof.balancedAccuracy > 0.25, `${candidate.label} balanced accuracy ${candidate.oof.balancedAccuracy}`)
  }
  assert.deepEqual(results.runs.map(run => run.choices?.['PLS-DA (logistic) · n_components'] ?? null), [5, 10, 15, null])
  // The Inspector shows a confusion matrix over the declared variety labels.
  await page.locator('#n4mm-results').scrollIntoViewIfNeeded()
  await page.locator('[data-fusion-results]').getByText('Confusion matrix', { exact: false }).first().waitFor()
  await page.locator('#n4mm-results').screenshot({ path: join(output, 'rice-inspector.png') })
  // Dropping the rice folder (manifest included) keeps its declared class vocabulary through the Dataset Builder.
  const builder = page.locator('.dsb-mm')
  await page.locator('#n4mm-data').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Import your files', exact: true }).click()
  const base = new URL('../public/multimodal-data/rice-varieties/', import.meta.url)
  const inventory = JSON.parse(await readFile(new URL('files.json', base), 'utf8')).files
  await builder.locator('input[type="file"]').setInputFiles(await Promise.all(inventory.map(async name => ({
    name, mimeType: 'application/octet-stream', buffer: await readFile(new URL(name, base)) }))))
  await builder.locator('.dsb-mm-busy').waitFor({ state: 'hidden', timeout: 60000 })
  await builder.locator('.dsb-stepper__button').filter({ hasText: 'Validation' }).click()
  await builder.getByRole('button', { name: /^Validate (alignment|again)$/ }).click()
  const create = builder.getByRole('button', { name: 'Create dataset', exact: true })
  await page.waitForFunction(element => !element.disabled, await create.elementHandle(), { timeout: 60000 })
  await create.click()
  await page.getByText(new RegExp(`^Imported ${inventory.length} files:`)).waitFor()
  assert.equal(await page.locator('input[name="n4mm-case"][value="images"]').isChecked(), true)
  await lab.locator('.n4fl-chip', { hasText: 'HSI pixel centre alone' }).first().waitFor({ timeout: 120000 })
  await run('HSI pixel centre alone', 3) // the imported data trains classifiers (PLS-DA) on the declared vocabulary
  await lab.getByText('PLS-DA (logistic)', { exact: false }).first().waitFor({ timeout: 10000 })

  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  console.log(JSON.stringify(results.runs.map(run => ({ name: run.name, oof: run.candidate.oof.balancedAccuracy, test: run.candidate.holdout.balancedAccuracy }))))
  console.log('MULTIMODAL CLASSIFICATION SMOKE PASSED: rice varieties (example and Dataset Builder import), declared vocabulary, stratified folds, PLS-DA sweep, probability mean fusion, confusion matrix')
} finally {
  await browser.close()
}
