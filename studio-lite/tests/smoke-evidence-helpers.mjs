import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const RUNTIME_RESOURCE_RE = /(dag_ml|dag-ml|dagml|n4m|methods|worker).*\.(?:js|wasm)(?:$|\?)|(?:\.wasm)(?:$|\?)/i

export async function sha256File(path) {
  const buf = await readFile(path)
  return {
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  }
}

async function sha256Url(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`cannot hash runtime resource ${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    url,
    name: basename(new URL(url).pathname),
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  }
}

export async function collectRuntimeEvidence(page) {
  const run = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const lineage = r.lineage && typeof r.lineage === 'object' ? r.lineage : {}
    const dataProvider = lineage.dataProvider && typeof lineage.dataProvider === 'object' ? lineage.dataProvider : null
    return {
      engine: r.engine ?? null,
      score_metric: r.scoreMetric ?? null,
      lineage_engine: lineage.engine ?? null,
      lineage_version: lineage.version ?? null,
      lineage_compiled: lineage.compiled ?? null,
      lineage_executed: lineage.executed ?? null,
      scheduler_fallback: Boolean(lineage.schedulerFallback),
      data_provider: dataProvider
        ? {
            layer: dataProvider.layer ?? null,
            status: dataProvider.status ?? null,
            version: dataProvider.version ?? null,
            representation: dataProvider.representation ?? null,
            fingerprints: dataProvider.fingerprints ?? null,
          }
        : null,
      rt_manifest: r.rtResult?.manifest
        ? {
            engine: r.rtResult.manifest.engine ?? null,
            portable_level: r.rtResult.manifest.portable_level ?? null,
            fingerprints: r.rtResult.manifest.fingerprints ?? null,
            capability_keys: Object.keys(r.rtResult.manifest.capabilities ?? {}).sort(),
            file_keys: Object.keys(r.rtResult.manifest.files ?? {}).sort(),
          }
        : null,
      diagnostics_count: Array.isArray(r.diagnostics) ? r.diagnostics.length : 0,
    }
  })
  if (!run?.engine) throw new Error('missing backend engine metadata on window.__n4aLastRun')

  const urls = await page.evaluate(() =>
    Array.from(new Set(performance.getEntriesByType('resource').map((entry) => entry.name)))
      .filter((url) => /(dag_ml|dag-ml|dagml|n4m|methods|worker).*\.(?:js|wasm)(?:$|\?)|(?:\.wasm)(?:$|\?)/i.test(url))
      .sort(),
  )
  const resources = []
  for (const url of urls.slice(0, 24)) {
    if (!RUNTIME_RESOURCE_RE.test(url)) continue
    try {
      resources.push(await sha256Url(url))
    } catch (error) {
      resources.push({ url, error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (!resources.some((item) => item.sha256)) throw new Error('no hashable WASM/runtime resources were loaded')

  const runtimeHash = createHash('sha256')
    .update(JSON.stringify({ run, resources: resources.filter((item) => item.sha256).map((item) => [item.name, item.bytes, item.sha256]) }))
    .digest('hex')

  return {
    ...run,
    runtime_hash: runtimeHash,
    resources,
  }
}

export async function assertResultsPanels(page) {
  await page.waitForSelector('[data-testid="n4a-results-list"]', { timeout: 10000 })
  await page.waitForSelector('[data-testid="n4a-results-visualization"]', { timeout: 10000 })
  const panels = await page.evaluate(() => {
    const body = document.body.innerText || ''
    return {
      results_list: Boolean(document.querySelector('[data-testid="n4a-results-list"]')),
      results_visualization: Boolean(document.querySelector('[data-testid="n4a-results-visualization"]')),
      has_cv_scores: /CV Scores/.test(body),
      has_refit_scores: /Refit/.test(body),
      has_prediction_view: /Predicted vs Actual|Confusion Matrix/.test(body),
      chart_count: document.querySelectorAll('svg.recharts-surface').length,
    }
  })
  if (!panels.results_list || !panels.results_visualization) throw new Error('missing Results list or visualization panel')
  if (!panels.has_cv_scores) throw new Error('Results panel did not render CV Scores')
  if (!panels.has_refit_scores) throw new Error('Results panel did not render Refit scores')
  if (!panels.has_prediction_view) throw new Error('Results panel did not render a prediction visualization tab')
  return panels
}

function finiteMetrics(metrics) {
  const out = {}
  for (const [key, value] of Object.entries(metrics ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

export async function runPredictionSummary(page) {
  return await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const score = r.cv ?? r.refit
    if (!score) return null
    return {
      pipeline_name: r.pipelineName ?? null,
      engine: r.engine ?? null,
      score_name: score.name ?? null,
      score_kind: score.kind ?? null,
      metrics: Object.fromEntries(
        Object.entries(score.metrics ?? {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)),
      ),
      prediction_count: Array.isArray(score.predictions) ? score.predictions.length : 0,
      predictions: (score.predictions ?? []).map((row) => ({
        sample_id: String(row.sampleId),
        actual: Number(row.actual),
        predicted: Number(row.predicted),
        residual: Number(row.residual),
      })),
    }
  })
}

export function compareRunPredictionSummaries(reference, actual, tolerance = 1e-8) {
  if (!reference || !actual) throw new Error('missing prediction summary for comparison')
  if (reference.prediction_count !== actual.prediction_count) {
    throw new Error(`prediction count changed: ${reference.prediction_count} != ${actual.prediction_count}`)
  }
  let max_abs_delta = 0
  for (let i = 0; i < reference.predictions.length; i++) {
    const a = reference.predictions[i]
    const b = actual.predictions[i]
    if (a.sample_id !== b.sample_id) throw new Error(`sample id changed at row ${i}: ${a.sample_id} != ${b.sample_id}`)
    for (const key of ['actual', 'predicted', 'residual']) {
      const delta = Math.abs(a[key] - b[key])
      if (!Number.isFinite(delta)) throw new Error(`non-finite ${key} comparison at row ${i}`)
      max_abs_delta = Math.max(max_abs_delta, delta)
      if (delta > tolerance) throw new Error(`${key} changed at row ${i}: ${a[key]} != ${b[key]} (delta ${delta})`)
    }
  }
  for (const [key, value] of Object.entries(finiteMetrics(reference.metrics))) {
    if (!(key in actual.metrics)) throw new Error(`metric ${key} missing after import`)
    const delta = Math.abs(value - actual.metrics[key])
    max_abs_delta = Math.max(max_abs_delta, delta)
    if (delta > tolerance) throw new Error(`metric ${key} changed: ${value} != ${actual.metrics[key]} (delta ${delta})`)
  }
  return {
    compared_rows: reference.prediction_count,
    compared_metrics: Object.keys(finiteMetrics(reference.metrics)).sort(),
    tolerance,
    max_abs_delta,
  }
}

export async function capturePredictionPanel(page) {
  await page.waitForSelector('text=/samples predicted\\./', { timeout: 15000 })
  await page.locator('svg.recharts-surface').first().waitFor({ timeout: 10000 })
  return await page.evaluate(() => {
    const body = document.body.innerText || ''
    const sampleMatch = body.match(/(\d+)\s+samples?\s+predicted\./)
    const table = Array.from(document.querySelectorAll('table')).find((node) => /Predicted value|Predicted class/.test(node.innerText || ''))
    const displayValues = table
      ? Array.from(table.querySelectorAll('tbody tr')).map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim())
          return cells[1] ?? ''
        }).filter(Boolean)
      : []
    const numericValues = displayValues.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    return {
      panel_title: /Predict on new spectra/.test(body),
      predicted_samples: sampleMatch ? Number(sampleMatch[1]) : null,
      chart_count: document.querySelectorAll('svg.recharts-surface').length,
      table_rows: displayValues.length,
      display_values: displayValues,
      numeric_values: numericValues,
    }
  })
}

export function comparePredictionPanels(reference, actual, tolerance = 5e-4) {
  if (!reference?.panel_title || !actual?.panel_title) throw new Error('prediction panel title missing')
  if (reference.predicted_samples !== actual.predicted_samples) {
    throw new Error(`predicted sample count changed: ${reference.predicted_samples} != ${actual.predicted_samples}`)
  }
  if (reference.numeric_values.length === 0 || actual.numeric_values.length === 0) throw new Error('no numeric prediction values to compare')
  if (reference.numeric_values.length !== actual.numeric_values.length) {
    throw new Error(`prediction table length changed: ${reference.numeric_values.length} != ${actual.numeric_values.length}`)
  }
  let max_abs_delta = 0
  for (let i = 0; i < reference.numeric_values.length; i++) {
    const delta = Math.abs(reference.numeric_values[i] - actual.numeric_values[i])
    max_abs_delta = Math.max(max_abs_delta, delta)
    if (delta > tolerance) {
      throw new Error(`displayed prediction changed at row ${i}: ${reference.display_values[i]} != ${actual.display_values[i]} (delta ${delta})`)
    }
  }
  return {
    compared_rows: reference.numeric_values.length,
    predicted_samples: reference.predicted_samples,
    tolerance,
    max_abs_delta,
  }
}
