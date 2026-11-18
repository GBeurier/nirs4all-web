// Real four-stage import UI -> IO/Formats -> explicit creation. No test-only app hooks.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4356/'
const output = process.env.MULTIMODAL_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-builder-smoke')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const errors = [], writes = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()) })
const cases = { spectroscopy: 'spectroscopy-complementary', genetics: 'genetics-replicates', images: 'images-spatial' }
const reports = []
const builder = page.locator('.dsb-mm')
const step = async name => { await builder.locator('.dsb-stepper__button').filter({ hasText: name }).click() }
const ready = async () => { await builder.locator('.dsb-mm-busy').waitFor({ state: 'hidden', timeout: 60000 }) }
const expectEnabled = async button => {
  await button.waitFor()
  try {
    await page.waitForFunction(element => !element.disabled, await button.elementHandle(), { timeout: 15000 })
  } catch (error) {
    await builder.screenshot({ path: join(output, 'failure.png') })
    await writeFile(join(output, 'failure.txt'), await builder.innerText())
    throw error
  }
}
const createButton = () => builder.getByRole('button', { name: 'Create dataset', exact: true })
async function ownerValidate() {
  const validate = builder.getByRole('button', { name: /^Validate (alignment|again)$/ })
  await expectEnabled(validate); await validate.click(); await ready()
}
async function inputFiles(caseId, { manifest = true, renameVcf = false, missingSource = false } = {}) {
  const preset = cases[caseId]
  const base = new URL(`../public/multimodal-data/${preset}/`, import.meta.url)
  const inventory = JSON.parse(await readFile(new URL('files.json', base), 'utf8'))
  const config = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'))
  const files = []
  for (const name of [...inventory.files].reverse()) {
    if (!manifest && name === 'manifest.json') continue
    if (!manifest && ![config.metadata.file, ...config.sources.map(source => source.file)].includes(name) && !name.endsWith('.png')) continue
    if (missingSource && name === 'raman.csv') continue
    files.push({ name: renameVcf && name === 'markers.vcf' ? 'nirs.vcf' : name,
      mimeType: 'application/octet-stream', buffer: await readFile(new URL(name, base)) })
  }

  return { files, config }
}
async function openCase(caseId) {
  await page.locator(`input[name="n4mm-case"][value="${caseId}"]`).check()
  await page.locator('[data-fusion-lab]').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Import your files', exact: true }).click()
  await builder.waitFor()
}
async function pick(files) {
  await step('Source')
  await builder.locator('input[type="file"]').setInputFiles(files)
  await ready()
  assert.equal(await builder.getByRole('alert').count(), 0, await builder.innerText())
}
async function selectMetadata(manifest) {
  await step('Role')
  await builder.locator('.dsb-mm-card').filter({ has: page.getByRole('heading', { name: manifest.metadata.file, exact: true }) })
    .locator('input[type="radio"][value="metadata"]').check()
  await step('Columns')
  const metaLabel = manifest.metadata.file.replace(/\.[^.]+$/, '')
  await builder.locator('.dsb-mm-tabs button').filter({ hasText: metaLabel }).click()
  await builder.getByLabel(/^Sample ID column/).selectOption(manifest.metadata.sampleId)
  await builder.getByLabel(/^Target column/).selectOption(manifest.metadata.target)
  await builder.getByLabel(/^Target unit/).fill(manifest.metadata.targetUnit)
  if (manifest.metadata.group) await builder.getByLabel(/^Group column/).selectOption(manifest.metadata.group)
  if (manifest.metadata.partition) await builder.getByLabel(/^Partition column/).selectOption(manifest.metadata.partition)
  for (const source of manifest.sources.filter(source => source.profile === 'numeric_csv' && source.axis)) {
    const label = source.file
    await builder.locator('.dsb-mm-tabs button').filter({ hasText: label }).click()
    await builder.getByRole('radio', { name: /^Numeric column names/ }).check()
    await builder.getByLabel(/^Axis kind/).fill(source.axis.kind)
    await builder.getByLabel(/^Axis unit/).fill(source.axis.unit)
  }
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'networkidle' })
  const theme = await page.locator('.n4mm').evaluate(element => ({
    primary: getComputedStyle(element).getPropertyValue('--n4mm-master').trim(),
    paper: getComputedStyle(element).getPropertyValue('--paper').trim(),
    background: getComputedStyle(element).backgroundImage,
  }))
  assert.equal(theme.primary.toLowerCase(), '#0d9488')
  assert.equal(theme.paper.toLowerCase(), '#faf7f0')
  assert.notEqual(theme.background, 'none')
  await page.screenshot({ path: join(output, 'canonical-laboratory.png') })

  // All three optional manifests remain fully editable, and input order cannot alter identity.
  for (const caseId of Object.keys(cases)) {
    console.log(`Optional-manifest wizard: ${caseId}`)
    await openCase(caseId)
    const { files } = await inputFiles(caseId)
    await pick(files)
    await builder.getByRole('button', { name: 'Continue to Role', exact: true }).click()
    await builder.screenshot({ path: join(output, `${caseId}-role.png`) })
    await builder.getByRole('button', { name: 'Continue to Columns', exact: true }).click()
    await builder.screenshot({ path: join(output, `${caseId}-columns.png`) })
    if (caseId === 'spectroscopy') {
      await builder.evaluate(element => element.scrollIntoView({ block: 'start' }))
      const bounds = await builder.boundingBox()
      await page.screenshot({ path: join(output, 'builder-to-editor.png'), clip: {
        x: bounds.x, y: bounds.y, width: bounds.width, height: Math.min(bounds.height, 440),
      } })
    }
    await builder.getByRole('button', { name: 'Continue to Validation', exact: true }).click()
    assert.equal(await createButton().isDisabled(), true)
    await ownerValidate(); await expectEnabled(createButton())
    await builder.screenshot({ path: join(output, `${caseId}-validated.png`) })
    const fingerprint = (await builder.locator('.dsb-mm-owner').innerText()).match(/[a-f0-9]{64}/)?.[0]
    assert.ok(fingerprint, 'owner fingerprint must be visible')
    // Editing the exact draft makes a previously valid owner response unusable.
    const name = builder.getByLabel('Dataset name', { exact: true })
    const oldName = await name.inputValue()
    await name.fill(`${oldName}-edited`)
    assert.equal(await createButton().isDisabled(), true)
    await name.fill(oldName)
    assert.equal(await createButton().isDisabled(), true, 'restoring a value must not restore an old validation')
    await ownerValidate(); await expectEnabled(createButton()); await createButton().click()
    await page.locator('.n4mm-alignment').getByText(fingerprint, { exact: true }).waitFor()
    await page.getByText(new RegExp(`^Imported ${files.length} files:`)).waitFor()
    reports.push({ caseId, mode: 'optional-manifest', files: files.length, fingerprint })
  }

  // Actual mapping from raw files without a hand-written manifest in all three cases.
  for (const caseId of Object.keys(cases)) {
    console.log(`Manual wizard: ${caseId}`)
    // Reload to start with a genuinely blank wizard rather than a previous manifest draft.
    await page.reload({ waitUntil: 'networkidle' }); await openCase(caseId)
    const { files, config } = await inputFiles(caseId, { manifest: false, renameVcf: caseId === 'genetics' })
    await pick(files); await selectMetadata(config)
    // Same basename across CSV and VCF used to produce duplicate source IDs.
    await step('Validation'); await ownerValidate(); await expectEnabled(createButton())
    await createButton().click()
    await page.getByText(new RegExp(`^Imported ${files.length} files:`)).waitFor()
    reports.push({ caseId, mode: 'manual-no-manifest', files: files.length })
  }

  // Activate an unreferenced dosage CSV through real role/column edits instead of the VCF.
  await page.reload({ waitUntil: 'networkidle' }); await openCase('genetics')
  const geneticCsv = await inputFiles('genetics')
  await pick(geneticCsv.files); await step('Role')
  const csvCard = builder.locator('.dsb-mm-card').filter({ has: page.getByRole('heading', { name: 'markers.csv', exact: true }) })
  const csvRole = csvCard.locator('input[type="radio"][value="source"]')
  await csvRole.click(); await ready()
  assert.equal(await csvRole.isChecked(), true, 'owner inspection must complete the requested role change')
  await csvCard.getByLabel(/^Modality/).selectOption('genetics')
  await builder.locator('.dsb-mm-card').filter({ has: page.getByRole('heading', { name: 'markers.vcf', exact: true }) })
    .locator('input[type="radio"][value="ignored"]').check()
  await step('Columns')
  await builder.locator('.dsb-mm-tabs button').filter({ hasText: 'markers.csv' }).click()
  await builder.getByLabel(/^Sample ID column/).selectOption('sample_id')
  await builder.getByRole('button', { name: /^Select numeric/ }).click()
  await step('Validation'); await ownerValidate(); await expectEnabled(createButton()); await createButton().click()
  reports.push({ caseId: 'genetics', mode: 'activate-genetic-csv-and-edit-columns', files: geneticCsv.files.length })

  // Declared numeric CSV profiles take precedence over misleading filename suffixes.
  await page.reload({ waitUntil: 'networkidle' }); await openCase('spectroscopy')
  const disguised = await inputFiles('spectroscopy')
  const rename = name => name === 'nirs.csv' ? 'nirs.vcf' : name === 'metadata.csv' ? 'metadata.png' : name
  disguised.config.metadata.file = rename(disguised.config.metadata.file)
  disguised.config.sources.forEach(source => { source.file = rename(source.file) })
  const renamed = disguised.files.map(file => ({ ...file, name: rename(file.name),
    buffer: file.name === 'manifest.json' ? Buffer.from(JSON.stringify(disguised.config)) : file.buffer }))
  await pick(renamed); await step('Validation'); await ownerValidate(); await expectEnabled(createButton())
  await createButton().click()
  reports.push({ caseId: 'spectroscopy', mode: 'declared-profile-before-suffix', files: renamed.length })

  // The imported declaration really trains, and a refused replacement preserves that valid run.
  await page.getByRole('button', { name: /^Run all \d+ presets/ }).click()
  await page.waitForFunction(() => /11 runs added to the comparison/.test(document.querySelector('.n4fl-status')?.textContent ?? ''), null, { timeout: 900000 })
  const [nativeDownload] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download results (JSON)', exact: true }).click()])
  const nativePath = join(output, 'imported-native-results.json')
  await nativeDownload.saveAs(nativePath)
  const nativeRuns = JSON.parse(await readFile(nativePath, 'utf8')).runs
  assert.equal(nativeRuns.length, 11)
  for (const { protocol } of nativeRuns) {
    assert.equal(protocol.calibrationIds.length, 96)
    assert.equal(protocol.holdoutIds.length, 24)
  }
  const retainedResults = await page.locator('#n4mm-results').innerText()
  const incomplete = await inputFiles('spectroscopy')
  const missingCell = incomplete.files.map(file => file.name === 'raman.csv'
    ? { ...file, buffer: Buffer.from(file.buffer.toString('utf8').replace(/(\nsample-\d+,)[^,\r\n]+/, '$1NA')) } : file)
  assert.notDeepEqual(missingCell.find(file => file.name === 'raman.csv').buffer,
    incomplete.files.find(file => file.name === 'raman.csv').buffer)
  await pick(missingCell); await step('Validation'); await ownerValidate()
  await builder.getByRole('alert').filter({ hasText: 'complete-data training profile refuses missing cells' }).waitFor()
  assert.equal(await createButton().isDisabled(), true)
  const missingRow = builder.locator('.dsb-mm-counts tbody tr').filter({ hasText: 'Raman' })
  assert.equal((await missingRow.locator('td').allTextContents()).at(-1), '1')
  assert.equal(await page.locator('#n4mm-results').innerText(), retainedResults)
  await builder.screenshot({ path: join(output, 'missing-cells-refused.png') })

  // A missing declared file must remain visible and block creation until it is added.
  await page.reload({ waitUntil: 'networkidle' }); await openCase('spectroscopy')
  const missing = await inputFiles('spectroscopy', { missingSource: true })
  await pick(missing.files); await step('Validation')
  assert.match(await builder.innerText(), /raman\.csv/)
  assert.equal(await createButton().isDisabled(), true)
  assert.equal(await builder.getByRole('button', { name: 'Validate alignment', exact: true }).isDisabled(), true)

  // Narrow layout: contained table scrolling, reachable labels and focused controls.
  await page.setViewportSize({ width: 390, height: 844 })
  await builder.locator('.dsb-mm__topbar').scrollIntoViewIfNeeded()
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
  assert.ok(dimensions.content <= dimensions.width + 1, JSON.stringify(dimensions))
  assert.equal(await builder.getByRole('button', { name: /^[1-4]\. (Source|Role|Columns|Validation)$/ }).count(), 4)
  const stepper = await builder.locator('.dsb-stepper').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }))
  assert.ok(stepper.content <= stepper.width + 1, JSON.stringify(stepper))
  await builder.getByLabel('Dataset name', { exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.ok(await builder.evaluate(element => element.contains(document.activeElement)))
  await page.screenshot({ path: join(output, 'builder-mobile.png') })
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  await writeFile(join(output, 'report.json'), JSON.stringify({ theme, imports: reports, errors, writes }, null, 2))
  console.log('MULTIMODAL BUILDER PASSED: canonical theme, eight actual imports, roles/columns including genetic CSV, exact owner validation, stale refusal, declared profiles, imported native run, missingness counts, preserved results, missing declaration, responsive keyboard')
} catch (error) {
  console.error('Browser errors:', JSON.stringify(errors))
  await page.screenshot({ path: join(output, 'page-failure.png'), fullPage: true })
  await writeFile(join(output, 'page-failure.txt'), await page.locator('body').innerText())
  throw error
} finally { await browser.close() }
