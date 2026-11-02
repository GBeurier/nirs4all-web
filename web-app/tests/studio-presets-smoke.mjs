import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { getStudioPipelinePresets } from 'nirs4all-ui/pipelines'

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:4345/'
  await page.goto(base)
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 30000 })
  await page.locator('[data-step="pipeline"]').click()
  const recipe = getStudioPipelinePresets().find((preset) => preset.id === 'simple_pls').variants.regression.pipeline
  await page.locator('input[type=file]').last().setInputFiles({ name: 'pipeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ pipeline: recipe })) })
  assert.equal(await page.getByLabel('Pipeline name').inputValue(), 'Simple PLS')
  assert.match(await page.locator('[data-variant-chip]').innerText(), /24 variants/)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 120000 })
  assert.deepEqual(errors, [])
  console.log('Studio presets passed: Simple PLS recipe import and execution.')
} finally {
  await browser.close()
}
