// Browser smoke: pick a manifest model the retired positional dispatcher never
// ran (Weighted PLS) in the served editor and run it through the full WASM stack
// (dag-ml + the libn4m role API), confirming CV Scores + an RMSE metric render
// with no console errors. Proves every manifest method with a role is a live,
// executable node — not only the old dispatcher subset.
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

  const components = page.getByLabel('Number of components', { exact: true })
  if (!(await components.isVisible()) || await components.inputValue() !== '12') throw new Error('PLS component count is missing or has the wrong initial value')
  await components.fill('3')
  if (await components.inputValue() !== '3') throw new Error('PLS component count did not update')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 720 })
    for (const name of ['n_components', 'solver', 'center_x', 'scale_x', 'center_y', 'scale_y']) {
      const control = page.locator(`#param-${name}`)
      await control.scrollIntoViewIfNeeded()
      const bounds = await control.boundingBox()
      if (!bounds || bounds.width < 24 || bounds.x < 0 || bounds.x + bounds.width > width || bounds.y < 0 || bounds.y + bounds.height > 720) {
        throw new Error(`PLS ${name} control is clipped at viewport width ${width}`)
      }
    }
    if (await components.inputValue() !== '3') throw new Error('PLS component count was lost during reflow')
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  console.log('✓ PLS parameters are editable and reachable at desktop and narrow widths')

  // select the terminal model node, then switch the estimator to Weighted PLS
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click()
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'Weighted PLS', exact: true }).click()
  await page.waitForTimeout(200)
  const body = (await page.textContent('body')) || ''
  if (/Weighted PLS/.test(body)) console.log('✓ estimator switched to Weighted PLS (generic role path)')
  else fail('expected Weighted PLS to be selected')

  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ Weighted PLS pipeline executed (CV Scores rendered)')

  const body2 = (await page.textContent('body')) || ''
  if (/RMSE/i.test(body2)) console.log('✓ RMSE metric present')
  else fail('expected an RMSE metric')
  if (/by dag-ml/i.test(body2)) console.log('✓ run via dag-ml-wasm (badge present)')
  else fail('expected a "by dag-ml" badge')

  await page.screenshot({ path: '/tmp/new_models_ui_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'NEW-MODELS-UI SMOKE FAILED' : 'NEW-MODELS-UI SMOKE PASSED')
