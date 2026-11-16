// Real browser controls -> immutable edited document -> worker -> native DAG/Methods.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const root = process.env.SMOKE_URL || 'http://127.0.0.1:4345/'
const output = process.env.MULTIMODAL_EDITOR_EVIDENCE_DIR || join(tmpdir(), 'n4a-multimodal-editor')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = [], mutations = [], runs = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', event => { if (event.type() === 'error') errors.push(event.text()) })
page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
const editor = page.locator('.n4mm-pe')
const inspector = editor.getByRole('complementary', { name: 'Inspector', exact: true })
const controls = page.locator('[data-edited-pipeline-run]')
const runButton = page.getByRole('button', { name: 'Run edited pipeline', exact: true })
const pins = JSON.parse(await readFile(new URL('../scripts/public-packages.v1.json', import.meta.url), 'utf8'))

async function download(button, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()])
  const path = join(output, name)
  await file.saveAs(path)
  return JSON.parse(await readFile(path, 'utf8'))
}
const exportPipeline = name => download(editor.getByRole('button', { name: 'Export JSON', exact: true }), `${name}.pipeline.json`)
async function namePipeline(label) {
  const back = inspector.getByRole('button', { name: /Pipeline overview/ })
  if (await back.isVisible()) await back.click()
  await inspector.getByRole('textbox', { name: 'Pipeline name', exact: true }).fill(label)
  await inspector.getByRole('textbox', { name: 'Pipeline name', exact: true }).press('Tab')
}
async function preset(prefix) {
  await editor.locator('.n4mm-pe-preset').filter({ hasText: prefix }).click()
  await runButton.waitFor({ timeout: 30000 })
}
async function capture(name, locator = editor, height = 470) {
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate(element => element.scrollIntoView({ block: 'start' }))
  const rect = await locator.boundingBox()
  await page.screenshot({ path: join(output, name), clip: { x: rect.x, y: rect.y,
    width: rect.width, height: Math.min(rect.height, height) } })
}
async function run(name) {
  const document = await exportPipeline(name)
  assert.equal(document.schema, 'nirs4all.multimodal-pipeline.v1')
  await runButton.click()
  await controls.getByText('Pipeline run complete. Native scores are available below.', { exact: true }).waitFor({ timeout: 600000 })
  const result = await download(page.getByRole('button', { name: 'Download results (JSON)', exact: true }), `${name}.results.json`)
  assert.deepEqual(result.run.refusals, [], JSON.stringify(result.run.refusals))
  assert.equal(result.run.candidates.length, 1)
  assert.equal(result.run.calibrationIds.length, 96)
  assert.equal(result.run.holdoutIds.length, 24)
  const candidate = result.run.candidates[0]
  assert.deepEqual(candidate.recipe.config.pipeline, document.pipeline, 'the worker must execute exactly the exported editor document')
  assert.equal(candidate.label, document.pipeline.label)
  assert.equal(candidate.oof.n, 96)
  assert.equal(candidate.holdout.n, 24)
  assert.equal(result.run.ownerVersions.dag, pins.dagml.version)
  assert.ok(Number.isFinite(candidate.oof.rmse))
  assert.ok(!('portablePackageJson' in candidate), 'training-row consent must survive the new export path')
  const calibration = new Set(result.run.calibrationIds)
  for (const audit of candidate.diagnostics) {
    assert.ok(audit.sampleIds.every(id => calibration.has(id)), 'a native fit included a retained-test identity')
    const outer = result.run.folds.folds.find(fold => fold.fold_id === audit.foldId)
    if (outer) assert.ok(outer.validation_sample_ids.every(id => !audit.sampleIds.includes(id)))
    if (result.dataset.caseId === 'genetics') {
      const groups = new Set(audit.sampleIds.map(id => Math.floor(Number(id.slice(-3)) / 2)))
      for (const id of result.run.calibrationIds) if (groups.has(Math.floor(Number(id.slice(-3)) / 2))) assert.ok(audit.sampleIds.includes(id))
    }
  }
  runs.push({ name, label: candidate.label, oofRmse: candidate.oof.rmse, recipeFingerprint: candidate.recipeFingerprint,
    foldsFingerprint: candidate.foldsFingerprint, datasetFingerprint: result.dataset.fingerprint })
  return result
}
async function caseId(id) {
  await page.locator(`input[name="n4mm-case"][value="${id}"]`).check()
  await editor.waitFor({ timeout: 30000 })
}

