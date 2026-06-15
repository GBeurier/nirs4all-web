import { chromium } from 'playwright-core'
const URL = process.env.SMOKE_URL || 'http://localhost:4330/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewportSize({ width: 1280, height: 1400 })
await p.goto(URL, { waitUntil: 'load' })
// NIR regression
await p.locator('button').filter({ hasText: 'Corn protein' }).first().click()
await p.waitForSelector('text=/samples ×/')
await p.locator('button').filter({ hasText: /Run pipeline/i }).first().click()
await p.waitForSelector('text=/CV Scores/', { timeout: 60000 })
await p.waitForTimeout(800)
await p.screenshot({ path: '/tmp/shot_nir_reg.png', fullPage: true })
console.log('saved /tmp/shot_nir_reg.png')
await b.close()
