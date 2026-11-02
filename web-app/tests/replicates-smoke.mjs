// Calibration data guards in the real app: a NIRS cal/val upload (Xcal/Ycal/Mcal +
// Xval/Yval/Mval) whose Sample_ID repeats (replicate scans, and codes reused between
// cal and val) loads with a held-out val partition; rows with a missing (NA) target
// are excluded from fitting and scoring and counted on the run card; declaring
// Sample_ID as the repetition column in the dataset configuration still runs.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const P = 24
const axis = Array.from({ length: P }, (_, j) => 1100 + 20 * j).join(',')
const spectrum = (i) => Array.from({ length: P }, (_, j) => (Math.sin(i * 0.7 + j * 0.3) * 0.2 + (i % 7) * 0.05 + j * 0.01 + 0.5).toFixed(5)).join(',')
const target = (i) => (Math.sin(i * 0.7) * 2 + (i % 7) * 0.5 + 10).toFixed(3)
const MISSING = new Set([5, 47])
function files(part, rows, idOf, year) {
  const csv = (name, lines) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\r\n') + '\r\n') })
  return [
    csv(`X${part}.csv`, [axis, ...rows.map(spectrum)]),
    csv(`Y${part}.csv`, ['Prot', ...rows.map((i) => (MISSING.has(i) ? 'NA' : target(i)))]),
    csv(`M${part}.csv`, ['Year,Sample_ID,Rep', ...rows.map((i, k) => `${year},${idOf(i)},Mesure_${k % 3 + 1}`)]),
  ]
}
const range = (from, to) => Array.from({ length: to - from }, (_, k) => from + k)
// 42 cal rows = 14 samples x 3 scans; 12 val rows reuse the cal codes for other samples
const upload = [
  ...files('val', range(42, 54), (i) => `BGE${Math.floor((i - 42) / 2)}`, 2023),
  ...files('cal', range(0, 42), (i) => `BGE${Math.floor(i / 3)}`, 2022),
]

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (msg) => {
  console.error('✗ ' + msg)
  process.exitCode = 1
}
async function runAndCheck(label) {
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  const missing = ((await page.locator('[data-missing-targets]').first().textContent({ timeout: 5000 })) || '').trim()
  if (missing !== '2 without target excluded') fail(`${label}: expected "2 without target excluded", got "${missing}"`)
  else console.log(`✓ ${label}: run completed — "${missing}"`)
  if (!(await page.locator('text=/Refit · test/').count())) fail(`${label}: the val partition was not scored as test`)
  else console.log(`✓ ${label}: refit scored on the val (test) partition`)
}

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('input[type=file]').first().setInputFiles(upload)
  await page.waitForSelector('text=/samples ×/', { timeout: 40000 })
  const badge = ((await page.locator('text=/samples ×/').first().textContent()) || '').trim()
  if (parseInt(badge, 10) !== 54) fail(`expected 54 samples (42 cal + 12 val), badge says "${badge}"`)
  else console.log(`✓ cal/val upload with repeated Sample_IDs loaded → "${badge}"`)

  await runAndCheck('no repetition')

  await page.locator('[data-step="explore"]').click()
  await page.getByRole('button', { name: /^Configure$/ }).click()
  await page.locator('#config-repetition').click()
  await page.getByRole('option', { name: 'Sample_ID' }).click()
  await page.getByRole('button', { name: /^Apply$/ }).click()
  console.log('✓ repetition column set to Sample_ID')
  await runAndCheck('repetition = Sample_ID')

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'REPLICATES SMOKE FAILED' : 'REPLICATES SMOKE PASSED')
