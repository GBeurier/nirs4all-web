// End-to-end .n4a round-trip: train a model → export the .n4a bundle → reload the
// app fresh → import the .n4a → predict on new spectra. Proves a saved model can be
// re-used later with no dataset and no retraining (the "broader usage" path).
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4355/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const FRUIT_XTEST = process.env.FRUIT_XTEST || new URL('../src/data/sample/X_test.csv', import.meta.url).pathname

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }

try {
  // 1. train a model
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: 'Fruit purée' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  console.log('✓ trained a model')

  // 2. export the .n4a bundle via the Export dropdown
  await page.getByRole('button', { name: /^Export/i }).first().click()
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('menuitem', { name: /Model bundle/i }).click(),
  ]).then(([d]) => d)
  const n4aPath = join(tmpdir(), 'roundtrip.n4a')
  await dl.saveAs(n4aPath)
  console.log(`✓ exported .n4a → ${dl.suggestedFilename()}`)
  if (!/\.n4a$/.test(dl.suggestedFilename())) fail('exported file is not a .n4a')

  // 3. reload the app FRESH (no dataset, no run) — clear the persisted session
  // first so this is a genuine cold start (persistence would otherwise restore
  // the trained sample + pipeline and land on the editor, hiding the upload step).
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // 4. import the .n4a on the Dataset step → jumps to Predict
  await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(n4aPath)
  await page.waitForSelector('text=/Predict on new spectra/', { timeout: 15000 })
  console.log('✓ imported .n4a into a fresh session → Predict unlocked (no retrain)')

  // 5. predict on new spectra
  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles(FRUIT_XTEST)
  await page.waitForTimeout(1500)
  const charts = await page.locator('svg.recharts-surface').count()
  if (charts >= 1) console.log(`✓ imported model predicted (${charts} chart) — round-trip complete`)
  else fail('imported model did not produce a prediction histogram')

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'N4A-ROUNDTRIP SMOKE FAILED' : 'N4A-ROUNDTRIP SMOKE PASSED')
