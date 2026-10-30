// FEATURE 1 smoke: the model is OPTIONAL. The editor must let the user remove the
// terminal model (leaving a preprocessing-only pipeline) — the Run button is then
// replaced by a clear "add a model to run / score" guard and execution is blocked.
// Adding opens a searchable chooser without changing the pipeline; only an
// explicit choice restores Run. Cancel/Escape retain the preprocessing-only DSL.
import assert from 'node:assert/strict'
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
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
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

  // Opening the chooser must not silently add its first entry.
  await page.locator('[data-add-model]').click()
  const chooser = page.getByRole('dialog', { name: 'Add a model', exact: true })
  await chooser.waitFor()
  assert.equal(await page.locator('[data-add-model]').count(), 1)
  assert.equal(await page.locator('[data-run-guard]').count(), 1)
  assert.equal(await page.getByRole('button', { name: /Run pipeline/i, includeHidden: true }).count(), 0)
  assert.equal(await chooser.locator('[data-palette-bucket]').count(), 1)
  assert.equal(await chooser.locator('[data-palette-bucket="model"]').getAttribute('aria-expanded'), 'true')
  assert.ok(await chooser.getByRole('button', { name: 'Weighted PLS', exact: true }).isVisible())
  // Regression must not offer a classifier-only estimator.
  assert.equal(await chooser.getByRole('button', { name: 'KNN classifier (ml.js)', exact: true }).count(), 0)
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click()
  await chooser.waitFor({ state: 'hidden' })
  assert.ok(await page.locator('[data-add-model]').isVisible())
  assert.ok(await page.locator('[data-run-guard]').isVisible())
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-add-model'))
  console.log('✓ opening and cancelling the chooser keeps the pipeline without a model')

  // Keyboard dismissal and unmatched search must also leave the model empty.
  await page.locator('[data-add-model]').click()
  await chooser.getByRole('textbox', { name: 'Search models' }).fill('no-estimator-matches-this-query')
  await chooser.getByText(/No operator matches/).waitFor()
  await page.keyboard.press('Escape')
  await chooser.waitFor({ state: 'hidden' })
  assert.ok(await page.locator('[data-add-model]').isVisible())
  assert.equal(await page.getByRole('button', { name: /Run pipeline/i }).count(), 0)
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-add-model'))

  // The chooser is reachable on narrow screens, where the left palette is hidden.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-add-model]').click()
  const search = chooser.getByRole('textbox', { name: 'Search models' })
  assert.equal(await search.inputValue(), '')
  await search.fill('Weighted PLS')
  const choice = chooser.getByRole('button', { name: 'Weighted PLS', exact: true })
  await choice.scrollIntoViewIfNeeded()
  const bounds = await choice.boundingBox()
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844)
  await page.screenshot({ path: '/tmp/no_model_chooser_mobile.png', fullPage: true })
  await choice.focus()
  await page.keyboard.press('Enter')
  await chooser.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('[data-add-model]').count(), 0)
  assert.ok(await page.getByRole('button', { name: /Run pipeline/i }).isVisible())
  assert.ok(await page.locator('#model-select').getByText('Weighted PLS', { exact: true }).isVisible())
  const components = page.locator('#param-n_components')
  await components.fill('3')
  assert.equal(await components.inputValue(), '3')
  console.log('✓ mobile search and explicit keyboard selection add the chosen model with editable parameters')

  // Existing replacement and palette-add workflows still work after the choice.
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.locator('#model-select').click()
  await page.getByRole('option', { name: 'PLS Regression', exact: true }).click()
  assert.equal(await components.inputValue(), '2') // Catalog default, independent of the initial preset.
  const replacement = page.getByRole('button', { name: /PLS Regression/ }).filter({ has: page.getByRole('button', { name: 'Remove step' }) }).first()
  await replacement.getByRole('button', { name: 'Remove step' }).click()
  await page.locator('input[aria-label="Search operators"]:visible').fill('Weighted PLS')
  await page.getByRole('button', { name: 'Weighted PLS', exact: true }).click()
  assert.ok(await page.locator('#model-select').getByText('Weighted PLS', { exact: true }).isVisible())
  assert.ok(await page.getByRole('button', { name: /Run pipeline/i }).isVisible())
  assert.equal(await chooser.count(), 0)
  console.log('✓ model replacement and explicit palette additions remain functional')

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
