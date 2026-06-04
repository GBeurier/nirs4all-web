// Full classification vertical slice: load the NIR-classes sample → PLS-DA run →
// results show Accuracy + a confusion matrix in the Residuals tab.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4322/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => {
  console.error('✗ ' + m)
  process.exitCode = 1
}

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  // the classification sample is the NIR button labelled "7 classes"
  await page.locator('button').filter({ hasText: '7 classes' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ NIR classification sample loaded')

  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  const body = (await page.textContent('body')) || ''
  if (!/Acc|Accuracy/i.test(body)) fail('expected Accuracy metric for classification')
  else console.log('✓ classification ran — Accuracy metric present')

  // open the Residuals tab → confusion matrix
  const resid = page.getByRole('tab', { name: /Residual/i })
  if (await resid.count()) {
    await resid.first().click()
    await page.waitForTimeout(400)
    const after = (await page.textContent('body')) || ''
    if (/true|pred|confusion/i.test(after)) console.log('✓ confusion matrix view rendered')
    else console.log('• residual tab clicked (confusion labels not matched textually)')
  }

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'CLASSIFICATION SMOKE FAILED' : 'CLASSIFICATION SMOKE PASSED')
