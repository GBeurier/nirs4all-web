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

  // 3b. dag-ml executed/compiled the pipeline (served and file:// single-file builds alike)
  if (/by dag-ml/i.test(body)) console.log('✓ pipeline run via dag-ml-wasm (badge present)')
  else fail('expected a "by dag-ml" badge')
  // dag-ml-data served the X/y blocks (the data-contract layer is wired in)
  if (/data by dag-ml-data/i.test(body)) console.log('✓ data materialized via dag-ml-data (badge present)')
  else fail('expected a "data by dag-ml-data" badge')

  // 4. Shared Inspector: real parity points, a painted canvas and exact owner
  // prediction rows in their selected CV context (an empty shell cannot pass).
  const inspector = page.locator('[data-owner-inspector]')
  await inspector.locator('svg[role="img"][aria-label="Predicted versus observed"]').waitFor({ timeout: 10000 })
  await page.waitForFunction(() => {
    const svg = document.querySelector('[data-owner-inspector] svg[role="img"][aria-label="Predicted versus observed"]')
    const points = Number(svg?.querySelector('desc')?.textContent?.match(/^(\d+) points\b/)?.[1] ?? 0)
    const canvas = svg?.closest('.n4wb-plot')?.querySelector('canvas')
    if (!points || !canvas?.width || !canvas?.height) return false
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    return pixels?.some((value, index) => index % 4 === 3 && value > 0) === true
  }, null, { timeout: 10000 })
  const owner = await page.evaluate(() => {
    const run = window.__n4aLastRun
    return run ? { metric: run.scoreMetric, score: run.cv } : null
  })
  if (!owner?.score || owner.score.status !== 'completed' || !owner.score.predictions.length) throw new Error('missing completed owner CV predictions')
  const scoreRef = await inspector.locator('label').filter({ hasText: 'Evaluation score' }).locator('select').inputValue()
  if (scoreRef !== `${owner.metric}:cv`) throw new Error(`unexpected Inspector score context ${scoreRef}`)
  const selectedScore = inspector.locator('summary').filter({ hasText: 'Selected owner score:' })
  if (!(await selectedScore.innerText()).includes(owner.score.name)) throw new Error('selected score label differs from owner CV context')
  await selectedScore.click()
  const rows = await inspector.locator('[aria-label="Selected owner predictions"] tbody tr').evaluateAll((nodes) =>
    nodes.map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent.trim())),
  )
  const expectedRows = owner.score.predictions.map((row) => [String(row.sampleId), String(row.actualLabel ?? row.actual), String(row.predictedLabel ?? row.predicted), String(row.residual)])
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) throw new Error('Inspector prediction rows differ from the real owner CV result')
  console.log(`✓ shared Inspector parity plot and ${rows.length} owner prediction rows rendered (${scoreRef})`)

  // 5. predict on new spectra → histogram (open the Predict step, use the sample's test spectra)
  const FRUIT_XTEST = process.env.FRUIT_XTEST || new URL('../src/data/demo/corn/Xtest.csv', import.meta.url).pathname
  await page.locator('[data-step="predict"]').click()
  await page.waitForTimeout(300)
  await page.getByLabel('Spectra header row', { exact: true }).selectOption('yes')
  await page.locator('input[type=file]').last().setInputFiles(FRUIT_XTEST)
  // wait for the prediction to complete (same completion text as the n4a round-trip smoke), not a fixed delay
  await page.waitForSelector('text=/samples? predicted\\./', { timeout: 30000 })
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
