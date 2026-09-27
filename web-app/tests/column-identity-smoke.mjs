// Column identity smoke (re-audit R09): a model trained on the Corn sample
// records its wavelength axis; Predict accepts the matching header (columns
// checked), refuses the same spectra with permuted columns, and states the
// positional contract for a file without a header row.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4317/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const XTEST = new URL('../src/data/demo/corn/Xtest.csv', import.meta.url).pathname

const lines = (await readFile(XTEST, 'utf8')).split(/\r?\n/).filter((l) => l.trim())
const dir = await mkdtemp(join(tmpdir(), 'n4a-columns-'))
const permuted = join(dir, 'Xtest-permuted.csv')
const anonymous = join(dir, 'Xtest-no-header.csv')
await writeFile(permuted, lines.map((l) => l.split(';').reverse().join(';')).join('\n'))
await writeFile(anonymous, lines.slice(1).join('\n'))

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

async function predict(file) {
  await page.locator('input[type=file][accept*="csv"]').first().setInputFiles(file)
  await page.waitForFunction(() => !/Predicting…/.test(document.body.textContent || ''), null, { timeout: 30000 })
  await page.waitForTimeout(300)
}

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  await page.locator('[data-step="predict"]').click()
  await page.waitForSelector('text=/Predict on new spectra/', { timeout: 10000 })

  await predict(XTEST)
  if (await page.locator('[data-column-check="names"]').count()) console.log('✓ matching header: columns checked by name and order')
  else fail('expected the "columns checked" notice for the matching header')

  await predict(permuted)
  const body = (await page.textContent('body')) || ''
  if (/do not match the model's.*different order/.test(body) && (await page.locator('[data-column-check]').count()) === 0) {
    console.log('✓ permuted columns refused, no prediction shown')
  } else fail('expected permuted columns to be refused')

  await predict(anonymous)
  const notice = page.locator('[data-column-check="positional"]')
  if ((await notice.count()) && /no header row.*taken by position/.test((await notice.textContent()) || '')) {
    console.log('✓ file without header: positional contract stated')
  } else fail('expected the positional notice for a file without header')

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else console.log('✓ no JS console errors')
} catch (e) {
  fail('smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED')
