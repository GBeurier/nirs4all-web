// Real browser edits of the canonical fusion pipeline -> worker -> native DAG/Methods.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const output = process.env.MULTIMODAL_EDITOR_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-editor')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = [], mutations = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
const lab = page.locator('[data-fusion-lab]')
const status = page.locator('.n4fl-status')

async function preset(label) {
  await lab.getByRole('button', { name: label, exact: true }).click()
  assert.equal(await lab.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true')
}
async function run(count = 1) {
  const before = await page.locator('[data-fusion-results]').count() ? await results() : { runs: [] }
  await page.getByRole('button', { name: 'Run this pipeline', exact: true }).click()
  await page.waitForFunction(expected => new RegExp(`${expected} runs? added to the comparison`).test(document.querySelector('.n4fl-status')?.textContent ?? ''),
    count, { timeout: 300000 })
  const after = await results()
  assert.equal(after.runs.length, before.runs.length + count)
  return count === 1 ? after.runs.at(-1) : after.runs.slice(-count)
}
async function results() {
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const path = join(output, `results-${Date.now()}.json`)
  await download.saveAs(path)
  return JSON.parse(await readFile(path, 'utf8'))
}
async function setParam(cell, label, value) {
  await lab.getByRole('button', { name: cell }).first().click()
  const field = lab.getByRole('textbox', { name: label, exact: true })
  await field.fill(String(value))
  await field.press('Enter')
}

try {
  await page.goto(new URL('nirs4all_multimodale/?case=spectroscopy&preset=early', root).href, { waitUntil: 'load' })
  await lab.waitFor({ timeout: 60000 })
  // The early preset sweeps the PLS components: one complete run per value, same folds.
  await preset('Early · concatenate')
  const sweep = await run(3)
  assert.deepEqual(sweep.map(item => item.document.branches[0].head.params.n_components), [5, 10, 15])
  assert.deepEqual(sweep.map(item => item.name), [5, 10, 15].map(value => `Early · concatenate · PLS regression · n_components = ${value}`))
  assert.deepEqual(sweep[1].choices, { 'PLS regression · n_components': 10 })
  assert.equal(new Set(sweep.map(item => item.candidate.foldsFingerprint)).size, 1)
  assert.deepEqual(sweep[0].document.branches[0].sourceIds, ['raman', 'nirs', 'mir'])

  // Edit a fixed model capacity on the canvas.
  await preset('Mid · PCA scores')
  const early = await run()
  assert.equal(early.name, 'Mid · PCA scores')
  assert.equal(early.document.branches[0].head.params.n_components, 3)
  await setParam(/^Model: PLS\./, 'Components', 6)
  await page.waitForFunction(() => document.querySelector('.n4fl-chip[aria-pressed="true"]') === null)
  const six = await run()
  assert.equal(six.name, 'Edited Mid · PCA scores')
  assert.equal(six.document.branches[0].head.params.n_components, 6)
  assert.equal(six.candidate.foldsFingerprint, early.candidate.foldsFingerprint)
  assert.notEqual(six.candidate.oof.rmse, early.candidate.oof.rmse)
  await lab.screenshot({ path: join(output, 'edited-early.png') })

  // Remove one source lane: the recipe now fuses two sources.
  await lab.getByRole('button', { name: 'Sources, mir', exact: true }).click()
  await page.keyboard.press('Delete')
  await lab.getByRole('button', { name: 'Sources, mir', exact: true }).waitFor({ state: 'detached' })
  const two = await run()
  assert.deepEqual(two.document.branches[0].sourceIds, ['raman', 'nirs'])

  // Late fusion: one model per source, a learned meta-model.
  await preset('Late · stacking')
  const stacking = await run()
  assert.equal(stacking.document.merge.kind, 'model')
  assert.equal(stacking.document.branches.length, 3)
  assert.ok(stacking.candidate.diagnostics.length > 0)

  // An inadmissible edit is explained and cannot run.
  await preset('Early · MB-PLS')
  await lab.getByRole('button', { name: /^Model: MB-PLS\./ }).click()
  await page.keyboard.press('Shift+A')
  await lab.getByRole('searchbox').fill('Merge sources')
  await lab.getByRole('button', { name: /Merge sources/ }).first().click()
  await status.getByText(/fuses the source blocks itself/).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Run this pipeline', exact: true }).isDisabled())
  await lab.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'Run this pipeline', exact: true }).isEnabled())

  // Spectral preprocessing is refused on marker tables.
  await page.locator('input[name="n4mm-case"][value="genetics"]').check()
  await lab.waitFor()
  await lab.getByRole('button', { name: /^Preprocessing: Standard scaling\./ }).nth(1).click()
  await page.keyboard.press('a')
  await lab.getByRole('searchbox').fill('SNV')
  await lab.getByRole('button', { name: /^SNV/ }).first().click()
  await status.getByText(/applies to spectra/).waitFor()

  // Inspector compares every completed run of the case.
  await page.locator('input[name="n4mm-case"][value="spectroscopy"]').check()
  await page.locator('[data-fusion-results]').getByText('7 completed runs', { exact: false }).waitFor()
  await page.locator('#n4mm-results').screenshot({ path: join(output, 'inspector.png') })
  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  console.log(JSON.stringify({ sweep: sweep.map(item => item.candidate.oof.rmse), pca: early.candidate.oof.rmse, pls6: six.candidate.oof.rmse, ramanNirs: two.candidate.oof.rmse,
    stacking: stacking.candidate.oof.rmse }))
  console.log('MULTIMODAL EDITOR SMOKE PASSED: canvas edits, lane removal, late stacking, refusals and Inspector history')
} finally {
  await browser.close()
}
