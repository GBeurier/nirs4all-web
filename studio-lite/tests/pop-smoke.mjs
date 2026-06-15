// POP-PLS smoke: build a POP-PLS (per-component AOM) pipeline with NO
// preprocessing on the Corn protein regression sample, run it via the served
// WASM stack, and confirm CV Scores render with an RMSE metric, the "by dag-ml"
// badge, and no console errors. Also asserts the operator-bank picker is present
// and editable on the AOM/POP model node (a checkbox-group of strict-linear
// operator kinds). POP screens preprocessing internally and returns input-space
// coeffs + intercept, so it is used WITHOUT preceding preproc steps. Exercises
// n4m.fitPop (n4m_model_selection_pop_pls_select) end-to-end.
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

  // load the Corn protein regression sample
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ Corn protein sample loaded')

  // open the pipeline workbench (default regression preset has NO preproc steps)
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // select the terminal model node, then switch the estimator to POP-PLS
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click()
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'POP-PLS', exact: true }).click()
  await page.waitForTimeout(200)
  const body1 = (await page.textContent('body')) || ''
  if (/POP-PLS/.test(body1)) console.log('✓ estimator switched to POP-PLS')
  else fail('expected POP-PLS to be selected')

  // operator-bank picker present + editable (a checkbox group of strict-linear ops)
  const bank = page.locator('[data-operator-bank]').first()
  if ((await bank.count()) > 0) console.log('✓ operator-bank picker present on POP node')
  else fail('expected an operator-bank picker on the POP-PLS node')
  const boxes = bank.locator('input[type="checkbox"]')
  const nBoxes = await boxes.count()
  if (nBoxes >= 5) console.log(`✓ operator-bank exposes ${nBoxes} operator kinds`)
  else fail(`expected >=5 operator-kind checkboxes, got ${nBoxes}`)
  // toggle the first checkbox off then back on → confirms it is editable
  const first = boxes.first()
  const before = await first.isChecked()
  await first.click()
  await page.waitForTimeout(150)
  const after = await first.isChecked()
  if (after !== before) console.log('✓ operator-bank checkbox is editable (toggled)')
  else fail('expected the operator-bank checkbox to toggle')
  await first.click() // restore so the run keeps a non-degenerate bank
  await page.waitForTimeout(150)

  // run the pipeline (no preprocessing — POP screens it internally)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ POP-PLS pipeline executed (CV Scores rendered)')

  const body2 = (await page.textContent('body')) || ''
  if (/RMSE/i.test(body2)) console.log('✓ RMSE metric present')
  else fail('expected an RMSE metric in the results')

  if (!String(URL).startsWith('file:')) {
    if (/by dag-ml/i.test(body2)) console.log('✓ run via dag-ml-wasm (badge present)')
    else fail('expected a "by dag-ml" badge on the served build')
  }

  await page.screenshot({ path: '/tmp/pop_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'POP SMOKE FAILED' : 'POP SMOKE PASSED')
