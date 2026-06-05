// FEATURE 1 smoke: cross-validation is OPTIONAL and lives right after the
// train/test split (split 2). The default pipeline has CV on. We:
//   1. remove the CV node (the `[data-add-cv]` affordance appears) → run → assert
//      ONLY a Refit score is produced (no "CV Scores", no folds) — a refit-only run;
//   2. re-add CV → run → "CV Scores" returns.
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

  // the default pipeline has a CV node ("Cross-validation"); remove it via its
  // dedicated remove button (force-click — the trash is opacity-0 until hover).
  if (!(await page.locator('[data-cv-node]').count())) { fail('expected a CV node on the canvas by default'); }
  await page.locator('[data-cv-node]').first().scrollIntoViewIfNeeded()
  await page.locator('[aria-label="Remove cross-validation"]').first().click({ force: true })
  await page.waitForTimeout(200)
  // after removal, the "Add cross-validation" affordance must appear
  if (await page.locator('[data-add-cv]').count()) console.log('✓ CV removed — refit-only affordance shown')
  else fail('expected [data-add-cv] after removing CV')

  // run the refit-only pipeline
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/Refit/', { timeout: 60000 })
  await page.waitForTimeout(400)
  const body1 = (await page.textContent('body')) || ''
  if (/CV Scores/.test(body1)) fail('refit-only run must NOT produce "CV Scores"')
  else console.log('✓ refit-only run produced no CV Scores')

  const r1 = await page.evaluate(() => {
    const r = window.__n4aLastRun
    return r ? { hasCv: !!r.cv, folds: r.folds?.length ?? 0, refit: r.refit?.name, engine: r.engine } : null
  })
  if (!r1) fail('no __n4aLastRun captured for refit-only')
  else if (r1.hasCv || r1.folds !== 0) fail(`refit-only run still has cv (hasCv=${r1.hasCv}, folds=${r1.folds})`)
  else console.log(`✓ refit-only RunResult: cv=absent, folds=0, "${r1.refit}" (engine: ${r1.engine})`)

  // the run navigated to Results — go back to the pipeline editor to re-add CV
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)
  // re-add CV and run again → CV Scores must return
  await page.locator('[data-add-cv]').click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ re-added CV — CV Scores returned')

  const r2 = await page.evaluate(() => {
    const r = window.__n4aLastRun
    return r ? { hasCv: !!r.cv, folds: r.folds?.length ?? 0 } : null
  })
  if (!r2 || !r2.hasCv || r2.folds < 2) fail(`expected a CV run after re-adding (hasCv=${r2 && r2.hasCv}, folds=${r2 && r2.folds})`)
  else console.log(`✓ CV run restored: cv=present, folds=${r2.folds}`)

  await page.screenshot({ path: '/tmp/cv_optional_smoke.png', fullPage: true })

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
console.log(process.exitCode ? 'CV-OPTIONAL SMOKE FAILED' : 'CV-OPTIONAL SMOKE PASSED')
