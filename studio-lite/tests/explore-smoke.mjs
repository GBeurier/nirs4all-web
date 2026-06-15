// Runtime smoke for the upgraded Explore step: preprocessing preview (raw →
// processed → both → difference) + the client-side PCA scatter, asserting the
// charts render and no console errors are thrown. Pure client-side (no model
// run), so it works on the served build and the file:// single-file build.
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

  // Spectra tab is default — apply a preprocessing preview and step view modes
  await page.locator('select[aria-label="Preprocessing preview"]').selectOption('snv')
  await page.waitForTimeout(250)
  for (const mode of ['Both', 'Difference', 'Processed']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await page.waitForTimeout(150)
  }
  const spectraSvg = await page.locator('svg.recharts-surface').count()
  if (spectraSvg < 1) fail('expected a spectra chart after preprocessing preview')
  else console.log(`✓ preprocessing preview rendered (${spectraSvg} chart) across view modes`)

  // PCA tab — client PCA scatter + explained-variance caption
  await page.getByRole('tab', { name: /PCA/ }).click()
  await page.waitForSelector('text=/of variance/', { timeout: 15000 })
  const dots = await page.locator('.recharts-scatter-symbol, .recharts-symbols').count()
  if (dots < 1) fail('expected PCA scatter points')
  else console.log(`✓ PCA scatter rendered (${dots} points)`)

  // toggle colour mode (Partition) and an axis component, no errors expected
  await page.getByRole('button', { name: 'Partition', exact: true }).click()
  await page.waitForTimeout(150)

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
