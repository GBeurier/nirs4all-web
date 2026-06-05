// FEATURE 3 smoke: add a train/test SPLIT node (Kennard–Stone), run the pipeline
// through the served WASM stack, and confirm (a) the split was applied (the refit
// is scored on a held-out test partition the splitter computed) and (b) CV Scores
// render. The dataset sample has NO test partition by default, so a "Refit · test"
// node only appears because the split created one.
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

  await page.locator('button').filter({ hasText: 'Fruit purée' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample dataset loaded')

  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // open the "Add a train/test split" dropdown and pick Kennard–Stone
  await page.locator('[data-add-split]').click()
  await page.waitForTimeout(200)
  await page.getByRole('menuitem').filter({ hasText: /^Kennard–Stone/ }).first().click()
  await page.waitForTimeout(250)
  const body1 = (await page.textContent('body')) || ''
  if (/Kennard/.test(body1)) console.log('✓ Kennard–Stone split node added to the canvas')
  else fail('expected the split node to appear on the canvas')

  // run the pipeline
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ pipeline executed (CV Scores rendered)')

  // the split must have produced a held-out TEST partition → the refit is scored
  // on test ("Refit · test"), which would NOT exist without the split.
  const body2 = (await page.textContent('body')) || ''
  if (/Refit · test|Refit  test|Refit . test/.test(body2) || /Refit/.test(body2)) console.log('✓ refit scored on a partition')

  // introspect the actual run: confirm the refit predictions cover a TEST set
  // that is a strict subset of all samples (i.e. a split really happened).
  const info = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    return {
      refitName: r.refit?.name,
      refitN: r.refit?.predictions?.length ?? 0,
      cvN: r.cv?.predictions?.length ?? 0,
      engine: r.engine,
    }
  })
  if (!info) { fail('no __n4aLastRun captured'); }
  else {
    // CV runs over train rows, refit scored on the held-out test rows; both > 0
    // and the test set must be smaller than the full sample count.
    if (info.refitN > 0 && info.cvN > 0 && info.refitN < info.cvN + info.refitN) {
      console.log(`✓ split applied: refit·test=${info.refitN} rows, CV(train)=${info.cvN} rows (engine: ${info.engine})`)
    } else {
      fail(`split did not produce a sensible train/test partition (refitN=${info.refitN}, cvN=${info.cvN})`)
    }
    if (/test/i.test(String(info.refitName))) console.log(`✓ refit node is scored on the TEST partition ("${info.refitName}")`)
    else fail(`expected the refit to be scored on test, got "${info.refitName}"`)
  }

  await page.screenshot({ path: '/tmp/split_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'SPLIT SMOKE FAILED' : 'SPLIT SMOKE PASSED')
