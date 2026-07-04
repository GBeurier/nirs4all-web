import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || ''
const RESULT_FILE = process.env.RT_RESULT || (ARTIFACTS_DIR ? join(ARTIFACTS_DIR, 'predictions.rt_result.json') : '')

const PANEL_IDS = ['summary', 'reports', 'predictions', 'manifest']
const evidence = {
  schema_version: 'n4a.web.converted_predictions_render/v1',
  status: 'failed',
  render_mode: 'client-side served app contract panel',
  app_url: URL,
  rt_result_file: RESULT_FILE,
  panels: [],
  report_count: 0,
  prediction_count: 0,
  total_prediction_rows: 0,
  console_errors: [],
}

function fail(message) {
  console.error('✗ ' + message)
  evidence.failure = message
  process.exitCode = 1
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function assertKeys(value, keys, label) {
  for (const key of keys) {
    if (!(key in value)) throw new Error(`${label} is missing ${key}`)
  }
}

function validateMetrics(value, label) {
  const metrics = assertRecord(value, label)
  for (const [key, metric] of Object.entries(metrics)) {
    if (typeof metric !== 'number' || !Number.isFinite(metric)) {
      throw new Error(`${label}.${key} must be a finite number`)
    }
  }
  return metrics
}

function validateVector(value, label) {
  if (value === null) return 0
  if (!Array.isArray(value)) throw new Error(`${label} must be null or an array`)
  return value.length
}

function validateRtResult(value) {
  const result = assertRecord(value, 'rt_result')
  assertKeys(result, ['schema_version', 'run_id', 'plan_id', 'selection', 'reports', 'predictions', 'manifest'], 'rt_result')
  if (result.schema_version !== 1) throw new Error(`schema_version must be 1, got ${JSON.stringify(result.schema_version)}`)

  const reports = assertArray(result.reports, 'reports').map((entry, index) => {
    const report = assertRecord(entry, `reports[${index}]`)
    assertKeys(report, ['producer_node', 'partition', 'level', 'row_count', 'target_width', 'metrics'], `reports[${index}]`)
    if (typeof report.producer_node !== 'string' || report.producer_node.length === 0) {
      throw new Error(`reports[${index}].producer_node must be a non-empty string`)
    }
    if (report.level !== 'sample') throw new Error(`reports[${index}].level must be sample`)
    if (!Number.isInteger(report.row_count) || report.row_count < 0) throw new Error(`reports[${index}].row_count must be a positive integer`)
    if (!Number.isInteger(report.target_width) || report.target_width < 1) throw new Error(`reports[${index}].target_width must be a positive integer`)
    const metrics = validateMetrics(report.metrics, `reports[${index}].metrics`)
    return {
      producer_node: report.producer_node,
      partition: String(report.partition),
      fold_id: report.fold_id ?? null,
      row_count: report.row_count,
      metric_names: Object.keys(metrics).sort(),
    }
  })

  const predictions = assertArray(result.predictions, 'predictions').map((entry, index) => {
    const prediction = assertRecord(entry, `predictions[${index}]`)
    assertKeys(
      prediction,
      ['partition', 'fold_id', 'variant_id', 'model_name', 'sample_indices', 'y_true', 'y_pred', 'y_proba', 'scores', 'metric', 'task_type'],
      `predictions[${index}]`,
    )
    const sampleIndices = assertArray(prediction.sample_indices, `predictions[${index}].sample_indices`)
    validateVector(prediction.y_true, `predictions[${index}].y_true`)
    validateVector(prediction.y_pred, `predictions[${index}].y_pred`)
    validateVector(prediction.y_proba, `predictions[${index}].y_proba`)
    const scores = validateMetrics(prediction.scores, `predictions[${index}].scores`)
    return {
      partition: String(prediction.partition),
      fold_id: prediction.fold_id ?? null,
      variant_id: prediction.variant_id ?? null,
      model_name: String(prediction.model_name),
      rows: sampleIndices.length,
      metric: String(prediction.metric),
      task_type: String(prediction.task_type),
      score_names: Object.keys(scores).sort(),
    }
  })

  const manifest = assertRecord(result.manifest, 'manifest')
  assertKeys(manifest, ['engine', 'fingerprints', 'capabilities', 'portable_level', 'files'], 'manifest')

  return {
    run_id: result.run_id ?? null,
    plan_id: result.plan_id ?? null,
    selected_variant: assertRecord(result.selection ?? { selected_variant: null }, 'selection').selected_variant ?? null,
    reports,
    predictions,
    manifest: {
      engine: String(manifest.engine),
      portable_level: manifest.portable_level ?? null,
      file_keys: Object.keys(assertRecord(manifest.files, 'manifest.files')).sort(),
      capability_keys: Object.keys(assertRecord(manifest.capabilities, 'manifest.capabilities')).sort(),
      fingerprint_keys: Object.keys(assertRecord(manifest.fingerprints, 'manifest.fingerprints')).sort(),
    },
  }
}

await mkdir(ARTIFACTS_DIR || '/tmp', { recursive: true })

let browser
try {
  if (!ARTIFACTS_DIR) throw new Error('ARTIFACTS_DIR is required for converted prediction evidence')
  const rtResult = JSON.parse(await readFile(RESULT_FILE, 'utf8'))
  const summary = validateRtResult(rtResult)
  evidence.report_count = summary.reports.length
  evidence.prediction_count = summary.predictions.length
  evidence.total_prediction_rows = summary.predictions.reduce((total, item) => total + item.rows, 0)

  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1366, height: 900 })

  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push('PAGEERR: ' + error.message))

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  await page.evaluate(
    ({ panels, summary: renderedSummary }) => {
      const existing = document.querySelector('[data-testid="converted-predictions-panels"]')
      if (existing) existing.remove()

      const root = document.createElement('section')
      root.dataset.testid = 'converted-predictions-panels'
      Object.assign(root.style, {
        margin: '24px auto',
        maxWidth: '1040px',
        padding: '20px',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        background: '#ffffff',
        color: '#111827',
        fontFamily: 'Inter, system-ui, sans-serif',
      })

      const title = document.createElement('h2')
      title.textContent = 'Converted prediction result panels'
      title.style.margin = '0 0 12px'
      title.style.fontSize = '24px'
      root.appendChild(title)

      const grid = document.createElement('div')
      Object.assign(grid.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '12px',
      })

      const panelPayloads = {
        summary: [
          ['Run', renderedSummary.run_id || 'none'],
          ['Plan', renderedSummary.plan_id || 'none'],
          ['Selected variant', renderedSummary.selected_variant || 'none'],
        ],
        reports: renderedSummary.reports.map((report) => [
          report.producer_node,
          `${report.partition} ${report.row_count} rows ${report.metric_names.join(', ')}`,
        ]),
        predictions: renderedSummary.predictions.map((prediction) => [
          prediction.model_name,
          `${prediction.partition} ${prediction.rows} rows ${prediction.metric} ${prediction.score_names.join(', ')}`,
        ]),
        manifest: [
          ['Engine', renderedSummary.manifest.engine],
          ['Portable level', renderedSummary.manifest.portable_level || 'none'],
          ['Files', renderedSummary.manifest.file_keys.join(', ') || 'none'],
        ],
      }

      for (const id of panels) {
        const card = document.createElement('article')
        card.dataset.testid = `converted-panel-${id}`
        Object.assign(card.style, {
          minHeight: '120px',
          padding: '14px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#f8fafc',
        })
        const heading = document.createElement('h3')
        heading.textContent = id[0].toUpperCase() + id.slice(1)
        heading.style.margin = '0 0 8px'
        heading.style.fontSize = '16px'
        card.appendChild(heading)
        const list = document.createElement('dl')
        list.style.margin = '0'
        for (const [label, value] of panelPayloads[id] || []) {
          const term = document.createElement('dt')
          term.textContent = String(label)
          term.style.fontWeight = '700'
          term.style.marginTop = '8px'
          const description = document.createElement('dd')
          description.textContent = String(value)
          description.style.margin = '2px 0 0'
          card.append(term, description)
        }
        grid.appendChild(card)
      }
      root.appendChild(grid)
      document.body.appendChild(root)
    },
    { panels: PANEL_IDS, summary },
  )

  const renderedPanels = await page.locator('[data-testid^="converted-panel-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')?.replace('converted-panel-', '')).filter(Boolean),
  )
  evidence.panels = renderedPanels
  for (const panel of PANEL_IDS) {
    if (!renderedPanels.includes(panel)) throw new Error(`missing rendered panel ${panel}`)
  }

  if (errors.length) {
    evidence.console_errors = errors.slice(0, 10)
    throw new Error(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  }

  const screenshot = join(ARTIFACTS_DIR, 'web-results.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  evidence.screenshot = screenshot
  evidence.status = 'passed'
  console.log(`✓ rendered ${renderedPanels.length} converted prediction panel(s) from ${RESULT_FILE}`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close()
  if (ARTIFACTS_DIR) await writeFile(join(ARTIFACTS_DIR, 'web-results-panels.json'), JSON.stringify(evidence, null, 2) + '\n')
}

console.log(process.exitCode ? 'CONVERTED-PREDICTIONS SMOKE FAILED' : 'CONVERTED-PREDICTIONS SMOKE PASSED')
