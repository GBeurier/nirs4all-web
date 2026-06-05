// Validates the real nirs4all-formats + nirs4all-io WASM upload path in-browser:
// upload several vendor SPC files → decode → infer → materialize → Explore renders.
// (No pipeline run: bare SPC files carry no targets.)
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4320/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const SPC_DIR = process.env.SPC_DIR || '/home/delete/nirs4all/nirs4all-formats/samples/galactic_spc'
const SPC = ['BENZENE.SPC', 'TOLUENE.SPC', 'HCL.SPC', 'nir.spc'].map((f) => `${SPC_DIR}/${f}`).filter(existsSync)

if (SPC.length < 2) {
  console.log(`⚠ skipping — need ≥2 SPC fixtures under ${SPC_DIR} (found ${SPC.length})`)
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
  if (!(n >= SPC.length)) {
    console.error(`✗ expected ≥${SPC.length} samples, badge says "${badge.trim()}"`)
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
