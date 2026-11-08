import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const WASM_PROVENANCE = [
  ...['dagml', 'dagml-data', 'datasets', 'formats', 'io', 'methods'].map((dir) => [dir, new URL(`../src/engine/wasm/${dir}/PROVENANCE.json`, import.meta.url)]),
  ['nirs4all', new URL('../vendor/nirs4all/PROVENANCE.json', import.meta.url)],
]

/** sha256 → staged component file name, from the staged owner PROVENANCE manifests. */
export async function knownWasmManifest() {
  const known = new Map()
  const walk = (component, value) => {
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      if (key.endsWith('.wasm') && typeof entry?.sha256 === 'string') {
        const name = `${component}/${basename(key)}`
        if (known.has(entry.sha256) && known.get(entry.sha256) !== name) throw new Error(`WASM manifest names ${entry.sha256} twice: ${known.get(entry.sha256)}, ${name}`)
        known.set(entry.sha256, name)
      }
      walk(component, entry)
    }
  }
  for (const [component, url] of WASM_PROVENANCE) walk(component, JSON.parse(await readFile(url, 'utf8')))
  return known
}

const INLINE_WORKER_RE = /new Blob\(\[([A-Za-z_$][\w$]*)\],\{type:"text\/javascript;charset=utf-8"\}\)/g
const WASM_DATA_URL = 'data:application/wasm;base64,'
const BASE64_RUN = /[A-Za-z0-9+/=]*/y
const REQUIRED_WORKER_WASM = ['dagml/dag_ml_wasm_bg.wasm', 'methods/n4m.wasm']

/** The inline single-file document's embedded WASM payloads: decoded, hashed and
 *  labelled by container (inline engine worker or document), each matched to the
 *  staged manifest. Refuses an unknown payload or a worker without the owner DAG/Methods WASM. */
export async function embeddedRuntimeResources(htmlPath) {
  const html = (await readFile(htmlPath)).toString('latin1')
  const workers = []
  for (const match of html.matchAll(INLINE_WORKER_RE)) {
    const start = html.lastIndexOf(`${match[1]}='`, match.index)
    if (start < 0) throw new Error(`inline worker source ${match[1]} is not a string literal in ${htmlPath}`)
    workers.push([start, match.index])
  }
  if (workers.length !== 1) throw new Error(`expected one inline engine worker in ${htmlPath}, found ${workers.length}`)
  const known = await knownWasmManifest()
  const byKey = new Map()
  for (let at = html.indexOf(WASM_DATA_URL); at >= 0; at = html.indexOf(WASM_DATA_URL, at + 1)) {
    BASE64_RUN.lastIndex = at + WASM_DATA_URL.length
    const bytes = Buffer.from(BASE64_RUN.exec(html)[0], 'base64')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const manifest = known.get(sha256)
    if (!manifest) throw new Error(`embedded WASM at offset ${at} (${bytes.byteLength} bytes, sha256 ${sha256}) is not in the staged owner manifests`)
    const container = workers.some(([from, to]) => at > from && at < to) ? 'inline-engine-worker' : 'document'
    const key = `${container}|${sha256}`
    const item = byKey.get(key) ?? { origin: 'embedded', container, name: `embedded:${container}/${manifest}`, manifest, bytes: bytes.byteLength, sha256, occurrences: 0 }
    item.occurrences += 1
    byKey.set(key, item)
  }
  const resources = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const manifest of REQUIRED_WORKER_WASM) {
    if (!resources.some((item) => item.container === 'inline-engine-worker' && item.manifest === manifest)) {
      throw new Error(`the inline engine worker embeds no ${manifest} matching the staged manifest`)
    }
  }
  return resources
}