try {
  await page.goto(new URL('nirs4all_multimodale/', root).href, { waitUntil: 'load' })
  await editor.waitFor({ timeout: 30000 })
  await preset('Early feature concatenation')
  await namePipeline('Early · Raman + NIRS + MIR · PLS 3')
  await page.getByRole('combobox', { name: 'Selected sample', exact: true }).selectOption({ index: 3 })
  await capture('same-observation.png', page.locator('#n4mm-explore'), 440)
  const before = await run('early-three-sources')
  const original = before.run.configs[0].pipeline
  await editor.locator('.n4mm-pe-node[data-kind="source"]').last().click()
  await inspector.getByRole('button', { name: 'Disconnect source', exact: true }).click()
  await namePipeline('Early · Raman + NIRS · PLS 3')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  await capture('spectral-source-and-node-edit.png')
  const after = await run('early-without-mir')
  assert.equal(after.run.configs[0].pipeline.branches[0].sourceIds.length, 2)
  assert.equal(before.run.foldsFingerprint, after.run.foldsFingerprint)
  assert.notEqual(before.run.candidates[0].recipeFingerprint, after.run.candidates[0].recipeFingerprint)
  assert.notDeepEqual(before.run.candidates[0].oof.rows, after.run.candidates[0].oof.rows)
  await capture('spectral-early-edited.png')
  await page.getByRole('button', { name: 'Restore run 1', exact: true }).click()
  assert.deepEqual((await exportPipeline('restored')).pipeline, original)
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  await inspector.getByRole('spinbutton', { name: 'Components', exact: true }).fill('6')
  await inspector.getByRole('spinbutton', { name: 'Components', exact: true }).press('Tab')
  assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isDisabled())
  assert.equal(await page.locator('.n4mm-run-history tbody tr').count(), 2)
  await namePipeline('Early · all sources · PLS 6')
  const changed = await run('early-components-six')
  assert.equal(changed.run.configs[0].pipeline.branches[0].head.params.n_components, 6)
  assert.deepEqual(changed.run.configs[0].pipeline.branches[0].sourceChains, original.branches[0].sourceChains)
  assert.notDeepEqual(changed.run.candidates[0].oof.rows, before.run.candidates[0].oof.rows)
  await capture('editor-recipe-and-run.png')

  await editor.locator('.n4mm-pe-node[data-kind="source"]').first().click()
  await inspector.getByRole('combobox', { name: 'Add a step at the end', exact: true }).selectOption('preprocessing.scatter.snv')
  await inspector.getByRole('button', { name: /Earlier/ }).click()
  await namePipeline('Early · all sources · Raman SNV first · PLS 6')
  const processed = await run('early-six-snv-first')
  assert.deepEqual(processed.run.configs[0].pipeline.branches[0].sourceChains[0].steps.map(step => step.methodId),
    ['preprocessing.scatter.snv', 'preprocessing.scaling.standard_scale'])
  assert.deepEqual(processed.run.configs[0].pipeline.branches[0].sourceChains.slice(1), original.branches[0].sourceChains.slice(1))

  // Import/export retains the exact editable graph; malformed files preserve its result.
  const current = await exportPipeline('roundtrip')
  const input = editor.locator('input[type="file"]')
  await input.setInputFiles({ name: 'pipeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(current)) })
  assert.deepEqual((await exportPipeline('roundtrip-restored')).pipeline, current.pipeline)
  await run('roundtrip-executed')
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...current, pipeline: { ...current.pipeline, unwanted: 'not silently dropped' } })) })
  await controls.getByRole('alert').waitFor()
  assert.deepEqual((await exportPipeline('after-refused-import')).pipeline, current.pipeline)
  assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isEnabled())
  await input.setInputFiles({ name: 'unknown-envelope.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...current, unexpectedExecutionField: true })) })
  await controls.getByRole('alert').filter({ hasText: 'unsupported top-level fields' }).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Download results (JSON)', exact: true }).isEnabled())
  const adapted = structuredClone(current)
  adapted.sources[0].shape = [999]
  await input.setInputFiles({ name: 'different-source-schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(adapted)) })
  await controls.getByText(/Its source metadata differs from the exported dataset/).waitFor()
  assert.deepEqual((await exportPipeline('adapted-recipe')).pipeline, current.pipeline)

  // Teaching defaults must never masquerade as unset native parameters.
  const unset = structuredClone(current)
  unset.pipeline.branches[0].head.params = {}
  unset.pipeline.branches[0].id = 'quoted"branch'
  await input.setInputFiles({ name: 'unset-parameters.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(unset)) })
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  assert.equal(await inspector.getByRole('spinbutton', { name: 'Components', exact: true }).count(), 0)
  await inspector.getByRole('button', { name: 'Set Components to 3', exact: true }).click()
  assert.deepEqual((await exportPipeline('explicit-components')).pipeline.branches[0].head.params, { n_components: 3 })

  await preset('One-source PLS baseline: Raman')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  await capture('spectral-baseline.png')
  await preset('Transformed source features + nested OOF predictions')
  await editor.locator('.n4mm-pe-node[data-kind="merge"]').click()
  await capture('hybrid-pipeline.png')
  await run('hybrid-current')

  await caseId('genetics')
  await preset('Late fusion: fixed unweighted mean')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').last().click()
  await inspector.getByRole('combobox', { name: /^Model/ }).selectOption('models.regularized.ridge')
  await namePipeline('Late · spectral PLS + marker Ridge')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').last().click()
  await capture('genetics-edited-pipeline.png')
  const genetics = await run('genetics-late-mixed')
  assert.deepEqual(genetics.run.configs[0].pipeline.branches.map(branch => branch.head.methodId),
    ['models.pls.pls_regression', 'models.regularized.ridge'])
  assert.equal(genetics.run.configs[0].pipeline.merge.kind, 'mean')

  await caseId('images')
  await page.getByRole('combobox', { name: 'Selected sample', exact: true }).selectOption({ index: 3 })
  await capture('images-early-vs-mid.png', page.locator('#n4mm-explore'), 440)
  await preset('Jointly trained conv1d/dense/conv2d branches')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  await inspector.getByRole('spinbutton', { name: 'Embedding size', exact: true }).fill('8')
  await inspector.getByRole('spinbutton', { name: 'Embedding size', exact: true }).press('Tab')
  await namePipeline('Mid · NIRS + image · embeddings 8')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().click()
  await capture('images-mid-edited.png')
  const images = await run('images-mid-embedding-eight')
  assert.equal(images.run.configs[0].pipeline.branches[0].head.params.embedding_dim, 8)
  assert.ok(await inspector.getByText(/2-D convolution branch/).isVisible())

  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page-wide horizontal overflow')
  await editor.locator('.n4mm-pe-node[data-kind="model"]').first().focus()
  await page.keyboard.press('Enter')
  await inspector.getByRole('spinbutton', { name: 'Embedding size', exact: true }).waitFor()
  await capture('mobile-editor.png', editor, 700)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await inspector.getByRole('spinbutton', { name: 'Kernel size', exact: true }).fill('31')
  await inspector.getByRole('spinbutton', { name: 'Kernel size', exact: true }).press('Tab')
  await runButton.click()
  await controls.getByRole('alert').waitFor({ timeout: 60000 })
  assert.equal(await controls.getByText('Pipeline run complete. Native scores are available below.', { exact: true }).count(), 0)
  assert.equal(await page.locator('.n4mm-run-history tbody tr').count(), 1, 'refused runs never become completed history entries')
  await caseId('spectroscopy')
  await capture('builder-to-editor.png', page.locator('#n4mm-data'), 440)
  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  await writeFile(join(output, 'report.json'), JSON.stringify({ root, runs, errors, mutations,
    assertions: ['real node parameter edit', 'source disconnect', 'add and reorder source preprocessing', 'history restore', 'exact document export/import',
      'refused import preserves active result', 'independent model branches', 'native mean/hybrid/mid execution',
      'OOF/test/group identities', '390px page containment', 'keyboard model inspector', 'incompatible native run is reported as refused'] }, null, 2))
  console.log('PASS: editable presets, real source/model/parameter edits, native execution, history, JSON roundtrip, groups, mobile and keyboard')
} finally { await browser.close() }
