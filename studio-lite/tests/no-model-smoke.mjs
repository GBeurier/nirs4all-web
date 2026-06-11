// FEATURE 1 smoke: the model is OPTIONAL. The editor must let the user remove the
// terminal model (leaving a preprocessing-only pipeline) — the Run button is then
// replaced by a clear "add a model to run / score" guard and execution is blocked.
// Re-adding a model restores the Run button. No console errors throughout.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
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
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // load the regression sample
  await page.locator('button').filter({ hasText: 'Fruit purée' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample dataset loaded')

  // open the pipeline workbench
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // baseline: a Run button is present (the default pipeline has a model)
  if (await page.getByRole('button', { name: /Run pipeline/i }).count()) console.log('✓ Run button present with a model')
  else fail('expected a Run button before removing the model')

  // hover the terminal model node and remove it via its trash affordance.
  // NB: the palette now also lists "PLS Regression" (models are browsable), so
  // target the CANVAS node — the one that actually has a "Remove step" child.
  const modelNode = page.getByRole('button', { name: /PLS Regression/ }).filter({ has: page.getByRole('button', { name: 'Remove step' }) }).first()
  await modelNode.hover()
  await page.waitForTimeout(150)
  await modelNode.getByRole('button', { name: 'Remove step' }).click()
  await page.waitForTimeout(250)

  // the run guard must now show + Run must be gone + an "Add a model" affordance appears
  await page.waitForSelector('[data-run-guard]', { timeout: 5000 })
  const guardText = (await page.locator('[data-run-guard]').textContent()) || ''
  if (/add a model/i.test(guardText)) console.log('✓ run guard shown after removing the model')
  else fail('expected an "add a model" run guard')

  if ((await page.getByRole('button', { name: /Run pipeline/i }).count()) === 0) console.log('✓ Run button hidden — execution blocked without a model')
  else fail('Run button should be hidden when there is no model')

  if (await page.locator('[data-add-model]').count()) console.log('✓ "Add a model" placeholder present on the canvas')
  else fail('expected an "Add a model" placeholder')

  // re-add a model → the Run button returns
  await page.locator('[data-add-model]').click()
  await page.waitForTimeout(250)
  if (await page.getByRole('button', { name: /Run pipeline/i }).count()) console.log('✓ Run button restored after re-adding a model')
  else fail('expected the Run button to return after re-adding a model')

  await page.screenshot({ path: '/tmp/no_model_smoke.png', fullPage: true })

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail('smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'NO-MODEL SMOKE FAILED' : 'NO-MODEL SMOKE PASSED')
