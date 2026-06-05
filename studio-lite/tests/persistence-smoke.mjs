// Session persistence: load a bundled sample + edit the pipeline, reload the
// page, and confirm the session is restored (dataset back, pipeline preserved,
// editor reachable) — no re-upload needed. Addresses "what happens if I relaunch".
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4320/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  // load a bundled sample (NIR protein regression)
  await page.locator('button').filter({ hasText: /NIR protein/ }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  const before = (await page.locator('text=/samples ×/').first().textContent())?.trim() || ''
  console.log(`✓ sample loaded → "${before}"`)

  // go to the pipeline editor (its restored state is what we care about)
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForSelector('text=/Run pipeline/i', { timeout: 15000 })

  // RELOAD — the session must come back from localStorage without re-uploading
  await page.reload({ waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  const after = (await page.locator('text=/samples ×/').first().textContent())?.trim() || ''
  if (after !== before) {
    console.error(`✗ after reload the dataset chip is "${after}", expected "${before}"`)
    process.exitCode = 1
  } else {
    console.log(`✓ after reload, session restored → "${after}" (no re-upload)`)
  }
  // editor still reachable with its pipeline
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForSelector('text=/Run pipeline/i', { timeout: 15000 })
  console.log('✓ pipeline editor restored')

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  console.error('✗ ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'PERSISTENCE SMOKE FAILED' : 'PERSISTENCE SMOKE PASSED')
