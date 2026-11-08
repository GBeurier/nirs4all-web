// Existing UI Playground adoption: Methods worker preprocessing/PCA, keyboard
// operator selection and a visible sample table. No browser-local PCA fallback.
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4317/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

function fail(msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
}

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // load a regression sample → lands on Explore
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample loaded + Explore rendered')

  const playground = page.locator('[data-owner-playground]')
  await playground.getByText('PCA computed by Methods', { exact: false }).waitFor({ timeout: 30000 })
  await playground.getByRole('button', { name: 'Add step', exact: true }).first().click()
  const search = page.getByRole('dialog', { name: 'Add step' }).getByRole('textbox', { name: /Search operators/ })
  await search.fill('n4m:preprocessing.scatter.snv')
  await search.press('Enter')
  await page.getByRole('dialog', { name: 'Add step' }).waitFor({ state: 'hidden' })
  await playground.locator('.n4pg-card-meta .n4wb-mono').first().waitFor({ timeout: 30000 })
  await playground.getByText('PCA computed by Methods', { exact: false }).waitFor({ timeout: 30000 })
  if (await playground.locator('canvas').count() < 1) fail('expected owner-backed spectra/PCA canvas')
  const samples = playground.locator('section[aria-label="Samples"]')
  await samples.getByRole('grid').waitFor()
  if (await samples.getByRole('row').count() < 2) fail('expected the on-page sample data alternative')
  console.log('✓ Methods preprocessing/PCA and sample table rendered')

  // The views picker is keyboard reachable, and local-statistic views stay out.
  const views = playground.getByRole('button', { name: /^Views/ })
  await views.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Views', exact: true })
  await menu.waitFor()
  if (await menu.getByText('Correlation', { exact: true }).count()) fail('local correlation must not be offered')
  await page.keyboard.press('Escape')
  console.log('✓ keyboard views control opened and closed')

  await page.screenshot({ path: '/tmp/n4a_explore_smoke.png', fullPage: true })

  if (errors.length) fail('console errors:\n  ' + errors.join('\n  '))
  else console.log('✓ no console errors')
} catch (e) {
  fail('exception: ' + (e?.message || e))
} finally {
  await browser.close()
}

if (process.exitCode) console.error('EXPLORE SMOKE FAILED')
else console.log('EXPLORE SMOKE OK')
