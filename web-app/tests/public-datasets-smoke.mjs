// Actual staged Data+IO owners with a faithful synthetic original CSV.
// Only the declared source request is intercepted: no catalog mirror, owner mock,
// live origin download, dataset upload or claim of publisher CORS support.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright-core'

const appUrl = process.env.SMOKE_URL || 'http://localhost:4317/'
const output = process.env.SMOKE_ARTIFACT_DIR || await mkdtemp(join(tmpdir(), 'n4a-public-origins-'))
await mkdir(output, { recursive: true })
const datasetId = 'canopy_treatment_2009_2016_to_cedar_ecosis'
const sourceUrl = 'https://data.ecosis.org/dataset/e7459b49-06d3-4e1d-beaa-cab0e012cc23/resource/73612f6f-0627-44c3-be63-2ab4e33002a1/download/e244_multispec_raw_data.csv'
// The real owner's declared columns and mappings, with two synthetic observations.
// Repeated Experiment is metadata, not permission to collapse observation IDs.
const csv = Buffer.from('Experiment,Treatment, 485 (nm) wavelength ,560 (nm) wavelength ,660 (nm) wavelength,830 (nm) wavelength,1650 (nm) wavelength ,PLOT,Note\ne244,Control,-0.0,0.2,,0.4,0.5,1,first\ne244,Insecticide,0.6,0.7,0.8,0.9,1.0,2,second\n')
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const errors = []
const requests = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()) })
  page.on('request', request => { if (request.url().startsWith('https://')) requests.push(request.url()) })
  let filePickers = 0
  page.on('filechooser', () => { filePickers++ })
  let downloads = 0
  let mode = 'slow'
  let releaseSlow
  let signalSlowStarted
  let signalSlowSettled
  const slowStarted = new Promise(resolve => { signalSlowStarted = resolve })
  const slowSettled = new Promise(resolve => { signalSlowSettled = resolve })
  await page.route(sourceUrl, async route => {
    const request = route.request()
    assert.equal(request.method(), 'GET')
    assert.equal(request.headers().cookie, undefined)
    assert.equal(request.headers().authorization, undefined)
    assert.equal(request.headers().referer, undefined)
    downloads++
    const slow = mode === 'slow'
    if (slow) await new Promise(resolve => { releaseSlow = resolve; signalSlowStarted() })
    if (mode === 'http-error') return route.fulfill({ status: 503, body: 'Synthetic publisher failure' })
    await route.fulfill({ contentType: 'text/csv', body: csv }).catch(() => {})
    if (slow) signalSlowSettled()
  })
  await page.goto(appUrl, { waitUntil: 'load' })
  const browse = page.getByRole('button', { name: 'Browse public datasets', exact: true })
  await browse.focus()
  await browse.press('Enter')
  const dialog = page.getByRole('dialog')
  const search = dialog.getByLabel('Search public datasets')
  await search.fill('cartilage_spectroscopy_scientificdata_nir')
  await dialog.getByRole('button', { name: /cartilage_spectroscopy_scientificdata_nir/ }).click()
  await dialog.getByRole('status').filter({ hasText: /not implemented by browser profile/ }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Download and import' }).isDisabled(), true)
  assert.equal(downloads, 0, 'unsupported source refuses before any dataset download')
  await search.fill(datasetId)
  await dialog.getByRole('button', { name: new RegExp(datasetId) }).click()
  assert.equal(downloads, 0, 'embedded catalog browsing downloads no dataset or index')
  const importButton = dialog.getByRole('button', { name: 'Download and import' })
  await importButton.click()
  await slowStarted
  await dialog.getByRole('button', { name: 'Cancel download' }).click()
  releaseSlow?.()
  await slowSettled
  await page.waitForLoadState('networkidle')
  assert.equal(await dialog.isVisible(), true, 'cancellation keeps the import dialog open after the late response settles')
  assert.equal(await page.getByText(/\d+ samples × \d+ wavelengths/).count(), 0, 'cancelled imports cannot adopt a late dataset')
  mode = 'http-error'
  await importButton.click()
  await dialog.getByText(/answered HTTP 503/).waitFor()
  mode = 'valid'
  await dialog.getByRole('button', { name: 'Retry import' }).click()
  await page.getByText(/2 samples × 5 wavelengths/).first().waitFor()
  assert.equal(await dialog.count(), 0)
  assert.equal(downloads, 3, 'cancel, HTTP failure and successful retry')
  assert.equal(filePickers, 0, 'keyboard browsing must not open the local file picker')
  assert.deepEqual(requests, [sourceUrl, sourceUrl, sourceUrl], 'only the declared original resource is fetched')
  await page.screenshot({ path: join(output, 'public-origin-imported.png') })
  assert.deepEqual(errors, [], 'no browser execution errors')
  await writeFile(join(output, 'public-origin-smoke.json'), JSON.stringify({ status: 'PASS', scope: 'Actual staged Data+IO with a synthetic source CSV; no live origin/CORS claim.', dataset_id: datasetId, source_url: sourceUrl, shape: [2, 5], synthetic_csv_sha256: createHash('sha256').update(csv).digest('hex'), downloads, errors, checks: ['embedded catalog without network', 'explicit unsupported reason', 'keyboard activation', 'cancellation', 'HTTP refusal and retry', 'owner recipe and IO assembly'] }, null, 2) + '\n')
  console.log('✓ embedded owner catalog, unsupported refusal, cancellation, HTTP retry and original-source preparation')
  console.log(`Screenshots and receipt: ${output}`)
} finally {
  await browser.close()
}
