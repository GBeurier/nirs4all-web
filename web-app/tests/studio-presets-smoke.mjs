import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { getStudioPipelinePresets } from 'nirs4all-ui/pipelines'

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:4345/'
  await page.goto(base)
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: 'Presets', exact: true }).click()
  const gallery = page.locator('[data-studio-preset-gallery]')
  assert.equal(await gallery.locator('.n4-preset-card').count(), 10)
  assert.equal(await gallery.locator('.n4-preset-action').count(), 20)
  for (const preset of getStudioPipelinePresets()) {
    assert.equal(await gallery.getByRole('heading', { name: preset.name, exact: true }).count(), 1)
    for (const task of preset.available_variants) {
      assert.equal(await gallery.getByRole('button', { name: `${preset.name} — ${task}`, exact: true }).count(), 1)
    }
  }
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    if (width === 1440 || width === 390) {
      await page.locator('[data-studio-preset-scroll]').evaluate((element) => { element.scrollTop = 0 })
      await page.screenshot({ path: join(tmpdir(), `n4a-studio-presets-${width}.png`), animations: 'disabled' })
    }
    const dialog = page.getByRole('dialog')
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Dialog overflow at ${width}px`)
    const scroll = page.locator('[data-studio-preset-scroll]')
    assert.ok(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight))
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
    assert.ok(await gallery.getByRole('heading', { name: 'Ultra Slow', exact: true }).isVisible())
    assert.ok(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `Gallery overflow at ${width}px`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gallery.getByRole('button', { name: 'Ultra Slow — regression', exact: true }).click()
  assert.match(await page.getByRole('status').innerText(), /require Studio/)
  await page.getByText('View original recipe', { exact: true }).click()
  const original = getStudioPipelinePresets().find((preset) => preset.id === 'ultra_slow').variants.regression.pipeline
  assert.deepEqual(JSON.parse(await page.locator('details pre').innerText()), { pipeline: original })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original recipe', exact: true }).click()
  const download = await downloadPromise
  assert.deepEqual(JSON.parse(readFileSync(await download.path(), 'utf8')), { pipeline: original })
  await page.getByLabel('Search presets').fill('no matching preset')
  assert.equal(await gallery.locator('.n4-preset-card').count(), 0)
  await page.getByLabel('Search presets').fill('')
  await gallery.getByRole('button', { name: 'Simple PLS — regression', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Pipeline name').inputValue(), 'Simple PLS')
  assert.match(await page.locator('[data-variant-chip]').innerText(), /24 variants/)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 120000 })
  assert.deepEqual(errors, [])
  console.log('Studio presets passed: ten exact presets, twenty actions, original recipe download, responsive scrolling, full Simple PLS search import and execution.')
} finally {
  await browser.close()
}
