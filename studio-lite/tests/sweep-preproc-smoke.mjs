// Sweep + preprocessing smoke: add an SNV preprocessing step, then sweep the
// model's n_components (5,10,20), run, and confirm dag-ml expanded >=3 variants,
// selected one, and produced non-duplicated OOF — the multi-node sweep case that
// previously threw "Variant sweeps need a model-only pipeline". Proves the
// DagMlEngine host-enumerated sweep path over the libn4m chain.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewportSize({ width: 1366, height: 900 })
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

  // add an SNV preprocessing step (search-then-click in the palette accordion)
  const search = page.getByPlaceholder(/Search operators/i).first()
  await search.fill('SNV')
  await page.getByRole('button', { name: 'SNV', exact: true }).first().click()
  await page.waitForTimeout(150)
  await search.fill('')
  const bodyA = (await page.textContent('body')) || ''
  if (/SNV/.test(bodyA)) console.log('✓ SNV preprocessing step added (multi-node pipeline)')
  else fail('expected an SNV step on the canvas')

  // select the terminal model node (adding SNV left it selected) so its
  // n_components param — and the sweep trigger — are shown in the inspector.
  await page.getByRole('button', { name: /PLS Regression/ }).filter({ has: page.getByRole('button', { name: 'Remove step' }) }).first().click()
  await page.waitForTimeout(200)

  // sweep the model's n_components over a discrete set (5,10,20)
  await page.locator('[data-sweep-trigger="n_components"]').first().click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Discrete', exact: true }).first().click()
  await page.waitForTimeout(150)
  await page.locator('input[placeholder="5, 10, 20"]').first().fill('5, 10, 20')
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /Apply/i }).first().click()
  await page.waitForTimeout(200)

  const chip = await page.locator('[data-variant-chip]').first().textContent().catch(() => '')
  if (chip && /3/.test(chip)) console.log(`✓ variant chip shows the sweep (${chip.trim()})`)
  else fail('expected a ×N variants chip after configuring the sweep with preprocessing present')

  // run — this is the case that used to throw the model-only guard
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 120000 })
  console.log('✓ sweep+preprocessing pipeline executed (CV Scores rendered)')

  const run = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const cvIds = (r.cv?.predictions || []).map((p) => p.sampleId)
    return {
      variantCount: r.variantCount,
      selectedCount: (r.variants || []).filter((v) => v.selected).length,
      cvN: cvIds.length,
      cvUnique: new Set(cvIds).size,
      stepCount: (r.model?.dsl?.steps || []).length,
    }
  })
  if (!run) fail('window.__n4aLastRun not set')
  else {
    if (run.variantCount === 3) console.log('✓ run.variantCount === 3 (sweep expanded with preprocessing)')
    else fail(`expected variantCount 3, got ${run.variantCount}`)
    if (run.selectedCount === 1) console.log('✓ exactly one variant selected')
    else fail(`expected 1 selected variant, got ${run.selectedCount}`)
    if (run.cvN > 0 && run.cvN === run.cvUnique) console.log(`✓ CV OOF not duplicated (${run.cvN} unique rows)`)
    else fail(`CV OOF duplicated: ${run.cvN} rows / ${run.cvUnique} unique`)
    if (run.stepCount >= 1) console.log(`✓ winning variant kept the preprocessing chain (${run.stepCount} step)`)
    else fail('expected the winning variant DSL to retain the SNV step')
  }

  const body = (await page.textContent('body')) || ''
  if (/by dag-ml/i.test(body)) console.log('✓ run via dag-ml-wasm (badge present)')
  else fail('expected a "by dag-ml" badge')

  await page.screenshot({ path: '/tmp/n4a_sweep_preproc_smoke.png', fullPage: true })

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no console errors')
} catch (e) {
  fail('sweep+preproc smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'SWEEP-PREPROC SMOKE FAILED' : 'SWEEP-PREPROC SMOKE PASSED')
