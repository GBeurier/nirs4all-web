// Batch runs of a preset subset: tick presets, "Run N selected presets" runs only those
// (unedited) and adds them to the comparison; "Run all" stays available.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
try {
  await page.goto(new URL('nirs4all_multimodale/?case=spectroscopy&preset=early', root).href, { waitUntil: 'load' })
  const lab = page.locator('[data-fusion-lab]')
  await lab.waitFor({ timeout: 120000 })
  const selected = lab.getByRole('button', { name: /^Run (\d+ selected presets?|selected presets)/ })
  assert.equal(await selected.isDisabled(), true, 'nothing ticked: the subset run is disabled')
  await lab.getByRole('checkbox', { name: 'Select Mid · PCA scores for a batch run' }).check()
  await lab.getByRole('checkbox', { name: 'Select Late · average for a batch run' }).check()
  await lab.getByRole('button', { name: 'Run 2 selected presets', exact: true }).waitFor()
  assert.match(await lab.getByRole('button', { name: /^Run all \d+ presets/ }).innerText(), /^Run all \d+ presets/)
  await lab.getByRole('button', { name: 'Run 2 selected presets', exact: true }).click()
  await page.waitForFunction(() => /2 runs added to the comparison \(unedited presets\)/.test(document.querySelector('.n4fl-status')?.textContent ?? ''), null, { timeout: 300000 })
  const results = await page.locator('#n4mm-results').innerText()
  assert.match(results, /2 completed runs/, 'only the two ticked presets ran')
  await lab.getByRole('button', { name: 'Clear selection', exact: true }).click()
  assert.equal(await lab.getByRole('checkbox', { checked: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log('MULTIMODAL SUBSET SMOKE PASSED: two ticked presets ran alone; Run all kept; selection cleared')
} finally { await browser.close() }
