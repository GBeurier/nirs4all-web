// Validates the real nirs4all-formats + nirs4all-io WASM upload path in-browser:
// upload a coherent multi-sample vendor SPC file → decode → infer →
// io.assembleDataset (fs-free, Rust) → Explore renders. (No pipeline run: the
// file carries no targets.) NB: nir.spc holds 20 NIR spectra of one width — a
// real dataset. The other galactic samples (BENZENE/TOLUENE/HCL) are single
// spectra of *different* widths, which io correctly refuses to fuse into one
// dataset (the old TS heuristic silently kept only the mode-width file).
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4320/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const SPC_DIR = process.env.SPC_DIR || '/home/delete/nirs4all/nirs4all-formats/samples/galactic_spc'
const SPC = [`${SPC_DIR}/nir.spc`].filter(existsSync)
const EXPECT_SAMPLES = 20

if (SPC.length < 1) {
  console.log(`⚠ skipping — need nir.spc under ${SPC_DIR}`)
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
  await page.locator('input[type=file]').first().setInputFiles(SPC)
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  const badge = (await page.locator('text=/samples ×/').first().textContent()) || ''
  console.log(`✓ vendor SPC decoded → Explore badge: "${badge.trim()}"`)
  const n = parseInt(badge, 10)
  if (!(n === EXPECT_SAMPLES)) {
    console.error(`✗ expected ${EXPECT_SAMPLES} samples (nir.spc), badge says "${badge.trim()}"`)
    process.exitCode = 1
  }
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
console.log(process.exitCode ? 'WASM-UPLOAD SMOKE FAILED' : 'WASM-UPLOAD SMOKE PASSED')
