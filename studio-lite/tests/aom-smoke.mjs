// AOM smoke (task #13): build an AOM-PLS pipeline with NO preprocessing on the
// NIR protein regression sample, run it via the served WASM stack, and confirm
// CV Scores render with an RMSE metric, the "by dag-ml" badge, and no console
// errors. AOM screens preprocessing internally and returns input-space coeffs +
// intercept, so it is used WITHOUT preceding preproc steps (default preset is
// already empty-step). Exercises n4m.fitAom (n4m_aom_global_select) end-to-end.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'

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

  // load the NIR protein regression sample
  await page.locator('button').filter({ hasText: 'NIR protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ NIR protein sample loaded')

  // open the pipeline workbench (default regression preset has NO preproc steps)
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // select the terminal model node, then switch the estimator to AOM-PLS
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click()
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'AOM-PLS', exact: true }).click()
  await page.waitForTimeout(200)
  const body1 = (await page.textContent('body')) || ''
  if (/AOM-PLS/.test(body1)) console.log('✓ estimator switched to AOM-PLS')
  else fail('expected AOM-PLS to be selected')

  // run the pipeline (no preprocessing — AOM screens it internally)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ AOM-PLS pipeline executed (CV Scores rendered)')

  const body2 = (await page.textContent('body')) || ''
  if (/RMSE/i.test(body2)) console.log('✓ RMSE metric present')
  else fail('expected an RMSE metric in the results')

  if (!String(URL).startsWith('file:')) {
    if (/by dag-ml/i.test(body2)) console.log('✓ run via dag-ml-wasm (badge present)')
    else fail('expected a "by dag-ml" badge on the served build')
  }

  await page.screenshot({ path: '/tmp/aom_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'AOM SMOKE FAILED' : 'AOM SMOKE PASSED')