export async function collectRuntimeEvidence(page) {
  const run = await page.evaluate(() => {
    const r = window.__n4aLastRun
    if (!r) return null
    const lineage = r.lineage && typeof r.lineage === 'object' ? r.lineage : {}
    const dataProvider = lineage.dataProvider && typeof lineage.dataProvider === 'object' ? lineage.dataProvider : null
    const refit = r.model?.state?.nativeRefit
    const pkg = refit?.packageJson ? JSON.parse(refit.packageJson) : null
    const artifact = pkg?.artifacts?.length === 1 ? pkg.artifacts[0].record.artifact : null
    return {
      engine: r.engine ?? null,
      score_metric: r.scoreMetric ?? null,
      lineage_engine: lineage.engine ?? null,
      lineage_version: lineage.version ?? null,
      lineage_compiled: lineage.compiled ?? null,
      lineage_executed: lineage.executed ?? null,
      cv_execution: lineage.executed ? 'native_scheduler' : 'host_on_native_folds',
      native_refit: {
        executed: lineage.refitExecuted === true,
        profile: lineage.refitProfile ?? null,
        package_fingerprint: lineage.packageFingerprint ?? null,
        package_matches: Boolean(pkg && pkg.package_fingerprint === lineage.packageFingerprint),
        artifact_matches: Boolean(artifact && artifact.id === refit.artifactId && artifact.content_fingerprint === refit.carrierSha256),
      },
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
      resources.push({ origin: 'loaded', ...(await sha256Url(url)) })
    } catch (error) {
      resources.push({ origin: 'loaded', url, error: error instanceof Error ? error.message : String(error) })
    }
  }
  // The single-file build loads no runtime resource: its WASM is embedded in the
  // document and in the inline engine worker. Hash those actual embedded bytes.
  const pageUrl = new URL(page.url())
  if (pageUrl.protocol === 'file:') resources.push(...await embeddedRuntimeResources(fileURLToPath(pageUrl)))
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

// Preprocessing and branch CV still use the host on native folds. REFIT and
// replay use the native composite-controller package for both CV profiles.
// Require that package evidence explicitly instead of claiming native CV.
export function assertNativeRefitExecution(runtime, label) {
  if (runtime.lineage_engine !== 'dag-ml-wasm' || runtime.lineage_compiled !== true) {
    throw new Error(`${label} did not compile through dag-ml`)
  }
  const refit = runtime.native_refit
  if (!refit?.executed || refit.profile !== 'browser-composite-host-sidecar-v1'
      || !/^[0-9a-f]{64}$/.test(refit.package_fingerprint ?? '')
      || !refit.package_matches || !refit.artifact_matches) {
    throw new Error(`${label} lacks its native REFIT package and bound browser state`)
  }
  if (runtime.scheduler_fallback) throw new Error(`${label} used a scheduler fallback`)
}

export async function assertResultsPanels(page) {
  const inspector = page.locator('[data-owner-inspector]')
  await inspector.waitFor({ timeout: 10000 })
  await inspector.locator('[data-testid="n4a-results-list"]').waitFor({ timeout: 10000 })
  const owner = await page.evaluate(() => {
    const run = window.__n4aLastRun
    return run ? { metric: run.scoreMetric, task: run.taskType, score: run.cv ?? run.refit, kind: run.cv ? 'cv' : 'refit' } : null
  })
  if (!owner?.score || owner.score.status !== 'completed' || !owner.score.predictions.length) throw new Error('missing completed owner predictions')
  const scoreRef = await inspector.locator('label').filter({ hasText: 'Evaluation score' }).locator('select').inputValue()
  if (scoreRef !== `${owner.metric}:${owner.kind}`) throw new Error(`unexpected Inspector score context ${scoreRef}`)
  const classification = owner.task !== 'regression'
  const plotSelector = classification
    ? 'svg[role="img"][aria-label="Confusion matrix"]'
    : 'svg[role="img"][aria-label="Predicted versus observed"]'
  await inspector.locator(plotSelector).waitFor({ timeout: 10000 })
  await page.waitForFunction(({ plotSelector, classification }) => {
    const svg = document.querySelector(`[data-owner-inspector] ${plotSelector}`)
    if (classification) return Array.from(svg?.querySelectorAll('.n4viz-cell-value') ?? []).some((cell) => Number(cell.textContent) > 0)
    const points = Number(svg?.querySelector('desc')?.textContent?.match(/^(\d+) points\b/)?.[1] ?? 0)
    const canvas = svg?.closest('.n4wb-plot')?.querySelector('canvas')
    if (!points || !canvas?.width || !canvas?.height) return false
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    return pixels?.some((value, index) => index % 4 === 3 && value > 0) === true
  }, { plotSelector, classification }, { timeout: 10000 })
  const selectedScore = inspector.locator('summary').filter({ hasText: 'Selected owner score:' })
  if (!(await selectedScore.innerText()).includes(owner.score.name)) throw new Error('selected score label differs from owner result')
  const details = selectedScore.locator('..')
  const wasOpen = await details.evaluate((node) => node.open)
  if (!wasOpen) await selectedScore.click()
  const rows = await inspector.locator('[aria-label="Selected owner predictions"] tbody tr').evaluateAll((nodes) =>
    nodes.map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent.trim())),
  )
  const expectedRows = owner.score.predictions.map((row) => [String(row.sampleId), String(row.actualLabel ?? row.actual), String(row.predictedLabel ?? row.predicted), String(row.residual)])
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) throw new Error('Inspector prediction rows differ from the real owner result')
  if (!wasOpen) await selectedScore.click()
  const panels = await page.evaluate(() => {
    const body = document.body.innerText || ''
    return {
      results_list: Boolean(document.querySelector('[data-testid="n4a-results-list"]')),
      results_visualization: Boolean(document.querySelector('[data-owner-inspector]')),
      has_cv_scores: /CV Scores/.test(body),
      has_refit_scores: /Refit/.test(body),
      has_prediction_view: Boolean(document.querySelector('[data-owner-inspector] svg[role="img"][aria-label="Predicted versus observed"], [data-owner-inspector] svg[role="img"][aria-label="Confusion matrix"]')),
      chart_count: document.querySelectorAll('[data-owner-inspector] svg[role="img"]').length,
    }
  })
  if (!panels.results_list || !panels.results_visualization) throw new Error('missing Results list or visualization panel')
  if (!panels.has_cv_scores) throw new Error('Results panel did not render CV Scores')
  if (!panels.has_refit_scores) throw new Error('Results panel did not render Refit scores')
  if (!panels.has_prediction_view) throw new Error('Results panel did not render a prediction visualization tab')
  return { ...panels, selected_score_ref: scoreRef, owner_prediction_rows: rows.length }
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
