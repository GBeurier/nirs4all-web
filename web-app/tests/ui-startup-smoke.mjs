// Short built-UI readiness check. Scientific and replay suites run locally.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const errors = []
const failedResponses = []
try {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => {
    if (response.status() >= 400 && !/favicon/.test(response.url())) {
      failedResponses.push(`${response.status()} ${response.url()}`)
    }
  })
  await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:4345/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.getByText(/nirs4all/i).first().waitFor({ timeout: 60000 })
  assert.ok(await page.locator('button').count() > 0, 'Built React UI must expose controls')
  assert.deepEqual(failedResponses, [], 'Built UI assets must load')
  assert.deepEqual(errors, [], 'Built UI must start without runtime errors')
  console.log('Built UI startup PASS; no model fit, CV, HPO or replay executed.')
} finally {
  await browser.close()
}
