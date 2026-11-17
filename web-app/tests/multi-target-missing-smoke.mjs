// A dataset with several target columns and missing values, in the real app:
// six files (X/Y/M for train and test), 12 targets — most of them sparse (NA, empty, NaN cells) —
// and two spectra with an empty cell.
// 1. It LOADS: no refusal, every row kept, the 12 targets and the missing values stated.
// 2. Explore shows a target of the user's choice; the Playground opens and projects the complete spectra.
// 3. The target to model and the missing-value option are chosen in the run settings:
//    "Stop if a value is missing" stops before running; "Leave out incomplete samples" runs.
// 4. The run models the chosen target: rows without it are excluded and counted by the engine, the
//    two incomplete spectra are left out, the scores cover exactly the remaining rows, and the
//    loaded dataset is unchanged.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const P = 24
const N_TRAIN = 48
const N_TEST = 16
const TARGETS = ['dry_matter', 'moisture', 'sugars', ...Array.from({ length: 9 }, (_, k) => `trait_${String(k + 4).padStart(2, '0')}`)]
const TARGET = 'moisture'
const axis = Array.from({ length: P }, (_, j) => 1100 + 20 * j).join(';')
const HOLES = new Set([4, 50]) // one train and one test spectrum with an empty cell
const spectrum = (i) => Array.from({ length: P }, (_, j) => (HOLES.has(i) && j === 3 ? '' : (Math.sin(i * 0.7 + j * 0.3) * 0.2 + (i % 7) * 0.05 + j * 0.01 + 0.5).toFixed(5))).join(';')
const missing = (i, t) => (t === 0 ? false : t === 1 ? i % 5 === 1 : t === 2 ? i % 2 === 0 : (i + t) % 3 !== 0)
const NA = ['NA', '', 'NaN']
const value = (i, t) => (missing(i, t) ? NA[(i + t) % NA.length] : (Math.sin(i * 0.7 + t) * 2 + (i % 7) * 0.5 + 10 + t).toFixed(3))
const csv = (name, lines) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n') + '\n') })
const range = (from, to) => Array.from({ length: to - from }, (_, k) => from + k)
const files = (part, rows) => [
  csv(`X_${part}.csv`, [axis, ...rows.map(spectrum)]),
  csv(`Y_${part}.csv`, [TARGETS.join(';'), ...rows.map((i) => TARGETS.map((_, t) => value(i, t)).join(';'))]),
  csv(`M_${part}.csv`, ['sample_id;site', ...rows.map((i) => `S${String(i).padStart(3, '0')};${i % 4 === 2 ? '' : `site_${i % 3}`}`)]),
]
const train = range(0, N_TRAIN)
const test = range(N_TRAIN, N_TRAIN + N_TEST)
const upload = [...files('train', train), ...files('test', test)]
const t = TARGETS.indexOf(TARGET)
const used = (rows) => rows.filter((i) => !HOLES.has(i) && !missing(i, t)).length
const expected = {
  samples: N_TRAIN + N_TEST,
  train: used(train),
  test: used(test),
  missingTargets: [...train, ...test].filter((i) => !HOLES.has(i) && missing(i, t)).length,
  excludedSamples: HOLES.size,
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (msg) => {
  console.error('✗ ' + msg)
  process.exitCode = 1
}
const check = (ok, pass, problem) => (ok ? console.log('✓ ' + pass) : fail(problem))
const text = async (selector) => ((await page.locator(selector).first().textContent({ timeout: 10000 })) || '').replace(/\s+/g, ' ').trim()

try {
  // 1. load: no refusal, every row, every target
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(upload)
  await page.waitForSelector('text=/samples ×/', { timeout: 40000 })
  const badge = await text('text=/samples ×/')
  check(parseInt(badge, 10) === expected.samples, `the six files loaded with every row → "${badge}"`, `expected ${expected.samples} samples, badge says "${badge}"`)
  const options = await page.locator('[data-view-target] select option').allTextContents()
  check(options.length === TARGETS.length && options[0].startsWith(`${TARGETS[0]} — ${expected.samples} of ${expected.samples} values`),
    `Explore offers the ${options.length} targets with their value counts (default: ${TARGETS[0]})`, `expected ${TARGETS.length} targets in the Explore selector, got ${options.length}: ${options.slice(0, 3).join(' | ')}`)
  const stated = await text('[data-dataset-missing]')
  check(stated.includes(`${TARGETS.length} targets`) && /2 spectral values are missing \(2 samples, 1 wavelength\)/.test(stated) && /No row is dropped/.test(stated),
    'the dataset states its targets and missing spectral values, and that no row is dropped', `unexpected dataset statement: "${stated}"`)

  // 2. Explore on a chosen target, then the Playground
  await page.locator('[data-view-target] select').selectOption(TARGETS[3])
  await page.getByRole('tab', { name: /Target/ }).click()
  await page.waitForSelector(`text=/Distribution of “${TARGETS[3]}”/`, { timeout: 10000 })
  console.log(`✓ Explore shows the distribution of the chosen target ${TARGETS[3]} (missing values omitted)`)
  await page.getByRole('tab', { name: /Summary/ }).click()
  const listed = await page.locator('[data-targets-table] tbody tr').count()
  check(listed === TARGETS.length, `the summary lists the ${listed} targets with their missing counts`, `expected ${TARGETS.length} rows in the targets table, got ${listed}`)

  await page.getByRole('button', { name: 'Open Playground', exact: true }).click()
  const playground = page.locator('[data-owner-playground]')
  await playground.waitFor({ state: 'visible' })
  await playground.getByText('PCA computed by Methods', { exact: false }).waitFor({ timeout: 30000 })
  await playground.getByText(`2 of ${expected.samples} rows have missing spectral values and are left out of this preview`, { exact: false }).waitFor({ timeout: 10000 })
  check(await playground.locator('canvas:visible').count() >= 1, 'the Playground opened: spectra and Methods PCA on the complete rows, the 2 incomplete rows flagged', 'the Playground drew no canvas')
  const playgroundTargets = await playground.getByText(TARGETS[5], { exact: true }).count()
  check(playgroundTargets >= 1, 'the Playground offers the other targets in its own colour/target controls', `the Playground does not list target ${TARGETS[5]}`)
  await page.getByRole('button', { name: 'Back to Explore' }).click()

  // 3. launch choices
  await page.locator('[data-step="pipeline"]').click()
  await page.locator('#run-target').selectOption(TARGET)
  await page.locator('#run-missing-values').selectOption('refuse')
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/This run is set to stop on missing values/', { timeout: 10000 })
  check((await page.evaluate(() => window.__n4aLastRun)) === undefined, '"Stop if a value is missing" stopped before anything ran, and said why', 'a run happened although the option was to stop')

  await page.locator('#run-missing-values').selectOption('exclude_samples')
  const announced = await text('[data-run-selection]')
  check(announced.includes(`${expected.train} train samples and ${expected.test} test samples with a value for “${TARGET}”`)
    && announced.includes(`${expected.missingTargets} samples without a value left out of fitting and scoring`)
    && announced.includes(`${expected.excludedSamples} samples with missing spectral values left out`),
  `the run settings announce what the run uses → "${announced}"`, `unexpected run announcement: "${announced}"`)

  // 4. the run
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 120000 })
  const run = await page.evaluate(() => {
    const r = window.__n4aLastRun
    return {
      target: r.targetName, missingTargets: r.missingTargets ?? 0, selection: r.dataSelection,
      cv: r.cv?.predictions.length ?? 0, refit: r.refit.predictions.length, rmse: r.cv?.metrics.rmse, testRmse: r.refit.metrics.rmse,
      actuals: [...(r.cv?.predictions ?? []), ...r.refit.predictions].every((p) => Number.isFinite(p.actual) && Number.isFinite(p.predicted)),
    }
  })
  check(run.target === TARGET, `the run modelled the chosen target "${run.target}"`, `the run modelled "${run.target}", not "${TARGET}"`)
  check(run.missingTargets === expected.missingTargets && run.selection?.excludedSamples === expected.excludedSamples && run.selection?.missingValues === 'exclude_samples',
    `${run.missingTargets} rows without the target excluded by the engine, ${run.selection?.excludedSamples} incomplete spectra left out`, `expected ${expected.missingTargets} missing targets / ${expected.excludedSamples} left out, got ${JSON.stringify(run)}`)
  check(run.cv === expected.train && run.refit === expected.test && run.actuals && Number.isFinite(run.rmse) && Number.isFinite(run.testRmse),
    `scores cover exactly the remaining rows: CV ${run.cv} train, test ${run.refit} (RMSECV ${run.rmse?.toFixed(3)}, test RMSE ${run.testRmse?.toFixed(3)})`, `expected CV ${expected.train} / test ${expected.test} finite predictions, got ${JSON.stringify(run)}`)
  const shown = `${await text('[data-run-target]')} | ${await text('[data-missing-targets]')} | ${await text('[data-excluded-samples]')}`
  check(shown === `target: ${TARGET} | ${expected.missingTargets} without target excluded | ${expected.excludedSamples} with missing spectral values left out`, `the result states it → "${shown}"`, `unexpected result badges: "${shown}"`)

  // the loaded dataset is unchanged: still every row and every target
  await page.locator('[data-step="explore"]').click()
  const after = await page.locator('[data-view-target] select option').count()
  const badgeAfter = await text('text=/samples ×/')
  check(after === TARGETS.length && parseInt(badgeAfter, 10) === expected.samples, 'after the run the dataset still holds every row and every target', `dataset changed after the run: ${after} targets, "${badgeAfter}"`)

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  if (process.env.SMOKE_SHOT) await page.screenshot({ path: process.env.SMOKE_SHOT, fullPage: true }).catch(() => {})
  await browser.close()
}
console.log(process.exitCode ? 'MULTI-TARGET MISSING SMOKE FAILED' : 'MULTI-TARGET MISSING SMOKE PASSED')
