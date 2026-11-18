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
const sameIds = (a, b) => assert.deepEqual([...a].sort(), [...b].sort())
const LEVELS = { spectroscopy: 9, genetics: 8, images: 8 }

async function downloadResult(caseId) {
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const path = join(output, `${caseId}-results.json`)
  await download.saveAs(path)
  return JSON.parse(await readFile(path, 'utf8'))
}

async function runAll() {
  await page.getByRole('button', { name: /^Run all \d+ presets/ }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor()
  await page.waitForFunction(() => /added to the comparison/.test(document.querySelector('.n4fl-status')?.textContent ?? ''), null, { timeout: 600000 })
}

function verifyRuns(document, count) {
  assert.equal(document.schema, 'nirs4all.multimodal-lab.results.v2')
  assert.equal(document.runs.length, count)
  const folds = new Set(document.runs.map(run => run.candidate.foldsFingerprint))
  assert.equal(folds.size, 1, 'every preset shares one fold set')
  // The CC0 genetics fixture declares adjacent observation pairs of one
  // material. Keep this independent oracle outside the production host.
  const grouped = document.dataset.caseId === 'genetics'
  for (const run of document.runs) {
    const { candidate, protocol } = run
    assert.equal(protocol.ownerVersions.dag, expectedPins.dagml.version)
    assert.equal(protocol.ownerVersions.methods, `${expectedPins.methods.version}+abi.${expectedPins.methods.abi}`)
    assert.equal(protocol.calibrationIds.length, 96)
    assert.equal(protocol.holdoutIds.length, 24)
    assert.equal(new Set([...protocol.calibrationIds, ...protocol.holdoutIds]).size, 120)
    assert.equal(candidate.oof.n, 96)
    assert.equal(candidate.holdout.n, 24)
    sameIds(candidate.oof.rows.map(row => row.sampleId), protocol.calibrationIds)
    sameIds(candidate.holdout.rows.map(row => row.sampleId), protocol.holdoutIds)
    assert.ok(Number.isFinite(candidate.oof.rmse) && Number.isFinite(candidate.holdout.rmse))
    assert.ok(!('portablePackageJson' in candidate), 'download must respect fitted-state training-row consent')
    const calibration = new Set(protocol.calibrationIds)
    const groupMembers = new Map()
    if (grouped) for (const id of [...protocol.calibrationIds, ...protocol.holdoutIds]) {
      const group = Math.floor(Number(id.slice(-3)) / 2)
      groupMembers.set(group, [...(groupMembers.get(group) || []), id])
    }
    for (const audit of candidate.diagnostics) {
      assert.ok(audit.sampleIds.every(id => calibration.has(id)), 'fit included a held-out identity')
      const ids = new Set(audit.sampleIds)
      for (const members of groupMembers.values()) {
        assert.ok(members.every(id => ids.has(id)) || members.every(id => !ids.has(id)), 'fit divided a biological group')
      }
      const fold = protocol.folds.folds.find(fold => fold.fold_id === audit.foldId)
      if (fold) assert.ok(fold.validation_sample_ids.every(id => !ids.has(id)), 'fit included outer validation')
    }
  }
  // Native fixed-mean output must equal the separately executed source baselines
  // under the same sources, transforms, folds and fixed PLS hyperparameters.
  const late = document.runs.find(run => run.name === 'Late · average').candidate
  const baselines = document.runs.filter(run => run.name.endsWith(' alone')).map(run => run.candidate)
  assert.equal(baselines.length, document.dataset.sources.length)
  for (const scope of ['oof', 'holdout']) {
    const lookups = baselines.map(candidate => new Map(candidate[scope].rows.map(row => [row.sampleId, row.predicted])))
    for (const row of late[scope].rows) {
      const mean = lookups.reduce((sum, values) => sum + values.get(row.sampleId), 0) / lookups.length
      assert.ok(Math.abs(row.predicted - mean) < 1e-10 * Math.max(1, Math.abs(mean)), 'native late fusion differs from fixed mean')
    }
  }
  console.log(JSON.stringify({ caseId: document.dataset.caseId, runs: document.runs.length,
    rmse: document.runs.map(run => [run.name, run.candidate.oof.rmse, run.candidate.holdout.rmse]) }))
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Multisource and multimodal fusion', exact: true }).waitFor()
  for (const caseId of Object.keys(LEVELS)) {
    await page.locator(`input[name="n4mm-case"][value="${caseId}"]`).check()
    await page.locator('[data-fusion-lab]').waitFor({ timeout: 60000 })
    assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isDisabled())
    await runAll()
    await page.locator('[data-fusion-results]').waitFor()
    await page.locator('#n4mm-results').screenshot({ path: join(output, `${caseId}-results.png`) })
    verifyRuns(await downloadResult(caseId), LEVELS[caseId])
  }
  // Cancellation keeps completed runs and adds none.
  await page.getByRole('button', { name: /^Run all \d+ presets/ }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByText('Run cancelled. No partial result is kept.', { exact: true }).waitFor()
  const kept = await downloadResult('images-after-cancel')
  assert.equal(kept.runs.length, LEVELS.images)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'the page must reflow; the pipeline rack and Inspector scroll inside their regions')
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  assert.deepEqual(failedRequests, [])
  assert.deepEqual(mutations, [])
  console.log('MULTIMODAL SMOKE PASSED: three real preset matrices, fit cohorts, groups, native mean, cancellation and reflow')
} finally {
  await browser.close()
}
