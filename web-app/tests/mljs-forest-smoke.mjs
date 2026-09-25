import { chromium } from 'playwright-core'

const url = process.env.SMOKE_URL || 'http://localhost:4345/'
const executablePath = process.env.CHROME || '/usr/bin/google-chrome'
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /PLS Regression/ }).first().click()
  await page.locator('#model-select').click()
  await page.getByRole('option', { name: 'Random forest (ml.js)', exact: true }).click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  const content = await page.textContent('body') || ''
  if (!/RMSE/i.test(content)) throw new Error('Random forest run did not show an RMSE score.')
  const classificationPage = await browser.newPage()
  classificationPage.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  classificationPage.on('pageerror', (error) => errors.push(error.message))
  await classificationPage.goto(url, { waitUntil: 'load', timeout: 30000 })
  await classificationPage.locator('button').filter({ hasText: 'Meat species' }).first().click()
  await classificationPage.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await classificationPage.locator('[data-step="pipeline"]').click()
  await classificationPage.getByRole('button', { name: /PLS-DA/ }).first().click()
  await classificationPage.locator('#model-select').click()
  await classificationPage.getByRole('option', { name: 'Random forest classifier (ml.js)', exact: true }).click()
  await classificationPage.getByRole('button', { name: /Run pipeline/i }).click()
  await classificationPage.waitForSelector('text=/CV Scores/', { timeout: 60000 })
  const classificationContent = await classificationPage.textContent('body') || ''
  if (!/accuracy/i.test(classificationContent)) throw new Error('Random forest classifier did not show accuracy.')
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log('ml.js random forests: regression and classification DAG-ML CV passed')
} finally {
  await browser.close()
}
