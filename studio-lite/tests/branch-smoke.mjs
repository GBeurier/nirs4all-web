// Branch smoke (FOLDABLE-TREE editor): build a 2-branch feature union — an SNV
// branch + a Savitzky–Golay (1st-derivative) branch — feeding PLS, run it through
// the served WASM stack, and confirm the union actually executed:
//   - the Branch is added from the foldable DAG palette bucket,
//   - it renders as a container node with 2 indented branch lanes,
//   - the container folds/unfolds (chevron),
//   - CV Scores render (the union executed + scored),
//   - the fitted model carries a 2-lane `branch` in its state (the column-wise
//     concat of the two branch outputs fed the model),
//   - no console errors.
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewportSize({ width: 1366, height: 900 }) // keep the lg palette rail visible
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

function fail(msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
}

const palette = () => page.locator('aside').first()

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  await page.locator('button').filter({ hasText: 'Fruit purée' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  console.log('✓ sample dataset loaded')

  await page.locator('[data-step="pipeline"]').click()
  await page.waitForTimeout(300)

  // the DAG / structure palette bucket is a real foldable accordion (open by
  // default) holding multiple operators — add the Branch operator from it.
  if (!(await palette().locator('[data-palette-dag]').count())) fail('expected a foldable DAG / structure palette bucket')
  else console.log('✓ foldable DAG / structure palette bucket present')
  await palette().getByRole('button', { name: 'Branch', exact: true }).first().click()
  await page.waitForTimeout(250)

  const container = page.locator('[data-container-node]').first()
  if (!(await container.count())) { fail('expected a Branch container node on the canvas') }
  else console.log('✓ Branch container node added (feature union)')

  const lanes = page.locator('[data-branch-lane]')
  const laneCount = await lanes.count()
  if (laneCount < 2) fail(`expected ≥2 branch lanes, got ${laneCount}`)
  else console.log(`✓ ${laneCount} branch lanes present (indented sub-tree)`)

  // FOLD / UNFOLD: the container's chevron collapses the nested branches.
  const fold = page.locator('[data-container-fold]').first()
  await fold.click()
  await page.waitForTimeout(150)
  if ((await page.locator('[data-branch-lane]').count()) === 0) console.log('✓ container folds (branches hidden)')
  else fail('expected branches hidden after folding')
  await fold.click()
  await page.waitForTimeout(150)
  if ((await page.locator('[data-branch-lane]').count()) >= 2) console.log('✓ container unfolds (branches shown)')
  else fail('expected branches shown after unfolding')

  // focus lane 0 and add SNV from the palette
  await lanes.nth(0).click()
  await page.waitForTimeout(120)
  await palette().getByRole('button', { name: 'SNV', exact: true }).first().click()
  await page.waitForTimeout(150)

  // focus lane 1 and add Savitzky–Golay
  await lanes.nth(1).click()
  await page.waitForTimeout(120)
  await palette().getByRole('button', { name: /Savitzky/ }).first().click()
  await page.waitForTimeout(150)

  const built = await page.evaluate(() => {
    const out = []
    for (const lane of document.querySelectorAll('[data-branch-lane]')) {
      const ops = [...lane.querySelectorAll('span')].map((s) => s.textContent || '').filter(Boolean)
      out.push(ops)
    }
    return out
  })
  console.log('  lane contents:', JSON.stringify(built.map((l) => l.filter((t) => /SNV|Savitzky/.test(t)))))

  // run it
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  console.log('✓ pipeline executed (CV Scores rendered)')

  const info = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const st = r.model?.state
    const branch = st?.branch
    return {
      engine: r.engine,
      hasCv: !!r.cv,
      cvN: r.cv?.predictions?.length ?? 0,
      branchLanes: Array.isArray(branch) ? branch.length : 0,
      laneTypes: Array.isArray(branch) ? branch.map((c) => (Array.isArray(c) ? c.map((d) => d.type) : [])) : [],
    }
  })
  if (!info) { fail('no __n4aLastRun captured'); }
  else {
    if (info.branchLanes >= 2) console.log(`✓ fitted model uses a ${info.branchLanes}-lane feature union (engine: ${info.engine})`)
    else fail(`expected a ≥2-lane branch in the fitted model, got ${info.branchLanes}`)
    const flat = info.laneTypes.flat()
    if (flat.includes('StandardNormalVariate') && flat.includes('SavitzkyGolay')) {
      console.log(`✓ branch lanes carry the configured ops: ${JSON.stringify(info.laneTypes)}`)
    } else {
      fail(`branch lanes missing expected ops: ${JSON.stringify(info.laneTypes)}`)
    }
    if (info.hasCv && info.cvN > 0) console.log(`✓ union scored via CV (${info.cvN} OOF rows)`)
    else fail(`expected CV scores from the union run (hasCv=${info.hasCv}, cvN=${info.cvN})`)
  }

  await page.screenshot({ path: '/tmp/branch_smoke.png', fullPage: true })

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail('smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'BRANCH SMOKE FAILED' : 'BRANCH SMOKE PASSED')
