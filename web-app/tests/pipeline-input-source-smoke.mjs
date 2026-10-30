// Metadata-first uploads must name and feed the X source in the pipeline canvas.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(process.env.SMOKE_URL ?? 'http://127.0.0.1:4345/')
  const count = 12
  const file = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) })
  await page.locator('input[type=file]').first().setInputFiles([
    file('Mtrain.csv', ['sample_id;batch', ...Array.from({ length: count }, (_, i) => `S${i + 1};${i % 2 + 1}`)].join('\n')),
    file('Ytrain.csv', ['protein', ...Array.from({ length: count }, (_, i) => 10.1 + i * 0.7)].join('\n')),
    file('Xtrain.csv', ['1000;1010;1020;1030', ...Array.from({ length: count }, (_, i) => Array.from({ length: 4 }, (_, j) => 0.1 * (j + 1) + i * 0.003 + Math.sin((i + 1) * (j + 1) * 0.7) * 0.01).join(';'))].join('\n')),
  ])
  await page.getByText(`${count} samples × 4 wavelengths`, { exact: true }).first().waitFor({ timeout: 30000 })
  await page.locator('[data-step="pipeline"]').click()
  const input = page.locator('div.group').filter({ has: page.getByText('input spectra', { exact: true }) })
  assert.equal(await input.getByText('Xtrain.csv', { exact: true }).count(), 1)
  assert.equal(await input.getByText('Mtrain.csv', { exact: true }).count(), 0)
  assert.equal(await input.getByText('Ytrain.csv', { exact: true }).count(), 0)
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  try {
    await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  } catch (error) {
    throw new Error(`${error.message}\n${await page.locator('body').innerText()}\nConsole: ${errors.join('\n')}`)
  }
  assert.deepEqual(errors, [])
  console.log('Pipeline input source passed: metadata-first upload displays X, retains four spectral columns, and runs with targets.')
} finally {
  await browser.close()
}
