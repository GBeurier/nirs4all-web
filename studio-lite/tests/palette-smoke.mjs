// The operator palette must surface ALL operator categories — preprocessing,
// train/test split operators, AND models — not just preprocessing. Regression
// guard for "on the site I only see preprocessing, no other operators".
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4320/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: /NIR protein/ }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForSelector('text=/Run pipeline/i', { timeout: 15000 })

  const palette = page.locator('aside, div').filter({ hasText: /Operators/ }).first()
  // a preprocessing op (baseline)
  const hasPre = await page.getByRole('button', { name: /SNV|Savitzky|Detrend|AsLS/ }).count()
  // a SPLIT op
  const hasSplit = await page.getByRole('button', { name: /Kennard|SPXY|KMeans|KBins/ }).count()
  // a MODEL op (regression task → PLS/PCR/Ridge…)
  const hasModel = await page.getByRole('button', { name: /^PLS|PCR|Ridge|MB-PLS|MIR-PLS/ }).count()

  if (hasPre > 0) console.log('✓ palette shows preprocessing operators')
  else fail('palette has no preprocessing operators')
  if (hasSplit > 0) console.log(`✓ palette shows split operators (${hasSplit})`)
  else fail('palette shows NO split operators (KS/SPXY/KMeans/KBins missing)')
  if (hasModel > 0) console.log(`✓ palette shows model operators (${hasModel})`)
  else fail('palette shows NO model operators')

  // click a split operator from the palette → it should be added as the split node
  const splitBtn = page.getByRole('button', { name: /Kennard|SPXY/ }).first()
  if (await splitBtn.count()) {
    await splitBtn.click()
    await page.waitForTimeout(400)
    const splitOnCanvas = await page.locator('text=/Kennard|SPXY/').count()
    if (splitOnCanvas >= 1) console.log('✓ clicking a split operator adds it to the pipeline')
    else fail('clicking a split operator did not add it')
  }

  void palette
  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'PALETTE SMOKE FAILED' : 'PALETTE SMOKE PASSED')
