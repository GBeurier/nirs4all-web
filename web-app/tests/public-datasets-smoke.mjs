// Browser import contract: source/target choice, integrity refusal, cancellation,
// and successful import. The default fixture is synthetic native IO output.
// Set PUBLIC_DATASETS_FIXTURE_DIR to additionally import a locally prepared bank
// export. No live origin access, uploads or public publication occur in this test.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const appUrl = process.env.SMOKE_URL || 'http://localhost:4317/'
const catalogUrl = process.env.SMOKE_PUBLIC_CATALOG_URL || 'https://datasets.nirs4all.org/browser/catalog.json'
const output = process.env.SMOKE_ARTIFACT_DIR || await mkdtemp(join(tmpdir(), 'n4a-public-datasets-'))
const synthetic = await readFile(new URL('./fixtures/public-dataset-assembled.json', import.meta.url))
const assetFact = (id, bytes) => ({ id, url: `sources/${id}.json`, sha256: createHash('sha256').update(bytes).digest('hex'), size_bytes: bytes.length })
const bytesBySource = new Map([['m', synthetic]])
const mirror = JSON.parse(synthetic)
mirror.source_id = 'mirror'
mirror.assembled.blocks.train.source_ids = ['mirror']
mirror.assembled.identity.provenance.source_ids = ['mirror']
bytesBySource.set('mirror', Buffer.from(JSON.stringify(mirror)))
const catalog = {
  schema: 'nirs4all.datasets.public-browser.v1',
  datasets: [
    { id: 'private_smoke', name: 'Private fixture must stay hidden', tier: 'private' },
    { id: 'public_smoke', name: 'Synthetic public dataset', tier: 'public', license: 'CC0-1.0',
      sources: ['mirror', 'm'].map(id => ({ ...assetFact(id, bytesBySource.get(id)), name: id === 'm' ? 'Original source' : 'Other source' })) },
  ],
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const errors = []
let page
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()) })
  let filePickers = 0
  page.on('filechooser', () => { filePickers++ })
  let downloads = 0
  let mode = 'slow'
  let releaseSlow
  let signalSlowStarted
  const slowStarted = new Promise(resolve => { signalSlowStarted = resolve })
  await page.route(new URL('.', catalogUrl).href + '**', async route => {
    const request = route.request()
    assert.equal(request.method(), 'GET')
    assert.equal(request.headers().cookie, undefined)
    if (request.url() === catalogUrl) {
      return route.fulfill({ json: catalog })
    }
    assert.equal(request.url(), new URL('sources/m.json', catalogUrl).href, 'only the explicitly chosen source is fetched')
    downloads++
    const bytes = Buffer.from(synthetic)
    if (mode === 'slow') await new Promise(resolve => { releaseSlow = resolve; signalSlowStarted() })
    if (mode === 'corrupt') bytes[0] ^= 1
    await route.fulfill({ contentType: 'application/json', body: bytes }).catch(() => {})
  })
  await page.goto(appUrl, { waitUntil: 'load' })
  const browse = page.getByRole('button', { name: 'Browse public datasets', exact: true })
  await browse.focus()
  await browse.press('Enter')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Search public datasets').fill('Synthetic')
  assert.equal(await dialog.getByText('Private fixture must stay hidden').count(), 0)
  await dialog.getByRole('button', { name: /Synthetic public dataset/ }).click()
  const importButton = dialog.getByRole('button', { name: 'Download and import' })
  assert.equal(await importButton.isDisabled(), true, 'multiple sources require an explicit choice')
  assert.equal(downloads, 0, 'browsing downloads no dataset bytes')
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: /Original source/ }).click()
  await importButton.click()
  await slowStarted
  await page.waitForFunction(() => document.body.textContent.includes('Cancel download'))
  await dialog.getByRole('button', { name: 'Cancel download' }).click()
  releaseSlow?.()
  assert.equal(await dialog.locator('[data-target-choice]').count(), 0, 'canceled imports cannot adopt a late response')
  mode = 'corrupt'
  await importButton.click()
  await dialog.getByText(/does not match its catalog SHA-256/).waitFor()
  mode = 'valid'
  await dialog.getByRole('button', { name: 'Retry import' }).click()
  const targetChoice = dialog.locator('[data-target-choice]')
  await targetChoice.waitFor()
  assert.deepEqual(await targetChoice.getByRole('button').allTextContents(), ['y', 'cls', 'k'])
  await page.screenshot({ path: join(output, 'public-datasets-target-choice.png') })
  await targetChoice.getByRole('button', { name: 'y', exact: true }).click()
  await page.getByText(/3 samples × 2 wavelengths/).first().waitFor()
  assert.equal(await dialog.count(), 0)
  assert.equal(downloads, 3, 'cancel, corrupt, retry; target choice never downloads again')
  assert.equal(filePickers, 0, 'keyboard activation must not open the local file picker')
  await page.screenshot({ path: join(output, 'public-datasets-imported.png') })
  console.log('✓ source/target choice, cancellation, checksum refusal and import')

  if (process.env.PUBLIC_DATASETS_FIXTURE_DIR) {
    const directory = process.env.PUBLIC_DATASETS_FIXTURE_DIR
    const realCatalog = JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8'))
    const entry = realCatalog.datasets[0]
    assert.equal(entry.tier, 'public')
    const source = entry.sources[0]
    const bytes = await readFile(join(directory, source.url))
    const real = JSON.parse(bytes)
    const rows = Object.values(real.assembled.blocks).reduce((n, block) => n + block.n_samples, 0)
    const columns = Object.values(real.assembled.blocks)[0].x[0].n_cols
    const realPage = await browser.newPage({ viewport: { width: 1280, height: 960 } })
    realPage.on('pageerror', error => errors.push(error.message))
    await realPage.route(new URL('.', catalogUrl).href + '**', async route => {
      assert.equal(route.request().method(), 'GET')
      if (route.request().url() === catalogUrl) return route.fulfill({ json: realCatalog })
      assert.equal(route.request().url(), new URL(source.url, catalogUrl).href)
      return route.fulfill({ contentType: 'application/json', body: bytes })
    })
    await realPage.goto(appUrl, { waitUntil: 'load' })
    await realPage.getByRole('button', { name: 'Browse public datasets', exact: true }).click()
    const realDialog = realPage.getByRole('dialog')
    await realDialog.getByLabel('Search public datasets').fill(entry.id)
    await realDialog.getByRole('button', { name: new RegExp(entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    if (entry.sources.length > 1) {
      await realDialog.getByRole('combobox').click()
      await realPage.getByRole('option', { name: new RegExp(source.name || source.id) }).click()
    }
    await realDialog.getByRole('button', { name: 'Download and import' }).click()
    const firstTarget = Object.values(real.assembled.blocks)[0].y_headers[0]
    if (Object.values(real.assembled.blocks)[0].y_headers.length > 1) {
      await realDialog.locator('[data-target-choice]').getByRole('button', { name: firstTarget, exact: true }).click()
    }
    await realPage.getByText(`${rows} samples × ${columns} wavelengths`, { exact: false }).first().waitFor()
    await realPage.screenshot({ path: join(output, 'public-dataset-real-imported.png') })
    console.log(`✓ prepared public ${entry.id}: ${rows} × ${columns}`)
  }
  assert.deepEqual(errors, [], 'no browser execution errors')
  console.log(`Screenshots: ${output}`)
} finally {
  await browser.close()
}
