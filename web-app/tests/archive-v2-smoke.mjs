// Browser qualification for canonical binary Archive V2 N4MM pipeline import
// and replay. Raw features must go to Methods WASM; there is no JavaScript
// preprocessing, model, or mono-target substitute.
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const PROFILE = process.env.SMOKE_WEB_PROFILE || ''
const ARCHIVE = new URL('../src/engine/fixtures/archive-v2/snv-savgol-pls.n4a', import.meta.url).pathname

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(`PAGEERR: ${error.message}`))

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(ARCHIVE)
  await page.getByText('Predict on new spectra', { exact: true }).waitFor({ timeout: 20000 })

  await page.locator('input[type=file][accept*="csv"]').last().setInputFiles({
    name: 'archive-v2-predict.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('2,3,5\n7,11,16\n'),
  })
  await page.getByText('Canonical Archive V2 replay: 2 targets (protein, moisture), no fallback.', { exact: false })
    .waitFor({ timeout: 30000 })

  const text = await page.locator('body').innerText()
  for (const expected of ['1.352', '11.529', '5.765', '18.147']) {
    if (!text.includes(expected)) throw new Error(`missing exact multi-target display value ${expected}`)
  }
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`)
  console.log(`✓ ${PROFILE || 'unknown'} Archive V2 SNV/Savitzky-Golay/PLS replay used Core/Methods WASM with no fallback`)
} finally {
  await browser.close()
}
