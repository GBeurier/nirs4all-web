// Every browser-ready Studio preset opens from the Presets dialog and runs to CV scores.
import { chromium } from 'playwright-core'

const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:4345/'
const only = process.env.WEB_PRESETS ? new RegExp(process.env.WEB_PRESETS) : null
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
let failed = 0
try {
  for (const [sample, task] of [['Corn protein', 'regression'], ['Meat species', 'classification']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.locator('button').filter({ hasText: sample }).first().click()
    await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
    await page.locator('[data-step="pipeline"]').click()
    await page.getByRole('button', { name: 'Presets', exact: true }).click()
    const ids = await page.locator('[data-web-preset]').evaluateAll((els) => els.map((el) => el.getAttribute('data-web-preset')))
    await page.getByRole('button', { name: 'Close' }).click()
    if (ids.length === 0) { console.log(`✗ no ${task} web presets`); failed++ }
    for (const id of ids) {
      if (only && !only.test(id)) continue
      await page.getByRole('button', { name: 'Presets', exact: true }).click()
      await page.locator(`[data-web-preset="${id}"]`).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      const started = Date.now()
      await page.getByRole('button', { name: /Run pipeline/i }).click()
      const outcome = await Promise.race([
        page.waitForSelector('text=/CV Scores/', { timeout: 600000 }).then(() => 'ok'),
        page.waitForSelector('text=/Run refused|failed|Error:/', { timeout: 600000 }).then(async (el) => `error: ${(await el.innerText()).slice(0, 200)}`),
      ]).catch((e) => `timeout: ${e.message}`)
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      if (outcome === 'ok') console.log(`✓ ${task} ${id} ran in ${seconds}s`)
      else { console.log(`✗ ${task} ${id} ${outcome} (${seconds}s)`); failed++ }
      await page.locator('[data-step="pipeline"]').click()
    }
    if (errors.length) { console.log(`✗ console errors: ${errors.join(' | ')}`); failed++ }
    await page.close()
  }
} finally {
  await browser.close()
}
if (failed) { console.log(`WEB-PRESETS SMOKE FAILED (${failed})`); process.exit(1) }
console.log('WEB-PRESETS SMOKE PASSED')
