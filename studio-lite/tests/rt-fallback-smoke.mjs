// B-018 runtime-fallback smoke: a clean dag-ml run must be SILENT — it executes natively and
// surfaces NO `RtError` fallback diagnostic. This is the browser/WASM half the node vitest env
// can't reach (the typed envelope + projection are unit-tested in src/engine/rt*.test.ts; here we
// assert the end-to-end invariant that the served dag-ml path doesn't spuriously degrade).
//
// Invariant on the happy path (served build): the "by dag-ml" badge is present (native execution)
// AND the amber "CV: libn4m fallback" chip is ABSENT (no `lineage.schedulerFallback`, no
// `RunResult.diagnostics`). Guards against the engine regressing to an always-on or silent fallback.
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4317/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const FALLBACK_CHIP = 'CV: libn4m fallback'

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

const isFile = String(APP_URL).startsWith('file:')

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // load the bundled regression sample, then run the default pipeline
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  console.log('✓ pipeline executed, results rendered')

  const body = (await page.textContent('body')) || ''

  // served build runs the native dag-ml scheduler; under file:// the JS backend is used (no badge/chip)
  if (!isFile) {
    if (/by dag-ml/i.test(body)) console.log('✓ clean native run (by dag-ml badge present)')
    else fail('expected a "by dag-ml" badge on the served build (clean native run)')
  }

  // the B-018 invariant: a clean run must NOT surface the fallback chip
  const chipCount = await page.locator(`text=${FALLBACK_CHIP}`).count()
  if (chipCount === 0) console.log('✓ no spurious fallback chip on a clean run (B-018 silent happy path)')
  else fail(`fallback chip "${FALLBACK_CHIP}" surfaced on a clean run (expected absent)`)

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
