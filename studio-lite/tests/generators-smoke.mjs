// WORKSTREAM B generators smoke: configure an OR-sweep on the model's
// n_components (5,10,20), run via the served WASM stack, and confirm dag-ml
// expanded the pipeline into >=3 variants and selected a best one — all with no
// console errors. Exercises toCompatDsl param_generators → build_execution_plan
// variants → per-variant FIT_CV → select_candidates_json end-to-end.
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

  // open the pipeline workbench (model node is selected by default)
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // open the sweep popover on the model's n_components param
  const sweepTrigger = page.locator('[data-sweep-trigger="n_components"]').first()
  await sweepTrigger.click()
  await page.waitForTimeout(200)

  // choose the "Discrete" (or) sweep type, then enter 5, 10, 20
  await page.getByRole('button', { name: 'Discrete', exact: true }).first().click()
  await page.waitForTimeout(150)
  const valuesInput = page.locator('input[placeholder="5, 10, 20"]').first()
  await valuesInput.fill('5, 10, 20')
  await page.waitForTimeout(150)

  // the popover badge should show 3×
  const popBody = (await page.textContent('body')) || ''
  if (/3×/.test(popBody)) console.log('✓ sweep popover shows 3 values')
  else fail('expected the sweep popover to show a 3× badge')

  // apply
  await page.getByRole('button', { name: /Apply/i }).first().click()
  await page.waitForTimeout(200)

  // the toolbar variant chip should now read ×3 variants
  const chip = await page.locator('[data-variant-chip]').first().textContent().catch(() => '')
  if (chip && /3/.test(chip)) console.log(`✓ variant chip present (${chip.trim()})`)
  else fail('expected a ×N variants chip in the toolbar')

  // run the pipeline
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  console.log('✓ pipeline executed (CV Scores rendered)')

  // results: a "{n} variants" chip and per-variant rows with a selected best
  const resultsChip = await page.locator('[data-variant-chip]').first().textContent().catch(() => '')
  if (resultsChip && /3 variants/.test(resultsChip)) console.log('✓ results show a 3-variants chip')
  else fail(`expected a "3 variants" chip on the result card (got "${resultsChip}")`)

  // expand the variants list and count the rows
  await page.locator('[data-variants] button').first().click()
  await page.waitForTimeout(200)
  const rows = page.locator('[data-variant-row]')
  const rowCount = await rows.count()
  if (rowCount >= 3) console.log(`✓ ${rowCount} variant rows rendered`)
  else fail(`expected >=3 variant rows, got ${rowCount}`)

  const selected = await page.locator('[data-variant-row][data-variant-selected="true"]').count()
  if (selected === 1) console.log('✓ exactly one variant marked as best/selected')
  else fail(`expected exactly one selected variant, got ${selected}`)

  // --- BUG #5 PROOF: a single execute_campaign_phase_json runs dag-ml's WHOLE
  // variant plan (the scheduler loops all variants). The earlier code called it
  // once PER variant, so each variant's OOF was duplicated ×variantCount. Assert
  // the SELECTED variant's CV (OOF) + refit predictions have UNIQUE sampleIds (each
  // sample validated exactly once) and the count is NOT ×3, plus exactly one
  // variant selected — straight from the run result the engine produced.
  const run = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const ids = (rows) => (rows || []).map((p) => p.sampleId)
    const cvIds = ids(r.cv?.predictions)
    const refitIds = ids(r.refit?.predictions)
    return {
      variantCount: r.variantCount,
      selectedCount: (r.variants || []).filter((v) => v.selected).length,
      cvN: cvIds.length,
      cvUnique: new Set(cvIds).size,
      cvMetricN: r.cv?.metrics?.n,
      refitN: refitIds.length,
      refitUnique: new Set(refitIds).size,
    }
  })
  if (!run) fail('window.__n4aLastRun was not set — could not introspect the run result')
  else {
    if (run.variantCount === 3) console.log('✓ run.variantCount === 3')
    else fail(`expected run.variantCount === 3, got ${run.variantCount}`)

    if (run.selectedCount === 1) console.log('✓ exactly one variant selected in the run result')
    else fail(`expected exactly 1 selected variant in run result, got ${run.selectedCount}`)

    // the load-bearing assertion: OOF NOT duplicated ×variantCount
    if (run.cvN > 0 && run.cvN === run.cvUnique) console.log(`✓ CV OOF has unique sampleIds (${run.cvN} rows, no ×3 duplication)`)
    else fail(`CV OOF rows are duplicated: ${run.cvN} rows but only ${run.cvUnique} unique sampleIds (bug #5 — ×variantCount duplication)`)

    if (run.cvMetricN === run.cvUnique) console.log(`✓ cv.metrics.n (${run.cvMetricN}) == unique OOF samples`)
    else fail(`cv.metrics.n (${run.cvMetricN}) != unique OOF samples (${run.cvUnique})`)

    if (run.refitN > 0 && run.refitN === run.refitUnique) console.log(`✓ refit predictions have unique sampleIds (${run.refitN} rows)`)
    else fail(`refit predictions are duplicated: ${run.refitN} rows but only ${run.refitUnique} unique sampleIds`)
  }

  // run still via dag-ml (badge present) — selection stays in dag-ml
  const body = (await page.textContent('body')) || ''
  if (/by dag-ml/i.test(body)) console.log('✓ run via dag-ml-wasm (badge present)')
  else fail('expected a "by dag-ml" badge on the served build')

  await page.screenshot({ path: '/tmp/n4a_generators_smoke.png', fullPage: true })

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail('generators smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'GENERATORS SMOKE FAILED' : 'GENERATORS SMOKE PASSED')
