// Runtime smoke: load the app in a real browser, exercise the full vertical
// slice (load sample → run pipeline → results render → predict), assert no
// console errors. Launches the cached Chromium directly via executablePath.
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4317/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
const bad404 = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/.test(r.url())) bad404.push(`${r.status()} ${r.url()}`)
})

function fail(msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
}

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // 1. load the bundled sample dataset (a real <button>, not the dropzone div)
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample dataset loaded + Explore section rendered')

  // 2. open the Pipeline workbench step, then run the default pipeline
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  console.log('✓ pipeline executed, results tree rendered')

  // 3. a metric is shown (RMSE for regression sample)
  const body = (await page.textContent('body')) || ''
  if (!/RMSE/i.test(body)) fail('expected RMSE metric in results')
  else console.log('✓ RMSE metric present')

  // 3b. dag-ml executed/compiled the pipeline (served build only; skipped under file://)
  if (!String(APP_URL).startsWith('file:')) {
    if (/by dag-ml/i.test(body)) console.log('✓ pipeline run via dag-ml-wasm (badge present)')
    else fail('expected a "by dag-ml" badge on the served build')
    // dag-ml-data served the X/y blocks (the data-contract layer is wired in)
    if (/data by dag-ml-data/i.test(body)) console.log('✓ data materialized via dag-ml-data (badge present)')
    else fail('expected a "data by dag-ml-data" badge on the served build')
  }

  // 4. visualization tab content present (parity / residual chart svg)
  const svgCount = await page.locator('svg.recharts-surface').count()
  if (svgCount < 1) fail('expected at least one recharts chart')
  else console.log(`✓ ${svgCount} charts rendered`)

  // 5. predict on new spectra → histogram (open the Predict step, use the sample's test spectra)
  const FRUIT_XTEST = process.env.FRUIT_XTEST || new URL('../src/data/demo/corn/Xtest.csv', import.meta.url).pathname
  await page.locator('[data-step="predict"]').click()
  await page.waitForTimeout(300)
  await page.locator('input[type=file]').last().setInputFiles(FRUIT_XTEST)
  await page.waitForTimeout(1500)
  const svgAfter = await page.locator('svg.recharts-surface').count()
  if (svgAfter >= 1) console.log(`✓ prediction produced a histogram (${svgAfter} chart(s) on Predict)`)
  else fail('prediction did not render a histogram')

  await page.screenshot({ path: '/tmp/n4a_smoke.png', fullPage: true })
  console.log('✓ screenshot saved to /tmp/n4a_smoke.png')

  if (bad404.length) {
    console.error(`✗ ${bad404.length} failed request(s):`)
    for (const u of bad404.slice(0, 8)) console.error('   ' + u)
    process.exitCode = 1
  }
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
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED')
