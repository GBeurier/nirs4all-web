// GATE A3 smoke: build a pipeline using >=2 new (A2) preprocessing operators
// plus a new (A1 Tier-B) model (Ridge), run it via the served WASM stack, and
// confirm CV Scores render with no console errors. Exercises the generic model
// dispatcher (fitModel) and the extended preprocessing dispatcher end-to-end.
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

  // add two new A2 preprocessing operators from the palette (search-then-click;
  // the palette is an accordion so most families are collapsed by default).
  const search = page.getByPlaceholder(/Search operators/i).first()
  const addOp = async (name) => {
    await search.fill(name)
    await page.getByRole('button', { name, exact: true }).first().click()
    await page.waitForTimeout(150)
    await search.fill('')
  }
  await addOp('Robust NV')
  await addOp('AsLS')
  const body1 = (await page.textContent('body')) || ''
  if (/Robust NV/.test(body1) && /AsLS/.test(body1)) console.log('✓ two new preprocessing operators added (Robust NV + AsLS)')
  else fail('expected the two added operators to appear on the canvas')

  // select the terminal model node on the CANVAS (palette now also lists models),
  // then switch the estimator to Ridge
  await page.getByRole('button', { name: /PLS Regression/ }).filter({ has: page.getByRole('button', { name: 'Remove step' }) }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click()
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'Ridge', exact: true }).click()
  await page.waitForTimeout(200)
  const body2 = (await page.textContent('body')) || ''
  if (/Ridge/.test(body2)) console.log('✓ estimator switched to Ridge (new Tier-B model)')
  else fail('expected the Ridge model to be selected')

  // run the pipeline
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ pipeline executed (CV Scores rendered)')

  const body3 = (await page.textContent('body')) || ''
  if (/RMSE/i.test(body3)) console.log('✓ RMSE metric present')
  else fail('expected an RMSE metric in the results')

  if (!String(URL).startsWith('file:')) {
    if (/by dag-ml/i.test(body3)) console.log('✓ run via dag-ml-wasm (badge present)')
    else fail('expected a "by dag-ml" badge on the served build')
  }

  await page.screenshot({ path: '/tmp/operators_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'OPERATORS SMOKE FAILED' : 'OPERATORS SMOKE PASSED')
