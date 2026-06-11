// The operator palette must surface ALL operator categories — preprocessing,
// train/test split operators, AND models — not just preprocessing. The palette is
// a searchable accordion; section headers prove the families exist, search reveals
// their operators. Regression guard for "I only see preprocessing, no other operators".
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4320/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: /NIR protein/ }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.waitForSelector('text=/Run pipeline/i', { timeout: 15000 })

  // the family headers prove all categories live in the palette
  for (const [label, kind] of [['Preprocessings', 'preprocessing'], ['Train / test split', 'split'], ['Models', 'model']]) {
    if (await page.getByRole('button', { name: new RegExp(label) }).count()) console.log(`✓ palette has the "${label}" family`)
    else fail(`palette is missing the "${label}" family — ${kind} operators not surfaced`)
  }

  // search reveals a SPLIT operator → click adds it to the pipeline
  const search = page.getByPlaceholder(/Search operators/i).first()
  await search.fill('Kennard')
  const ks = page.getByRole('button', { name: /Kennard/ }).first()
  await ks.waitFor({ state: 'visible', timeout: 5000 })
  console.log('✓ search reveals the Kennard-Stone split operator')
  await ks.click()
  await page.waitForTimeout(400)
  if (await page.locator('text=/Kennard/').count()) console.log('✓ clicking a split operator adds it to the pipeline')
  else fail('clicking the split operator did not add it')

  // search reveals a MODEL operator
  await search.fill('Ridge')
  if (await page.getByRole('button', { name: /Ridge/ }).first().isVisible().catch(() => false)) console.log('✓ search reveals model operators (Ridge)')
  else fail('search did not reveal model operators')

  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  else console.log('✓ no JS console errors')
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'PALETTE SMOKE FAILED' : 'PALETTE SMOKE PASSED')
