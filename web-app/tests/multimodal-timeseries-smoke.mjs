// Real data with a multivariate time series: mango NIR spectra + 90 days of weather per fruit
// (declared series, grouped harvest folds) -> worker -> native DAG / Methods -> Inspector, as an
// example and through the Dataset Builder (manifest-declared series).
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const output = process.env.MULTIMODAL_TIMESERIES_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-timeseries')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = [], mutations = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
const lab = page.locator('[data-fusion-lab]')

async function run(preset, count) {
  await lab.locator('.n4fl-chip', { hasText: preset }).first().click()
  await page.evaluate(() => { const node = document.querySelector('.n4fl-status'); if (node) node.setAttribute('data-before', node.textContent ?? '') })
  await page.getByRole('button', { name: 'Run this pipeline', exact: true }).click()
  await page.waitForFunction(expected => { const node = document.querySelector('.n4fl-status'); const text = node?.textContent ?? ''
    return text !== node?.getAttribute('data-before') && new RegExp(`${expected} runs? added to the comparison`).test(text) }, count, { timeout: 600000 })
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Example datasets', exact: true }).click()
  await page.locator('.n4mm-list__item', { hasText: 'Mango dry matter' }).getByRole('button').click()
  await lab.waitFor({ timeout: 120000 })
  assert.equal(await page.locator('input[name="n4mm-case"][value="timeseries"]').isChecked(), true)
  // The weather is one source: one plot per variable of the series, not one source per variable.
  const series = page.locator('#n4mm-explore figure', { hasText: 'Daily weather, 90 days before harvest' })
  assert.equal(await series.locator('svg').count() >= 4, true)
  await series.getByText('4 variables × 90 steps', { exact: false }).waitFor()

  await run('Vis-SWNIR spectrum alone', 3)
  await run('Late · average', 1)
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const path = join(output, 'mango-results.json')
  await download.saveAs(path)
  const results = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(results.runs.length, 4)
  const metadata = (await readFile(new URL('../public/multimodal-data/mango-dry-matter-weather/metadata.csv', import.meta.url), 'utf8'))
    .trim().split('\n').slice(1).map(line => line.split(','))
  const harvest = new Map(metadata.map(row => [row[0], row[2]])) // region × season group
  for (const { candidate, protocol } of results.runs) {
    // Declared seasons: 430 calibration fruits (seasons 1-3), 135 test fruits (season 4).
    assert.equal(protocol.calibrationIds.length, 430)
    assert.equal(protocol.holdoutIds.length, 135)
    // Folds are grouped by region × season: shared weather windows never cross train/validation.
    for (const fold of protocol.folds.folds) {
      const train = new Set(fold.train_sample_ids.map(id => harvest.get(id)))
      assert.ok(fold.validation_sample_ids.every(id => !train.has(harvest.get(id))), 'a region × season group crosses a fold')
    }
    assert.equal(candidate.oof.n, 430)
    assert.ok(Number.isFinite(candidate.oof.rmse) && Number.isFinite(candidate.holdout.rmse))
  }
  // Dry matter from the spectrum alone: a real, clearly positive cross-validated R².
  assert.ok(results.runs[0].candidate.oof.r2 > 0.2, `NIR alone R2 ${results.runs[0].candidate.oof.r2}`)
  await page.locator('#n4mm-results').scrollIntoViewIfNeeded()
  await page.locator('#n4mm-results').screenshot({ path: join(output, 'mango-inspector.png') })

  // Dropping the folder (manifest included) keeps the declared series through the Dataset Builder.
  const builder = page.locator('.dsb-mm')
  await page.locator('#n4mm-data').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Import your files', exact: true }).click()
  const base = new URL('../public/multimodal-data/mango-dry-matter-weather/', import.meta.url)
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
  assert.equal(await page.locator('input[name="n4mm-case"][value="timeseries"]').isChecked(), true)
  await run('Daily weather, 90 days before harvest alone', 3)

  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  console.log(JSON.stringify(results.runs.map(run => ({ name: run.name, oof: run.candidate.oof.rmse, test: run.candidate.holdout.rmse }))))
  console.log('MULTIMODAL TIMESERIES SMOKE PASSED: mango NIR + weather series, declared seasons, region × season folds, example and Dataset Builder import')
} finally {
  await browser.close()
}
