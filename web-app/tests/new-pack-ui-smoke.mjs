// Browser smoke: pick the AOM-Ridge blender (a NEW AOM-family model wired to its
// own libn4m bridge) in the served editor and run it end-to-end through the WASM
// stack (dag-ml + libn4m), confirming CV Scores + an RMSE metric render with no
// console errors. Proves the catalog→engine wiring for the broad-model-pack adds.
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

  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample dataset loaded')

  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // select the terminal model node, then switch the estimator to AOM-Ridge blender
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click()
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'AOM-Ridge blender', exact: true }).click()
  await page.waitForTimeout(200)
  const body = (await page.textContent('body')) || ''
  if (/AOM-Ridge blender/.test(body)) console.log('✓ estimator switched to AOM-Ridge blender (new model)')
  else fail('expected AOM-Ridge blender to be selected')

  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  console.log('✓ AOM-Ridge pipeline executed (CV Scores rendered)')

  const body2 = (await page.textContent('body')) || ''
  if (/RMSE/i.test(body2)) console.log('✓ RMSE metric present')
  else fail('expected an RMSE metric')
  if (/by dag-ml/i.test(body2)) console.log('✓ run via dag-ml-wasm (badge present)')
  else fail('expected a "by dag-ml" badge')

  await page.screenshot({ path: '/tmp/new_pack_ui_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'NEW-PACK-UI SMOKE FAILED' : 'NEW-PACK-UI SMOKE PASSED')
