// Calibration data guards in the real app.
// io keeps these rows positional (Sample_ID lives only in the metadata files), so Sample_ID is a
// physical identity only once the user declares it as the repetition column.
// 1. The ORIGINAL cal/val upload (Xcal/Ycal/Mcal + Xval/Yval/Mval) whose Sample_ID repeats
//    (replicate scans with per-scan targets, and codes reused between cal and val) still
//    loads; with Sample_ID declared, a run is refused before fit: one physical sample cannot
//    be both trained on and held out, and nothing is detached with a partition prefix.
// 2. A separate consistent upload (one reference per physical sample, distinct val codes):
//    undeclared, it runs the explicit positional row profile (host-row scores over scans, no
//    physical-sample count); declared, it runs at the physical-sample level (13 cal / 5 val
//    samples scored by DAG-ML, none split across CV folds). Rows with a missing (NA) target
//    are excluded and counted, and val is scored as test, in both runs.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const P = 24
const axis = Array.from({ length: P }, (_, j) => 1100 + 20 * j).join(',')
const spectrum = (i) => Array.from({ length: P }, (_, j) => (Math.sin(i * 0.7 + j * 0.3) * 0.2 + (i % 7) * 0.05 + j * 0.01 + 0.5).toFixed(5)).join(',')
const target = (i) => (Math.sin(i * 0.7) * 2 + (i % 7) * 0.5 + 10).toFixed(3)
const MISSING = new Set([5, 47])
const csv = (name, lines) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\r\n') + '\r\n') })
function files(part, rows, idOf, year) {
  return [
    csv(`X${part}.csv`, [axis, ...rows.map(spectrum)]),
    csv(`Y${part}.csv`, ['Prot', ...rows.map((i) => (MISSING.has(i) ? 'NA' : target(i)))]),
    csv(`M${part}.csv`, ['Year,Sample_ID,Rep', ...rows.map((i, k) => `${year},${idOf(i)},Mesure_${k % 3 + 1}`)]),
  ]
}
const range = (from, to) => Array.from({ length: to - from }, (_, k) => from + k)
// ORIGINAL: 42 cal rows = 14 samples x 3 scans; 12 val rows reuse the cal codes for other samples
const original = [
  ...files('val', range(42, 54), (i) => `BGE${Math.floor((i - 42) / 2)}`, 2023),
  ...files('cal', range(0, 42), (i) => `BGE${Math.floor(i / 3)}`, 2022),
]
// CONSISTENT: same spectra; one reference per physical sample (a whole sample may be NA)
const NA_SAMPLES = new Set(['CAL1', 'VAL3'])
function consistentFiles(part, rows, idOf, year) {
  return [
    csv(`X${part}.csv`, [axis, ...rows.map(spectrum)]),
    csv(`Y${part}.csv`, ['Prot', ...rows.map((i) => (NA_SAMPLES.has(idOf(i)) ? 'NA' : target(Number(idOf(i).slice(3)) + (part === 'val' ? 100 : 0))))]),
    csv(`M${part}.csv`, ['Year,Sample_ID,Rep', ...rows.map((i, k) => `${year},${idOf(i)},Mesure_${k % 3 + 1}`)]),
  ]
}
const calId = (i) => `CAL${Math.floor(i / 3)}`
const valId = (i) => `VAL${Math.floor((i - 42) / 2)}`
const consistent = [...consistentFiles('val', range(42, 54), valId, 2023), ...consistentFiles('cal', range(0, 42), calId, 2022)]
const missingRows = [...range(0, 42).filter((i) => NA_SAMPLES.has(calId(i))), ...range(42, 54).filter((i) => NA_SAMPLES.has(valId(i)))].length

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  // the expected identity refusal of the original upload is not an unexpected error
  if (m.type() === 'error' && !/Failed to load resource|held-out Test partition/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (msg) => {
  console.error('✗ ' + msg)
  process.exitCode = 1
}
async function upload(label, data) {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(data)
  await page.waitForSelector('text=/samples ×/', { timeout: 40000 })
  const badge = ((await page.locator('text=/samples ×/').first().textContent()) || '').trim()
  if (parseInt(badge, 10) !== 54) fail(`${label}: expected 54 scans (42 cal + 12 val), badge says "${badge}"`)
  else console.log(`✓ ${label}: cal/val upload with repeated Sample_IDs loaded → "${badge}"`)
}
async function declareRepetition() {
  await page.locator('[data-step="explore"]').click()
  await page.getByRole('button', { name: /^Configure$/ }).click()
  await page.locator('#config-repetition').click()
  await page.getByRole('option', { name: 'Sample_ID' }).click()
  await page.getByRole('button', { name: /^Apply$/ }).click()
  console.log('✓ repetition column set to Sample_ID')
}
// `declared`: Sample_ID declared as the physical-sample (repetition) column. Without it, io keeps
// these rows positional (Sample_ID lives only in the metadata file), so Web runs the explicit
// independent-row profile and must say so rather than claim physical samples.
async function runAndCheck(label, declared) {
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  const missing = ((await page.locator('[data-missing-targets]').first().textContent({ timeout: 5000 })) || '').trim()
  if (missing !== `${missingRows} without target excluded`) fail(`${label}: expected "${missingRows} without target excluded", got "${missing}"`)
  else console.log(`✓ ${label}: run completed — "${missing}"`)
  if (!(await page.locator('text=/Refit · test/').count())) fail(`${label}: the val partition was not scored as test`)
  else console.log(`✓ ${label}: refit scored on the val (test) partition`)
  const check = await page.evaluate(() => {
    const run = window.__n4aLastRun
    const seen = new Map()
    for (const [k, fold] of run.folds.entries()) {
      for (const p of fold.predictions) seen.set(p.sampleId, (seen.get(p.sampleId) ?? new Set()).add(k))
    }
    return {
      samples: [...seen.keys()], split: [...seen].filter(([, folds]) => folds.size > 1).map(([id]) => id),
      cv: run.cv?.scoreContext ?? null, refit: run.refit?.scoreContext ?? null,
    }
  })
  if (!declared) {
    const row = (c) => c?.physicalKey === 'row' && c?.unit === 'observation' && c?.aggregation === 'host-rows' && c?.nPhysicalSamples === null
    if (!row(check.cv) || !row(check.refit)) fail(`${label}: expected the explicit row profile (physicalKey row, unit observation, host-rows, no physical count), got ${JSON.stringify(check.cv)}`)
    else console.log(`✓ ${label}: explicit positional row profile — host-row scores over scans, no physical-sample count claimed`)
    return
  }
  // a declared Sample_ID is one physical sample: no sample may appear in two CV folds
  if (check.split.length) fail(`${label}: samples split across CV folds: ${check.split.join(', ')}`)
  else if (check.samples.length !== 13 || check.samples.some((id) => !/^CAL\d+$/.test(id))) fail(`${label}: expected the 13 labelled cal Sample_IDs in the CV folds, got ${check.samples.length}: ${check.samples.slice(0, 5).join(', ')}`)
  else console.log(`✓ ${label}: 13 physical cal samples (Sample_ID), none split across CV folds`)
  const physical = (c, n) => c?.physicalKey === 'repetition' && c?.unit === 'sample' && c?.aggregation === 'dag:sample:mean' && c?.nPhysicalSamples === n
  if (!physical(check.cv, 13) || !physical(check.refit, 5)) fail(`${label}: CV/refit are not DAG-ML physical-sample scores over 13 cal / 5 val samples (${JSON.stringify(check.cv)} / ${JSON.stringify(check.refit)})`)
  else console.log(`✓ ${label}: CV (13) and held-out val (5) scored by DAG-ML per physical sample`)
}

try {
  await upload('original', original)
  // the shared cal/val Sample_ID is a physical identity only once declared; then it is refused before fit
  await declareRepetition()
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  try {
    await page.waitForSelector('text=/held-out Test partition/', { timeout: 60000 })
    console.log('✓ original: a declared Sample_ID shared by cal and val is refused before fit (no partition-prefix detachment)')
  } catch {
    fail('original: the declared shared cal/val Sample_ID was not refused')
  }

  await upload('consistent', consistent)
  await runAndCheck('no repetition', false)

  await declareRepetition()
  await runAndCheck('repetition = Sample_ID', true)

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'REPLICATES SMOKE FAILED' : 'REPLICATES SMOKE PASSED')
