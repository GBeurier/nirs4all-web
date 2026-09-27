// Browser smoke: the .n4a export of a model whose fitted state embeds training
// rows (Kernel PLS) asks for explicit consent. Cancelling downloads nothing;
// confirming exports a bundle flagged `containsTrainingRows` (bundle-level and
// on the model state) whose re-import in a fresh session predicts identically.
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { capturePredictionPanel, comparePredictionPanels } from './smoke-evidence-helpers.mjs'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const XTEST = new URL('../src/data/demo/corn/Xtest.csv', import.meta.url).pathname

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }

async function openModelExport() {
  await page.getByRole('button', { name: /^Export/i }).first().click()
  await page.getByRole('menuitem', { name: /Model bundle/i }).click()
}

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.locator('#model-select').click()
  await page.getByRole('option', { name: 'Kernel', exact: true }).click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ trained a Kernel PLS model')

  await page.locator('[data-step="predict"]').click()
  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles(XTEST)
  const before = await capturePredictionPanel(page)

  await page.locator('[data-step="results"]').click()
  await page.waitForSelector('[data-testid="n4a-results-list"]', { timeout: 10000 })
  let downloads = 0
  page.on('download', () => downloads++)
  await openModelExport()
  const consent = page.getByTestId('n4a-training-rows-consent')
  await consent.waitFor({ timeout: 10000 })
  if (!/training spectra/.test((await consent.textContent()) || '')) fail('consent dialog does not name the training spectra')
  await consent.getByRole('button', { name: 'Cancel' }).click()
  await consent.waitFor({ state: 'hidden', timeout: 5000 })
  await page.waitForTimeout(500)
  if (downloads !== 0) fail('cancelling the consent still downloaded a file')
  else console.log('✓ export asks for consent; Cancel downloads nothing')

  await openModelExport()
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByTestId('n4a-training-rows-consent').getByRole('button', { name: /Export with training spectra/ }).click(),
  ])
  const n4aPath = join(tmpdir(), 'training-rows.n4a')
  await download.saveAs(n4aPath)
  const bundle = JSON.parse(await readFile(n4aPath, 'utf8'))
  if (bundle.containsTrainingRows !== true || bundle.model?.state?.model?.containsTrainingRows !== true) {
    fail('the consented .n4a does not record containsTrainingRows')
  } else {
    console.log('✓ consented .n4a records containsTrainingRows (bundle + model state)')
  }

  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(n4aPath)
  await page.waitForSelector('text=/Predict on new spectra/', { timeout: 15000 })
  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles(XTEST)
  const after = await capturePredictionPanel(page)
  const cmp = comparePredictionPanels(before, after, 0)
  console.log(`✓ re-imported Kernel PLS predicts identically (${cmp.compared_rows} rows, max Δ ${cmp.max_abs_delta})`)

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'TRAINING-ROWS-EXPORT SMOKE FAILED' : 'TRAINING-ROWS-EXPORT SMOKE PASSED')
