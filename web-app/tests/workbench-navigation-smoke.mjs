// Dedicated workbench pages retain the live dataset, pipeline and owner run.
// This smoke intentionally checks visibility: hidden, mounted views must not
// satisfy chart, score or navigation assertions.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP_URL = new URL(process.env.SMOKE_URL || 'http://localhost:4345/')
APP_URL.searchParams.set('n4a_e2e', '1')
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || '/tmp'
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text()) })
page.on('pageerror', (error) => errors.push('PAGEERR: ' + error.message))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function assertWorkbench(view) {
  const workbench = page.getByTestId('n4a-workbench-page')
  await workbench.waitFor({ state: 'visible', timeout: 10000 })
  assert(await workbench.getAttribute('data-workbench-view') === view, `expected ${view} page`)
  assert(await page.locator('[data-step]:visible, [data-step-mobile]:visible').count() === 0, 'workflow rail or mobile tabs remain visible')
  assert(await workbench.evaluate((node) => !node.closest('.max-w-6xl')), 'workbench retained the step width limit')
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    assert(await page.locator('header').first().isVisible(), `global header disappeared at ${width}px`)
    assert(await page.locator('footer').first().isVisible(), `footer disappeared at ${width}px`)
    assert(await page.getByRole('link', { name: 'Licences', exact: true }).isVisible(), `footer Licences link disappeared at ${width}px`)
    for (const landmark of ['header', 'footer']) {
      const bounds = await page.locator(landmark).first().boundingBox()
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 1001, `${landmark} is outside the viewport at ${width}px: ${JSON.stringify(bounds)}`)
    }
    const box = await workbench.boundingBox()
    assert(box && box.width >= width - 48 && box.x <= 24, `${view} is not full width at ${width}px: ${JSON.stringify(box)}`)
  }
  return workbench
}

/** Keep the actual object reference inside the page; serialization cannot prove identity. */
async function sessionSnapshot() {
  return page.evaluate(() => {
    const identity = window.__n4aE2E.getSessionIdentity()
    window.__n4aNavigationReferences ??= []
    const reference = window.__n4aNavigationReferences.push(window.__n4aLastRun) - 1
    return { ...identity, reference }
  })
}

async function assertSessionUnchanged(snapshot, label) {
  const current = await page.evaluate((reference) => ({
    ...window.__n4aE2E.getSessionIdentity(),
    sameRunObject: window.__n4aLastRun === window.__n4aNavigationReferences[reference],
  }), snapshot.reference)
  for (const key of ['datasetKey', 'runCalls', 'datasetLoads', 'lastRunId']) {
    assert(current[key] === snapshot[key], `${label} changed ${key}: ${JSON.stringify(snapshot[key])} → ${JSON.stringify(current[key])}`)
  }
  assert(current.sameRunObject, `${label} replaced the live __n4aLastRun object`)
}

async function selectedScore() {
  const visualization = page.getByTestId('n4a-results-visualization')
  await visualization.waitFor({ state: 'visible', timeout: 10000 })
  return {
    run: await visualization.getAttribute('data-selected-run-id'),
    score: await visualization.getAttribute('data-selected-score-id'),
  }
}

async function assertSelected(expected) {
  await page.waitForFunction(({ run, score }) => {
    const panel = document.querySelector('[data-testid="n4a-results-visualization"]')
    return panel && !panel.closest('[hidden]') && panel.getAttribute('data-selected-run-id') === run
      && panel.getAttribute('data-selected-score-id') === score
  }, expected, { timeout: 10000 })
}

