// Historical physical Archive V2 fixtures are refused by the current Core V1
// transport before model import. Keep the original bytes; no legacy replay or
// JavaScript fallback is supported.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const PROFILE = process.env.SMOKE_WEB_PROFILE || ''
// Core's UnsupportedFormat display, propagated verbatim by parseN4aFile and
// formatRuntimeErrorForUi into DatasetUpload's visible error span.
const REFUSAL = 'n4a unsupported format: only nirs4all.n4a.container.v1 / zip-stored.v1 reader 1 is supported'
const CASES = [
  {
    archive: new URL('../src/engine/fixtures/archive-v2/multitarget-pls.n4a', import.meta.url).pathname,
    sha256: '3a3ff44c6cb33579b561ef68008dbc04157ee0f779133de6b7fc3d67082210cf',
  },
  {
    archive: new URL('../src/engine/fixtures/archive-v2/snv-savgol-pls.n4a', import.meta.url).pathname,
    sha256: 'ccac47faeeca1d8de493245182bc4a4375d3c487f60f2bfb2b108bddd2339498',
  },
]

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(`PAGEERR: ${error.message}`))

try {
  for (const fixture of CASES) {
    assert.equal(createHash('sha256').update(readFileSync(fixture.archive)).digest('hex'), fixture.sha256,
      `historical fixture bytes changed: ${fixture.archive}`)
    await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
    await page.locator('input[type=file][accept*=".n4a"]').first().setInputFiles(fixture.archive)
    await page.getByText(REFUSAL, { exact: true }).waitFor({ state: 'visible', timeout: 20000 })

    // App only enables Predict after adopting a fitted model or a completed run.
    assert.equal(await page.locator('button[data-step="predict"]').isDisabled(), true,
      `refused archive enabled Predict: ${fixture.archive}`)
    assert.equal(await page.getByText('Predict on new spectra', { exact: true }).count(), 0,
      `refused archive opened the prediction panel: ${fixture.archive}`)
    assert.equal(await page.getByText('Canonical Archive V2 replay:', { exact: false }).count(), 0,
      `refused archive produced a replay: ${fixture.archive}`)
  }
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`)
  console.log(`✓ ${PROFILE || 'unknown'} both historical physical Archive V2 fixtures explicitly refused by Core V1 transport; Predict disabled, no fallback`)
} finally {
  await browser.close()
}
