// Validates the nirs4all-io CSV-folder path in-browser: upload a standard nirs4all
// X*/Y* train/test folder (semicolon-delimited, quoted, no sample-id column) →
// decode + infer + materialize WITH targets → run the pipeline → CV scores render
// (a run is refused without targets, so reaching CV Scores proves y was loaded).
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const DIR = process.env.AMYLOSE_DIR || '/home/delete/nirs4all/nirs4all-data/regression/AMYLOSE/Rice_Amylose_313_YbasedSplit'
const FILES = ['Xtrain.csv', 'Ytrain.csv', 'Xtest.csv', 'Ytest.csv'].map((f) => `${DIR}/${f}`)

if (!FILES.every(existsSync)) {
  console.log(`⚠ skipping — AMYLOSE fixtures not found under ${DIR}`)
  process.exit(0)
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(FILES)
  await page.waitForSelector('text=/samples ×/', { timeout: 40000 })
  const badge = (await page.locator('text=/samples ×/').first().textContent()) || ''
  console.log(`✓ AMYLOSE folder decoded → badge: "${badge.trim()}"`)
  const n = parseInt(badge, 10)
  if (!(n === 313)) {
    console.error(`✗ expected 313 samples (203 train + 110 test), badge says "${badge.trim()}"`)
    process.exitCode = 1
  }

  // run → CV Scores proves targets were materialized (engine refuses targetless training)
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  console.log('✓ pipeline ran → CV Scores rendered (targets were loaded & aligned)')

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  console.error('✗ ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'AMYLOSE-FOLDER SMOKE FAILED' : 'AMYLOSE-FOLDER SMOKE PASSED')
