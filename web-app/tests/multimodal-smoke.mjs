// Actual served UI -> import owners -> compute worker -> native DAG/Methods ->
// explicit user export. No test-only engine entry or fabricated result.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const output = process.env.MULTIMODAL_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-smoke')
const expectedPins = JSON.parse(await readFile(new URL('../scripts/public-packages.v1.json', import.meta.url), 'utf8'))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], failedRequests = [], mutations = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
const strategies = ['single', 'early', 'mbpls', 'late', 'stacking', 'hybrid', 'mid', 'mid-stacking']
const sameIds = (a, b) => assert.deepEqual([...a].sort(), [...b].sort())

async function downloadResult(caseId) {
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const path = join(output, `${caseId}-results.json`)
  await download.saveAs(path)
  return JSON.parse(await readFile(path, 'utf8'))
}

function verifyRun(document, count) {
  assert.equal(document.schema, 'nirs4all.multimodal-lab.results.v1')
  const run = document.run
  assert.equal(run.ownerVersions.dag, expectedPins.dagml.version)
  assert.equal(run.ownerVersions.methods, `${expectedPins.methods.version}+abi.${expectedPins.methods.abi}`)
  assert.equal(run.ownerVersions.methodsAbi, expectedPins.methods.abi)
  assert.deepEqual(run.refusals, [], JSON.stringify(run.refusals))
  assert.equal(run.candidates.length, count)
  assert.equal(run.calibrationIds.length, 96)
  assert.equal(run.holdoutIds.length, 24)
  assert.equal(new Set([...run.calibrationIds, ...run.holdoutIds]).size, 120)
  sameIds(new Set(run.candidates.map(candidate => candidate.strategy)), strategies)
  const calibration = new Set(run.calibrationIds)
  // The CC0 genetics fixture declares adjacent observation pairs of one
  // material. Keep this independent oracle outside the production host.
  const groups = new Map(document.dataset.caseId === 'genetics'
    ? [...run.calibrationIds, ...run.holdoutIds].map(id => [id, Math.floor(Number(id.slice(-3)) / 2)]) : [])
  const groupMembers = new Map()
  for (const [id, group] of groups) if (group != null) groupMembers.set(group, [...(groupMembers.get(group) || []), id])
  for (const candidate of run.candidates) {
    assert.equal(candidate.foldsFingerprint, run.foldsFingerprint)
    assert.equal(candidate.oof.n, 96)
    assert.equal(candidate.holdout.n, 24)
    sameIds(candidate.oof.rows.map(row => row.sampleId), run.calibrationIds)
    sameIds(candidate.holdout.rows.map(row => row.sampleId), run.holdoutIds)
    assert.ok(Number.isFinite(candidate.oof.rmse) && Number.isFinite(candidate.holdout.rmse))
    assert.ok(!('portablePackageJson' in candidate), 'download must respect fitted-state training-row consent')
    for (const audit of candidate.diagnostics) {
      assert.ok(audit.sampleIds.every(id => calibration.has(id)), 'fit included a held-out identity')
      const ids = new Set(audit.sampleIds)
      for (const members of groupMembers.values()) {
        assert.ok(members.every(id => ids.has(id)) || members.every(id => !ids.has(id)), 'fit divided a biological group')
      }
      const fold = run.folds.folds.find(fold => fold.fold_id === audit.foldId)
      if (fold) assert.ok(fold.validation_sample_ids.every(id => !ids.has(id)), 'fit included outer validation')
    }
  }
  // Native fixed-mean output must equal the separately executed source baselines
  // under the same sources, transforms, folds and fixed PLS hyperparameters.
  const late = run.candidates.find(candidate => candidate.strategy === 'late')
  const baselines = run.candidates.filter(candidate => candidate.strategy === 'single')
  for (const scope of ['oof', 'holdout']) {
    const lookups = baselines.map(candidate => new Map(candidate[scope].rows.map(row => [row.sampleId, row.predicted])))
    for (const row of late[scope].rows) {
      const mean = lookups.reduce((sum, values) => sum + values.get(row.sampleId), 0) / lookups.length
      assert.ok(Math.abs(row.predicted - mean) < 1e-10 * Math.max(1, Math.abs(mean)), 'native late fusion differs from fixed mean')
    }
  }
  console.log(JSON.stringify({ caseId: document.dataset.caseId, recipes: run.candidates.length,
    calibration: 96, holdout: 24, elapsedMs: run.elapsedMs,
    rmse: run.candidates.map(candidate => [candidate.id, candidate.oof.rmse, candidate.holdout.rmse]) }))
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Multisource and multimodal fusion', exact: true }).waitFor()
  for (const [caseId, count] of [['spectroscopy', 10], ['genetics', 9], ['images', 9]]) {
    await page.locator(`input[name="n4mm-case"][value="${caseId}"]`).check()
    await page.locator('#n4mm-pipeline').waitFor({ timeout: 30000 })
    await page.getByText('Compare unedited presets', { exact: true }).click()
    const runButton = page.getByRole('button', { name: 'Run comparison', exact: true })
    await runButton.waitFor({ timeout: 30000 })
    const preset = { spectroscopy: 'spectroscopy-complementary', genetics: 'genetics-replicates', images: 'images-spatial' }[caseId]
    await page.getByRole('button', { name: 'Import your files', exact: true }).click()
    const [example] = await Promise.all([page.waitForEvent('download'),
      page.locator(`a[href$="/${preset}.zip"]`).click()])
    const examplePath = join(output, `${caseId}-example.zip`)
    await example.saveAs(examplePath)
    assert.deepEqual(await readFile(examplePath),
      await readFile(new URL(`../public/multimodal-data/${preset}.zip`, import.meta.url)),
      'the real example download must contain the exact shipped collection')
    await page.getByRole('button', { name: 'Synthetic teaching data', exact: true }).click()
    await runButton.click()
    await page.getByRole('button', { name: 'Cancel run', exact: true }).waitFor()
    assert.ok(await page.locator('input[name="n4mm-case"]').first().isDisabled())
    await page.getByText('Run complete. Results below belong to the configuration shown above.', { exact: true })
      .waitFor({ timeout: 600000 })
    verifyRun(await downloadResult(caseId), count)
    await page.locator('#n4mm-results').screenshot({ path: join(output, `${caseId}-results.png`) })
    await page.locator('#n4mm-explore').screenshot({ path: join(output, `${caseId}-sources.png`) })
  }
  // An edit must remove the prior result before a new run starts.
  await page.getByRole('textbox', { name: /^Seed/ }).fill('18446744073709551615')
  await page.getByRole('textbox', { name: /^Seed/ }).press('Tab')
  assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isDisabled())
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel run', exact: true }).click()
  await page.getByText(/Run cancelled/).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isDisabled())
  assert.ok(await page.getByRole('button', { name: 'Run comparison', exact: true }).isEnabled())
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'the page must reflow; wide diagrams and tables scroll inside their regions')
  const diagram = page.getByRole('region', { name: /^Branch and merge diagram/ })
  await diagram.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('.n4mm-graph__scroll').scrollLeft > 0)
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  assert.deepEqual(failedRequests, [])
  assert.deepEqual(mutations, [])
  console.log('MULTIMODAL SMOKE PASSED: three real worker/native matrices, mean/replay, fit cohorts, invalidation and cancellation')
} finally {
  await browser.close()
}
