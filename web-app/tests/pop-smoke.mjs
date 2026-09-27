// POP-PLS smoke: build a POP-PLS (per-component AOM) pipeline with NO
// preprocessing on the Corn protein regression sample, run it via the served
// WASM stack, and confirm CV Scores render with an RMSE metric, the "by dag-ml"
// badge, and no console errors. Also asserts the operator bank (the manifest's
// op_kinds list) is present and editable on the POP model node. POP screens
// preprocessing internally, so it is used WITHOUT preceding preproc steps.
// Exercises the n4m role API (aom_pop.pop_pls by method id) end-to-end.
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
  await page.getByRole('option', { name: 'POP PLS', exact: true }).click()
  await page.waitForTimeout(200)
  const body1 = (await page.textContent('body')) || ''
  if (/POP PLS/.test(body1)) console.log('✓ estimator switched to POP PLS')
  else fail('expected POP PLS to be selected')

  // the operator bank is the manifest's op_kinds int[] param, edited as a list
  const bank = page.locator('[data-array-param="op_kinds"]').first()
  if ((await bank.count()) > 0) console.log('✓ operator-bank (op_kinds) editor present on the POP PLS node')
  else fail('expected an op_kinds editor on the POP PLS node')
  const defaultBank = await bank.inputValue()
  if (defaultBank.split(',').length >= 5) console.log(`✓ operator bank defaults to the manifest bank [${defaultBank}]`)
  else fail(`expected >=5 operator kinds in the default bank, got [${defaultBank}]`)
  await bank.fill('0, 7')
  await page.waitForTimeout(150)
  if ((await bank.inputValue()) === '0, 7') console.log('✓ operator bank is editable')
  else fail('expected the operator bank to be editable')
  await bank.fill(defaultBank) // restore the consistent manifest bank before running
  await page.waitForTimeout(150)

  // run the pipeline (no preprocessing — POP screens it internally)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 180000 })
  console.log('✓ POP PLS pipeline executed (CV Scores rendered)')

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
