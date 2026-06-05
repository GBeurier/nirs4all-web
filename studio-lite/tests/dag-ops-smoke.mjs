// DAG operators smoke (foldable tree + generators): exercises the full DAG bucket
// against the served WASM stack.
//   1. The DAG / structure palette bucket is a foldable accordion with MULTIPLE
//      operators (Branch, Concat-transform, Merge, Generator OR/Cartesian).
//   2. Add a Branch container (2 lanes: SNV | Savitzky–Golay) — a foldable tree
//      node that folds/unfolds; run → CV scores + a 2-lane feature union.
//   3. Add an OR generator over 2 preprocessing alternatives (Detrend | MSC) — run
//      → dag-ml expands ≥2 variants + selects a best (reuses the variant machinery).
//   4. The emitted DSL compiles in dag-ml (the run goes through dag-ml's compiler).
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/home/delete/.cache/ms-playwright/chromium-1200/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewportSize({ width: 1366, height: 900 })
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

  // --- 1) the DAG bucket is a foldable accordion with MULTIPLE operators -------
  const dagBucket = palette().locator('[data-palette-dag]')
  if (!(await dagBucket.count())) fail('expected a foldable DAG / structure palette bucket')
  // it should hold Branch, Concat-transform, Merge, Generator: OR, Generator: Cartesian
  for (const name of ['Branch', 'Concat-transform', 'Merge', 'Generator: OR', 'Generator: Cartesian']) {
    if (await palette().getByRole('button', { name, exact: true }).count()) console.log(`✓ DAG bucket has "${name}"`)
    else fail(`DAG bucket missing operator "${name}"`)
  }

  // --- 2) Branch container — foldable tree with 2 lanes -----------------------
  await palette().getByRole('button', { name: 'Branch', exact: true }).first().click()
  await page.waitForTimeout(250)
  const containers = page.locator('[data-container-node]')
  if (!(await containers.count())) fail('expected a Branch container node')
  else console.log('✓ Branch container added')

  // fold / unfold the branch container
  const fold = page.locator('[data-container-fold]').first()
  await fold.click(); await page.waitForTimeout(120)
  if ((await page.locator('[data-branch-lane]').count()) === 0) console.log('✓ Branch folds')
  else fail('expected branches hidden after fold')
  await fold.click(); await page.waitForTimeout(120)
  if ((await page.locator('[data-branch-lane]').count()) >= 2) console.log('✓ Branch unfolds')
  else fail('expected branches shown after unfold')

  // fill the 2 branch lanes (SNV | Savitzky–Golay)
  const lanes = page.locator('[data-branch-lane]')
  await lanes.nth(0).click(); await page.waitForTimeout(100)
  await palette().getByRole('button', { name: 'SNV', exact: true }).first().click(); await page.waitForTimeout(120)
  await lanes.nth(1).click(); await page.waitForTimeout(100)
  await palette().getByRole('button', { name: /Savitzky/ }).first().click(); await page.waitForTimeout(120)
  console.log('✓ branch lanes filled (SNV | Savitzky–Golay)')

  // --- run the BRANCH pipeline -> CV scores + 2-lane union --------------------
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 90000 })
  const branchRun = await page.evaluate(() => {
    const r = window.__n4aLastRun
    const st = r?.model?.state
    return { engine: r?.engine, lanes: Array.isArray(st?.branch) ? st.branch.length : 0, hasCv: !!r?.cv }
  })
  if (branchRun.lanes >= 2 && branchRun.hasCv) console.log(`✓ Branch executed: ${branchRun.lanes}-lane feature union + CV (engine: ${branchRun.engine})`)
  else fail(`Branch run did not produce a ≥2-lane union with CV (${JSON.stringify(branchRun)})`)

  // run still via dag-ml's compiler (badge present) — proves the DSL compiled in dag-ml
  if (/by dag-ml/i.test((await page.textContent('body')) || '')) console.log('✓ run compiled by dag-ml (DSL compiles)')
  else fail('expected a "by dag-ml" badge (the DAG-container DSL did not compile in dag-ml)')

  // --- 3) OR generator over 2 preprocessing alternatives ----------------------
  // fresh reload → a clean default (model-only) pipeline, then add an OR generator.
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click(); await page.waitForTimeout(300)

  // switch the model to Ridge (a generic Tier-B estimator) so the alternative
  // preprocessing → model variants fit cleanly through libn4m.
  await page.getByRole('button', { name: /PLS Regression/ }).filter({ has: page.getByRole('button', { name: 'Remove step' }) }).first().click()
  await page.waitForTimeout(200)
  await page.locator('#model-select').click(); await page.waitForTimeout(200)
  await page.getByRole('option', { name: 'Ridge', exact: true }).click(); await page.waitForTimeout(200)
  console.log('✓ model switched to Ridge for the generator run')

  await palette().getByRole('button', { name: 'Generator: OR', exact: true }).first().click()
  await page.waitForTimeout(250)
  const genNode = page.locator('[data-container-kind="generator"]')
  if (await genNode.count()) console.log('✓ OR generator container added')
  else fail('expected an OR generator container node')

  // fill the 2 alternative lanes (Detrend | MSC)
  const gLanes = genNode.locator('[data-branch-lane]')
  await gLanes.nth(0).click(); await page.waitForTimeout(100)
  await palette().getByRole('button', { name: 'Detrend', exact: true }).first().click(); await page.waitForTimeout(120)
  await gLanes.nth(1).click(); await page.waitForTimeout(100)
  await palette().getByRole('button', { name: 'MSC', exact: true }).first().click(); await page.waitForTimeout(120)
  console.log('✓ generator alternatives filled (Detrend | MSC)')

  // the toolbar variant chip should show ≥2 variants
  const chip = await page.locator('[data-variant-chip]').first().textContent().catch(() => '')
  if (chip && /[2-9]/.test(chip)) console.log(`✓ variant chip present (${chip.trim()})`)
  else fail('expected a ×N variants chip from the OR generator')

  // run -> dag-ml expands variants + selects a best
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 120000 })
  const genRun = await page.evaluate(() => {
    const r = window.__n4aLastRun
    return {
      engine: r?.engine,
      variantCount: r?.variantCount,
      selectedCount: (r?.variants || []).filter((v) => v.selected).length,
      labels: (r?.variants || []).map((v) => v.label),
      cvN: r?.cv?.predictions?.length ?? 0,
      cvUnique: new Set((r?.cv?.predictions || []).map((p) => p.sampleId)).size,
    }
  })
  if (genRun.variantCount >= 2) console.log(`✓ OR generator expanded ${genRun.variantCount} variants (${JSON.stringify(genRun.labels)})`)
  else fail(`expected ≥2 variants from the OR generator, got ${genRun.variantCount}`)
  if (genRun.selectedCount === 1) console.log('✓ exactly one variant selected (dag-ml SELECT)')
  else fail(`expected exactly one selected variant, got ${genRun.selectedCount}`)
  if (genRun.cvN > 0 && genRun.cvN === genRun.cvUnique) console.log(`✓ winner CV OOF has unique sampleIds (${genRun.cvN} rows)`)
  else fail(`winner CV OOF rows duplicated: ${genRun.cvN} rows / ${genRun.cvUnique} unique`)

  await page.screenshot({ path: '/tmp/dag_ops_smoke.png', fullPage: true })

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail('dag-ops smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'DAG-OPS SMOKE FAILED' : 'DAG-OPS SMOKE PASSED')