try {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  await page.goto(APP_URL.toString(), { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => typeof window.__n4aE2E?.getSessionIdentity === 'function')
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  const exploreBadge = await page.getByText(/\d+ samples × \d+ wavelengths/).first().innerText()
  const datasetView = page.getByTestId('n4a-dataset-view')
  await datasetView.getByLabel('Preprocessing preview', { exact: true }).selectOption('snv')
  await datasetView.getByRole('status').filter({ hasText: /displayed rows;.*individual spectra drawn/ }).waitFor({ state: 'visible', timeout: 30000 })
  const previewModes = datasetView.getByRole('group', { name: 'View mode', exact: true })
  await previewModes.getByRole('button', { name: 'Both', exact: true }).click()
  await datasetView.locator('summary').filter({ hasText: 'Spectra values and range by' }).click()
  const spectraData = datasetView.getByRole('region', { name: 'Spectra display values', exact: true })
  await spectraData.waitFor({ state: 'visible' })
  assert(await spectraData.getByRole('columnheader', { name: 'original mean', exact: true }).isVisible(), 'Both preview lost the original mean')
  await previewModes.getByRole('button', { name: 'Difference', exact: true }).click()
  assert((await spectraData.locator('caption').innerText()).includes('difference'), 'Difference preview table did not update')
  await datasetView.getByRole('tab', { name: 'PCA', exact: true }).click()
  await datasetView.getByText('Methods PCA:', { exact: false }).waitFor({ state: 'visible', timeout: 30000 })
  await datasetView.getByLabel('Fold count', { exact: true }).selectOption('3')
  await datasetView.getByText('Methods PCA:', { exact: false }).waitFor({ state: 'visible', timeout: 30000 })
  await datasetView.locator('summary').filter({ hasText: 'PCA coordinates and fold assignments' }).click()
  const pcaData = datasetView.getByRole('region', { name: 'Owner PCA values', exact: true })
  await pcaData.waitFor({ state: 'visible' })
  assert(await pcaData.locator('tbody tr').count() > 1, 'owner PCA values table is empty')
  const folds = await pcaData.locator('tbody tr').evaluateAll((rows) => [...new Set(rows.map((row) => row.querySelectorAll('td')[2]?.textContent))].sort())
  assert(folds.includes('Fold 1') && folds.includes('Fold 2') && folds.includes('Fold 3') && !folds.includes('Fold 4'), `preview fold count did not reach DAG-ML: ${folds}`)
  const openPlayground = page.getByRole('button', { name: 'Open Playground', exact: true })
  const exploreSession = await sessionSnapshot()
  assert(exploreSession.datasetKey && exploreSession.datasetLoads === 1 && exploreSession.runCalls === 0, 'unexpected initial exploration identity')
  await openPlayground.click()
  await assertSessionUnchanged(exploreSession, 'first Playground entry')
  const playgroundPage = await assertWorkbench('playground')
  assert(await playgroundPage.getByRole('heading', { name: 'Playground', exact: true }).evaluate((node) => node === document.activeElement), 'Playground entry did not move focus')
  const playground = page.locator('[data-owner-playground]')
  await playground.getByText('PCA computed by Methods', { exact: false }).waitFor({ state: 'visible', timeout: 30000 })
  await playground.getByRole('button', { name: 'Add step', exact: true }).first().click()
  const operatorDialog = page.getByRole('dialog', { name: 'Add step', exact: true })
  const search = operatorDialog.getByRole('textbox', { name: /Search operators/ })
  await search.fill('n4m:preprocessing.scatter.snv')
  await search.press('Enter')
  await operatorDialog.waitFor({ state: 'hidden' })
  await playground.locator('.n4pg-card-meta .n4wb-mono').first().waitFor({ state: 'visible', timeout: 30000 })
  const stepName = await playground.locator('.n4pg-card-name').first().innerText()
  await playground.getByRole('button', { name: 'Configure', exact: true }).click()
  const config = page.getByRole('dialog', { name: 'Configure dataset', exact: true })
  await config.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await config.waitFor({ state: 'hidden' })
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'workbench-playground.png'), fullPage: true })
  await page.getByRole('button', { name: 'Back to Explore', exact: true }).click()
  await openPlayground.waitFor({ state: 'visible' })
  await assertSessionUnchanged(exploreSession, 'first Playground Back')
  assert(await openPlayground.evaluate((node) => node === document.activeElement), 'Back did not restore the Playground opener focus')
  assert((await page.getByText(exploreBadge, { exact: true }).first().innerText()) === exploreBadge, 'dataset summary changed after Back')
  assert(await datasetView.getByRole('tab', { name: 'PCA', exact: true }).getAttribute('aria-selected') === 'true', 'Back changed the dataset tab')
  assert(await datasetView.getByLabel('Fold count', { exact: true }).inputValue() === '3', 'Back reset the dataset fold count')
  assert(await pcaData.isVisible(), 'Back collapsed the owner PCA data alternative')
  await datasetView.getByRole('tab', { name: 'Spectra', exact: true }).click()
  assert(await datasetView.getByLabel('Preprocessing preview', { exact: true }).inputValue() === 'snv', 'Back reset the Methods preview operator')
  assert(await previewModes.getByRole('button', { name: 'Difference', exact: true }).getAttribute('aria-pressed') === 'true', 'Back reset the preview display mode')
  await openPlayground.click()
  await assertSessionUnchanged(exploreSession, 'second Playground entry')
  await playground.waitFor({ state: 'visible' })
  assert(await playground.locator('.n4pg-card-name').first().innerText() === stepName, 'Playground preprocessing pipeline reset on return')
  await page.getByRole('button', { name: 'Back to Explore', exact: true }).click()
  await assertSessionUnchanged(exploreSession, 'second Playground Back')

  await page.locator('[data-step="pipeline"]').click()
  const editorBefore = await page.locator('[data-cv-node]').innerText()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.getByTestId('n4a-results-visualization').waitFor({ state: 'visible', timeout: 60000 })
  const firstRun = await page.evaluate(() => window.__n4aLastRun.id)
  // A second existing run lets Inspector → Results verify run identity as well
  // as score kind, without importing or fitting during workbench navigation.
  await page.getByRole('button', { name: 'Run again', exact: true }).click()
  await page.waitForFunction((previous) => window.__n4aLastRun?.id !== previous, firstRun, { timeout: 60000 })
  const latest = await page.evaluate(() => {
    const run = window.__n4aLastRun
    return { id: run.id, cv: run.cv.id, refit: run.refit.id, fold: run.folds[0].id, metric: run.scoreMetric }
  })
  const resultsSession = await sessionSnapshot()
  assert(resultsSession.datasetKey === exploreSession.datasetKey && resultsSession.datasetLoads === exploreSession.datasetLoads, 'running the current dataset reimported it')
  assert(resultsSession.runCalls === exploreSession.runCalls + 2 && resultsSession.lastRunId === latest.id, 'run instrumentation did not record the two explicit runs')
  const list = page.getByTestId('n4a-results-list')
  assert(await list.count() === 1, 'duplicate ResultsList instances')
  await list.locator(`[data-run-id="${latest.id}"][data-score-id="${latest.refit}"]`).click()
  await assertSelected({ run: latest.id, score: latest.refit })
  const openInspector = page.getByRole('button', { name: 'Open Results Inspector', exact: true })
  await openInspector.click()
  await assertSessionUnchanged(resultsSession, 'Inspector entry')
  const inspectorPage = await assertWorkbench('inspector')
  assert(await inspectorPage.getByRole('heading', { name: 'Results Inspector', exact: true }).evaluate((node) => node === document.activeElement), 'Inspector entry did not move focus')
  const inspector = page.locator('[data-owner-inspector]')
  const evaluation = inspector.getByLabel('Evaluation score', { exact: true })
  assert(await evaluation.inputValue() === `${latest.metric}:refit`, 'list → Inspector lost held-out test context')
  assert(await inspector.getByRole('listbox').getByRole('option', { selected: true }).count() === 1, 'Inspector did not select exactly one owner chain')
  await evaluation.selectOption(`${latest.metric}:cv`)
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'workbench-results-inspector.png'), fullPage: true })
  await page.getByRole('button', { name: 'Back to Results', exact: true }).click()
  await assertSessionUnchanged(resultsSession, 'Inspector Back')
  await assertSelected({ run: latest.id, score: latest.cv })
  assert(await openInspector.evaluate((node) => node === document.activeElement), 'Back did not restore the Inspector opener focus')

  // Preserve a specific fold when opening/backing out of a CV Inspector view.
  await list.locator(`[data-run-id="${latest.id}"][data-score-id="${latest.cv}"]`).getByRole('button', { name: /folds/ }).click()
  await list.locator(`[data-run-id="${latest.id}"][data-score-id="${latest.fold}"]`).click()
  await openInspector.click()
  await assertSessionUnchanged(resultsSession, 'Inspector entry')
  assert(await evaluation.inputValue() === `${latest.metric}:cv`, 'fold selection must map to owner CV context')
  await page.getByRole('button', { name: 'Back to Results', exact: true }).click()
  await assertSessionUnchanged(resultsSession, 'Inspector Back')
  await assertSelected({ run: latest.id, score: latest.fold })

  // Select the other run in the shared Inspector; its score returns to the list.
  await openInspector.click()
  await assertSessionUnchanged(resultsSession, 'Inspector entry')
  const chainList = inspector.getByRole('listbox')
  await chainList.getByRole('option', { selected: false }).first().click()
  await page.getByRole('button', { name: 'Back to Results', exact: true }).click()
  await assertSessionUnchanged(resultsSession, 'Inspector Back')
  const other = await selectedScore()
  assert(other.run === firstRun, `Inspector → Results selected wrong run: ${other.run}`)
  assert(await list.locator(`[data-run-id="${other.run}"][data-score-id="${other.score}"]`).getAttribute('aria-pressed') === 'true', 'Inspector selection did not reach the restored list')
  await page.locator('[data-step="pipeline"]').click()
  assert(await page.locator('[data-cv-node]').innerText() === editorBefore, 'main pipeline configuration changed after workbench navigation')
  await page.locator('[data-step="explore"]').click()
  assert(await page.getByText(exploreBadge, { exact: true }).first().isVisible(), 'live dataset was not retained after results navigation')
  // The supported CV path produces genuine owner train-refit predictions.
  // Import only that existing block/report to exercise training-only display;
  // preserve its partition, values and run provenance without relabelling test.
  const trainingRun = await page.evaluate(async () => {
    await window.__n4aE2E.runDatasetPipeline({
      dataset: {
        nSamples: 8, nFeatures: 3, axis: [1000, 1100, 1200], axisUnit: 'nm',
        X: [1, 2, 4, 2, 4, 3, 3, 3, 5, 4, 6, 7, 5, 7, 6, 6, 5, 8, 7, 9, 10, 8, 10, 9],
        y: [2, 3, 4, 6, 7, 8, 10, 11], targetName: 'Fixture target', taskType: 'regression',
        sampleIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        partitions: ['train', 'train', 'train', 'train', 'train', 'train', 'train', 'train'],
      },
      pipeline: { name: 'Training-score navigation fixture', steps: [], cv: { folds: 2, seed: 73 },
        model: { id: 'fixture-pls', type: 'n4m:models.pls.pls_regression', params: { n_components: 1, scale: true } } },
    })
    const owner = window.__n4aLastRun.rtResult
    if (!owner || owner.schema_version !== 1 || !window.__n4aLastRun.cv) throw new Error('missing real owner CV result for training-score import')
    if (owner.manifest.capabilities.scheduler_fallback === true) throw new Error('training-score fixture used a scheduler fallback')
    const predictions = owner.predictions.filter((block) => block.partition === 'train' && (!block.fold_id || block.fold_id === 'final'))
    const reports = owner.reports.filter((report) => predictions.some((block) =>
      report.partition === block.partition && report.fold_id === block.fold_id && report.variant_id === block.variant_id))
    if (predictions.length !== 1 || reports.length !== 1 || reports[0].row_count !== 8
      || predictions[0].sample_indices.length !== 8 || !Array.isArray(predictions[0].y_true) || !Array.isArray(predictions[0].y_pred)) {
      throw new Error('owner did not supply a matching eight-row train-refit block/report')
    }
    // A display projection of a genuine owner result, not a new execution claim.
    const imported = window.__n4aE2E.importRtResult({ ...owner, predictions, reports })
    return { ...imported, metric: predictions[0].metric, refit: predictions[0].fold_id ?? 'score:train',
      rows: predictions[0].sample_indices.map((index, row) => [
        `sample:${index}`, String(predictions[0].y_true[row]), String(predictions[0].y_pred[row]),
      ]) }
  })
  assert(trainingRun.scoreCount === 1, 'training-result import retained CV or unrelated score blocks')
  assert(trainingRun.selectedScoreId === null, 'refit-only training score was selected before opt-in')
  await page.getByTestId('n4a-score-placeholder').waitFor({ state: 'visible', timeout: 10000 })
  assert(await page.getByTestId('n4a-results-visualization').count() === 0, 'training parity rendered before opt-in')
  await list.getByText('Training score hidden', { exact: false }).waitFor({ state: 'visible' })
  const trainingSession = await sessionSnapshot()
  const trainingScore = { metric: trainingRun.metric, refit: trainingRun.refit }
  await openInspector.click()
  await assertSessionUnchanged(trainingSession, 'training Inspector entry')
  await page.getByTestId('n4a-inspector-score-placeholder').waitFor({ state: 'visible' })
  assert(await inspector.locator('svg[aria-label="Predicted versus observed"]:visible').count() === 0, 'Inspector displayed training parity before opt-in')
  await inspector.getByRole('checkbox', { name: /Show training resubstitution scores/ }).check()
  await evaluation.selectOption(`${trainingScore.metric}:refit`)
  await page.getByRole('button', { name: 'Back to Results', exact: true }).click()
  await assertSessionUnchanged(trainingSession, 'training Inspector Back')
  await assertSelected({ run: trainingRun.runId, score: trainingScore.refit })
  const trainingVisualization = page.getByTestId('n4a-results-visualization')
  await trainingVisualization.locator('summary').filter({ hasText: 'Selected owner score:' }).click()
  const displayedTrainingRows = await trainingVisualization.getByRole('region', { name: 'Selected owner predictions', exact: true })
    .locator('tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('th, td')).slice(0, 3).map((cell) => cell.textContent.trim())))
  assert(JSON.stringify(displayedTrainingRows) === JSON.stringify(trainingRun.rows), 'opt-in did not display the exact imported owner training predictions')
  await list.getByRole('checkbox', { name: /Show training resubstitution scores/ }).uncheck()
  await page.getByTestId('n4a-score-placeholder').waitFor({ state: 'visible' })
  assert(await page.getByTestId('n4a-results-visualization').count() === 0, 'training opt-out retained the parity plot')
  await openInspector.click()
  await assertSessionUnchanged(trainingSession, 'Inspector after training opt-out')
  await page.getByTestId('n4a-inspector-score-placeholder').waitFor({ state: 'visible' })
  assert(!(await inspector.getByRole('checkbox', { name: /Show training resubstitution scores/ }).isChecked()), 'Results opt-out left Inspector training consent enabled')
  await page.getByRole('button', { name: 'Back to Results', exact: true }).click()
  await assertSessionUnchanged(trainingSession, 'training opt-out Back')
  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`)
  console.log('✓ full-width Playground/Inspector, focus, Configure, state and bidirectional score/run selection retained')
} catch (error) {
  console.error('✗ ' + (error instanceof Error ? error.message : String(error)))
  for (const message of errors.slice(0, 6)) console.error('   console: ' + message)
  process.exitCode = 1
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'WORKBENCH-NAVIGATION SMOKE FAILED' : 'WORKBENCH-NAVIGATION SMOKE PASSED')
