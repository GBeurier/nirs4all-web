// Consume the paper/repository handoff artifact emitted by the Python + Papers
// e2e lane, import it into the client-only Web/WASM app, and execute it over a
// browser-uploadable repository dataset (the Python-exported original dataset in
// the cross-language E2E, or the local alternative fixture when run standalone).
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import { assertResultsPanels, collectRuntimeEvidence, runPredictionSummary, sha256File } from './smoke-evidence-helpers.mjs'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4355/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(TEST_DIR, 'fixtures', 'pipeline-repository')
const DATASET_DIR = process.env.N4A_REPOSITORY_DATASET_DIR || FIXTURE_DIR
const DATASET_EXPECTED_BADGE = process.env.N4A_REPOSITORY_DATASET_EXPECTED_BADGE || '20 samples × 6 wavelengths'
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(tmpdir(), 'n4a-web-repository-best-pipeline-smoke')
const WORKSPACE_ROOT = resolve(TEST_DIR, '..', '..', '..')
const NIRS4ALL_PYTHON_SRC = join(WORKSPACE_ROOT, 'nirs4all')
const REPOSITORY_BEST_PIPELINE_PATH =
  process.env.N4A_REPOSITORY_EVIDENCE ||
  process.env.REPOSITORY_BEST_PIPELINE_PATH ||
  join(WORKSPACE_ROOT, 'nirs4all-ecosystem', '.n4a-e2e-artifacts', 'python-paper-repository', 'repository-best-pipeline.json')
const execFileAsync = promisify(execFile)

const evidence = {
  schema_version: 'n4a.web.repository_best_pipeline_smoke/v1',
  status: 'failed',
  app_url: APP_URL,
  repository_best_pipeline_artifact: REPOSITORY_BEST_PIPELINE_PATH,
  repository_best_pipeline_bytes: null,
  repository_best_pipeline_sha256: null,
  repository_best_pipeline_shape: null,
  uploaded_dataset_dir: DATASET_DIR,
  uploaded_dataset_files: ['repository_X_train.csv', 'repository_y_train.csv', 'repository_metadata.csv'],
  uploaded_dataset_expected_badge: DATASET_EXPECTED_BADGE,
  dataset_badge: null,
  imported_pipeline_name: null,
  imported_pipeline_shape: null,
  executed_imported_pipeline: false,
  results_panels: null,
  runtime: null,
  prediction_summary: null,
  fold_assignments: null,
  fold_assignment_assertions: null,
  client_only_oracle_probe: null,
  python_oracle: null,
  python_oracle_comparison: null,
  console_error_count: 0,
  console_errors_absent: false,
  failed_request_count: 0,
  unexpected_dialog_count: 0,
  screenshot_artifact: null,
  evidence_artifact: null,
  console_errors: [],
  failed_requests: [],
  dialogs: [],
}

let page
const errors = []
const bad404 = []
const dialogs = []

const fail = (message) => {
  console.error('✗ ' + message)
  process.exitCode = 1
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function writeEvidence() {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  evidence.console_errors = errors
  evidence.console_error_count = errors.length
  evidence.console_errors_absent = errors.length === 0
  evidence.failed_requests = bad404
  evidence.failed_request_count = bad404.length
  evidence.dialogs = dialogs
  evidence.unexpected_dialog_count = dialogs.length
  if (page) {
    const screenshotPath = join(ARTIFACTS_DIR, 'repository-best-pipeline-web-results.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    const screenshotStats = await stat(screenshotPath)
    evidence.screenshot_artifact = { path: screenshotPath, bytes: screenshotStats.size, non_empty: screenshotStats.size > 0 }
    if (screenshotStats.size <= 0) fail('screenshot artifact is empty')
  }
  const evidencePath = join(ARTIFACTS_DIR, 'web-repository-best-pipeline.json')
  let evidenceText = ''
  let evidenceBytes = 0
  for (let index = 0; index < 4; index += 1) {
    evidence.evidence_artifact = { path: evidencePath, bytes: evidenceBytes, non_empty: evidenceBytes > 0 }
    evidenceText = JSON.stringify(evidence, null, 2) + '\n'
    const nextBytes = Buffer.byteLength(evidenceText)
    if (nextBytes === evidenceBytes) break
    evidenceBytes = nextBytes
  }
  evidence.evidence_artifact = { path: evidencePath, bytes: evidenceBytes, non_empty: evidenceBytes > 0 }
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n')
  if (evidenceBytes <= 0) fail('evidence artifact is empty')
}

function assertRepositoryBestPipelineShape(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('repository-best-pipeline payload is not an object')
  if (payload.scenario !== 'e2e-python-reopen-paper-repository-refit') throw new Error(`unexpected scenario: ${payload.scenario}`)
  const refit = payload.refit
  if (!refit || refit.force_best_refit !== true) throw new Error('repository-best-pipeline does not declare force_best_refit=true')
  if (refit.executed !== true || refit.status !== 'passed') throw new Error('repository-best-pipeline lacks executed Python refit evidence')
  const handoff = payload.repository_handoff
  const descriptor = handoff?.descriptor
  const recipe = handoff?.reopened_recipe
  const pipeline = recipe?.pipeline
  if (!handoff || !descriptor || !recipe || !Array.isArray(pipeline)) throw new Error('repository handoff descriptor/recipe is incomplete')
  const classSequence = []
  let nComponents = null
  for (const step of pipeline) {
    if (step?.class) classSequence.push(step.class)
    if (step?.model?.class) {
      classSequence.push(step.model.class)
      nComponents = Number(step.model.params?.n_components)
    }
  }
  const supported = classSequence.length === 2 && classSequence[0] === 'nirs4all.operators.transforms.StandardNormalVariate' && classSequence[1] === 'sklearn.cross_decomposition.PLSRegression'
  if (!supported) throw new Error(`Web/WASM repository-best-pipeline smoke only supports SNV + PLS handoffs, got ${classSequence.join(' -> ')}`)
  if (!Number.isInteger(nComponents) || nComponents < 1) throw new Error(`invalid repository PLS n_components: ${nComponents}`)
  return {
    scenario: payload.scenario,
    pipeline_id: handoff.pipeline_id,
    descriptor_id: descriptor.id,
    descriptor_name: descriptor.name,
    force_best_refit: refit.force_best_refit,
    refit_executed: refit.executed,
    refit_prediction_count: refit.prediction_count,
    recipe_step_count: pipeline.length,
    recipe_class_sequence: classSequence,
    n_components: nComponents,
    source_python_bundle_sha256: payload.python_reopen?.bundle_sha256 ?? null,
  }
}

async function loadDatasetAndOpenPipeline() {
  await page.locator('input[type=file][accept*=".csv"]').first().setInputFiles(evidence.uploaded_dataset_files.map((file) => join(DATASET_DIR, file)))
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  evidence.dataset_badge = ((await page.locator('text=/samples ×/').first().textContent()) || '').trim()
  if (!evidence.dataset_badge || !evidence.dataset_badge.includes(DATASET_EXPECTED_BADGE)) {
    throw new Error(`repository dataset did not render the expected badge ${JSON.stringify(DATASET_EXPECTED_BADGE)}: ${evidence.dataset_badge}`)
  }
  await page.locator('[data-step="pipeline"]').click()
}

async function importRepositoryBestPipeline() {
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(REPOSITORY_BEST_PIPELINE_PATH)
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector('input[aria-label="Pipeline name"]')
      return input instanceof HTMLInputElement && input.value === expected
    },
    evidence.repository_best_pipeline_shape.descriptor_name,
    { timeout: 15000 },
  )
  evidence.imported_pipeline_name = evidence.repository_best_pipeline_shape.descriptor_name
  evidence.imported_pipeline_shape = await page.evaluate(() => {
    const runButton = Array.from(document.querySelectorAll('button')).find((node) => /Run pipeline/i.test(node.textContent || ''))
    const body = document.body.innerText || ''
    return {
      run_button_present: Boolean(runButton),
      mentions_snv: /Standard\s*Normal\s*Variate|SNV/i.test(body),
      mentions_pls: /PLS/i.test(body),
    }
  })
  if (!evidence.imported_pipeline_shape.run_button_present) throw new Error('imported repository-best-pipeline did not expose a Run pipeline button')
}

async function probeClientOnlyOracleSurface(page) {
  return await page.evaluate(() => {
    const resourceUrls = performance.getEntriesByType('resource').map((entry) => entry.name)
    return {
      status: 'browser_client_only_probe',
      protocol: location.protocol,
      node_process_present: typeof globalThis.process === 'object' && Boolean(globalThis.process?.versions?.node),
      commonjs_require_present: typeof globalThis.require === 'function',
      python_bridge_present: typeof globalThis.__n4aPythonOracle === 'function',
      backend_api_request_count: resourceUrls.filter((url) => /\/api(?:\/|$|\?)/i.test(url)).length,
    }
  })
}

function assertRuntime(runtime) {
  if (!runtime || runtime.engine !== 'dag-ml-wasm + libn4m') throw new Error(`repository-best-pipeline did not use Web/WASM engine: ${runtime?.engine}`)
  if (runtime.lineage_engine !== 'dag-ml-wasm' || runtime.lineage_compiled !== true || runtime.lineage_executed !== true) {
    throw new Error('repository-best-pipeline did not compile and execute through dag-ml')
  }
  if (runtime.scheduler_fallback) throw new Error('repository-best-pipeline used a scheduler fallback')
  const provider = runtime.data_provider
  if (!provider || provider.layer !== 'dag-ml-data' || provider.status !== 'materialized') throw new Error('dag-ml-data provider was not materialized')
}

async function collectFoldAssignments(page) {
  return await page.evaluate(() => {
    const run = window.__n4aLastRun
    return (run?.folds ?? []).map((fold) => ({
      id: fold.id ?? null,
      name: fold.name ?? null,
      sample_ids: (fold.predictions ?? []).map((row) => String(row.sampleId)),
    }))
  })
}

function assertFoldAssignments(folds, summary) {
  if (!Array.isArray(folds) || folds.length === 0) throw new Error('repository-best-pipeline did not expose fold assignments')
  const expected = new Set((summary?.predictions ?? []).map((row) => row.sample_id))
  if (expected.size === 0) throw new Error('repository-best-pipeline has no prediction sample ids for fold coverage')
  const seen = new Set()
  for (const fold of folds) {
    if (!Array.isArray(fold.sample_ids) || fold.sample_ids.length === 0) throw new Error(`empty validation fold ${fold.id ?? fold.name}`)
    for (const sampleId of fold.sample_ids) {
      if (!expected.has(sampleId)) throw new Error(`fold contains unknown sample id ${sampleId}`)
      if (seen.has(sampleId)) throw new Error(`fold contains duplicate validation sample id ${sampleId}`)
      seen.add(sampleId)
    }
  }
  if (seen.size !== expected.size) throw new Error(`folds covered ${seen.size}/${expected.size} prediction samples`)
  return {
    fold_count: folds.length,
    sample_count: seen.size,
    fold_sizes: folds.map((fold) => fold.sample_ids.length),
    assignment_sha256: sha256Text(JSON.stringify(folds.map((fold) => fold.sample_ids))),
  }
}

const PYTHON_ORACLE_SCRIPT = String.raw`
import csv
import json
import math
import platform
import sys
from pathlib import Path

import numpy as np
from sklearn.cross_decomposition import PLSRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from nirs4all.operators.transforms import StandardNormalVariate

fixture_dir = Path(sys.argv[1])
artifact_path = Path(sys.argv[2])
folds = json.loads(sys.argv[3])
artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
pipeline = artifact["repository_handoff"]["reopened_recipe"]["pipeline"]
if len(pipeline) != 2 or pipeline[0].get("class") != "nirs4all.operators.transforms.StandardNormalVariate":
    raise AssertionError("repository-best-pipeline oracle only covers SNV + PLS handoffs")
model = pipeline[1].get("model") or {}
if model.get("class") != "sklearn.cross_decomposition.PLSRegression":
    raise AssertionError(f"unsupported repository-best-pipeline model: {model.get('class')}")
n_components = int((model.get("params") or {}).get("n_components", 2))

raw_x = np.loadtxt(fixture_dir / "repository_X_train.csv", delimiter=",", dtype=np.float64)
axis = raw_x[0].astype(float).tolist()
X = raw_x[1:].astype(np.float64)
y = np.loadtxt(fixture_dir / "repository_y_train.csv", delimiter=",", skiprows=1, dtype=np.float64)
with (fixture_dir / "repository_metadata.csv").open(newline="", encoding="utf-8") as handle:
    metadata_sample_ids = [row["sample_id"] for row in csv.DictReader(handle)]
synthetic_sample_ids = [f"train-{index}" for index in range(X.shape[0])]

if X.shape[0] != y.shape[0] or len(metadata_sample_ids) != y.shape[0]:
    raise AssertionError(f"fixture row mismatch: X={X.shape[0]} y={y.shape[0]} metadata_ids={len(metadata_sample_ids)}")
fold_sample_ids = {sample_id for fold in folds for sample_id in fold["sample_ids"]}
if fold_sample_ids <= set(metadata_sample_ids):
    sample_ids = metadata_sample_ids
    sample_id_source = "metadata.sample_id"
elif fold_sample_ids <= set(synthetic_sample_ids):
    sample_ids = synthetic_sample_ids
    sample_id_source = "studio-lite-csv-builder-synthetic-train-index"
else:
    missing = sorted(fold_sample_ids - set(metadata_sample_ids) - set(synthetic_sample_ids))
    raise AssertionError(f"fold sample ids do not match metadata or synthetic ids: {missing[:10]}")
index_by_sample_id = {sample_id: index for index, sample_id in enumerate(sample_ids)}
fold_indices = []
seen_validation = set()
for fold in folds:
    val_idx = [index_by_sample_id[sample_id] for sample_id in fold["sample_ids"]]
    if not val_idx:
        raise AssertionError(f"empty validation fold in {fold}")
    for index in val_idx:
        if index in seen_validation:
            raise AssertionError(f"duplicate validation index {index}")
        seen_validation.add(index)
    val_set = set(val_idx)
    train_idx = [index for index in range(X.shape[0]) if index not in val_set]
    fold_indices.append((np.asarray(train_idx, dtype=int), np.asarray(val_idx, dtype=int)))
if seen_validation != set(range(X.shape[0])):
    raise AssertionError(f"fold coverage mismatch: {sorted(seen_validation)}")

predictions_by_index = {}
for train_idx, val_idx in fold_indices:
    transform = StandardNormalVariate()
    X_train = transform.fit_transform(X[train_idx], y[train_idx])
    X_val = transform.transform(X[val_idx])
    regressor = PLSRegression(n_components=n_components)
    regressor.fit(X_train, y[train_idx])
    pred = np.asarray(regressor.predict(X_val), dtype=np.float64).reshape(-1)
    for index, value in zip(val_idx.tolist(), pred.tolist()):
        predictions_by_index[int(index)] = float(value)

predicted = np.asarray([predictions_by_index[index] for index in range(X.shape[0])], dtype=np.float64)
residual = predicted - y
payload = {
    "status": "available",
    "source": "full Python nirs4all StandardNormalVariate + sklearn.cross_decomposition.PLSRegression over Web/WASM emitted folds",
    "python": platform.python_version(),
    "repository_artifact_sha256": __import__("hashlib").sha256(artifact_path.read_bytes()).hexdigest(),
    "dataset": {
        "rows": int(X.shape[0]),
        "cols": int(X.shape[1]),
        "axis": axis,
        "sample_id_source": sample_id_source,
        "sample_ids_sha256": __import__("hashlib").sha256(json.dumps(sample_ids, separators=(",", ":")).encode("utf-8")).hexdigest(),
        "metadata_sample_ids_sha256": __import__("hashlib").sha256(json.dumps(metadata_sample_ids, separators=(",", ":")).encode("utf-8")).hexdigest(),
    },
    "pipeline": {
        "steps": ["StandardNormalVariate"],
        "model": "PLS",
        "n_components": n_components,
        "fold_source": "browser_dag_ml_run_result",
    },
    "cv": {
        "metrics": {
            "n": int(y.shape[0]),
            "rmse": float(math.sqrt(mean_squared_error(y, predicted))),
            "mae": float(mean_absolute_error(y, predicted)),
            "r2": float(r2_score(y, predicted)),
        },
        "predictions": [
            {
                "sample_id": sample_ids[index],
                "actual": float(y[index]),
                "predicted": float(predicted[index]),
                "residual": float(residual[index]),
            }
            for index in range(X.shape[0])
        ],
    },
    "tolerances": {
        "predictions_abs": 1e-5,
        "metrics_abs": 1e-5,
    },
}
print(json.dumps(payload, sort_keys=True))
`

async function computePythonOracle(foldAssignments) {
  const requested = process.env.N4A_WEB_PYTHON ? [process.env.N4A_WEB_PYTHON] : []
  const candidates = [...new Set([...requested, 'python3.11', 'python3'])]
  const attempted = []
  for (const executable of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(executable, ['-c', PYTHON_ORACLE_SCRIPT, DATASET_DIR, REPOSITORY_BEST_PIPELINE_PATH, JSON.stringify(foldAssignments)], {
        cwd: WORKSPACE_ROOT,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONPATH: [NIRS4ALL_PYTHON_SRC, process.env.PYTHONPATH].filter(Boolean).join(':'),
        },
      })
      return { ...JSON.parse(stdout), executable, stderr: stderr.trim() || null }
    } catch (error) {
      attempted.push({
        executable,
        error: error instanceof Error ? error.message : String(error),
        stderr: typeof error?.stderr === 'string' ? error.stderr.trim().slice(0, 800) : null,
      })
    }
  }
  return {
    status: 'not_available',
    reason: 'python_oracle_harness_unavailable',
    detail: 'The app remains client-side only; Python is only a smoke-test oracle and could not run in this environment.',
    attempted,
  }
}

function comparePythonOracle(webSummary, oracle, tolerance = oracle?.tolerances?.predictions_abs ?? 1e-5) {
  if (!webSummary?.predictions?.length) throw new Error('missing Web/WASM prediction summary for Python oracle comparison')
  if (oracle?.status !== 'available') throw new Error(`Python oracle is not available: ${oracle?.reason ?? oracle?.status}`)
  const expectedById = new Map(oracle.cv.predictions.map((row) => [row.sample_id, row]))
  let maxAbsDelta = 0
  for (const row of webSummary.predictions) {
    const expected = expectedById.get(row.sample_id)
    if (!expected) throw new Error(`Python oracle has no row for Web sample id ${row.sample_id}`)
    for (const key of ['actual', 'predicted', 'residual']) {
      const delta = Math.abs(row[key] - expected[key])
      if (!Number.isFinite(delta)) throw new Error(`non-finite Python oracle ${key} comparison for ${row.sample_id}`)
      maxAbsDelta = Math.max(maxAbsDelta, delta)
      if (delta > tolerance) throw new Error(`Python oracle ${key} mismatch for ${row.sample_id}: Web ${row[key]} != Python ${expected[key]} (delta ${delta})`)
    }
  }
  const metricTolerance = oracle.tolerances?.metrics_abs ?? tolerance
  const comparedMetrics = []
  for (const [key, expected] of Object.entries(oracle.cv.metrics ?? {})) {
    if (!(key in (webSummary.metrics ?? {}))) throw new Error(`Web/WASM metric ${key} missing for Python oracle comparison`)
    const delta = Math.abs(webSummary.metrics[key] - expected)
    maxAbsDelta = Math.max(maxAbsDelta, delta)
    comparedMetrics.push(key)
    if (delta > metricTolerance) throw new Error(`Python oracle metric ${key} mismatch: Web ${webSummary.metrics[key]} != Python ${expected} (delta ${delta})`)
  }
  return {
    status: 'matched',
    compared_rows: webSummary.predictions.length,
    compared_metrics: comparedMetrics.sort(),
    predictions_tolerance: tolerance,
    metrics_tolerance: metricTolerance,
    max_abs_delta: maxAbsDelta,
  }
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ acceptDownloads: true })
page = await ctx.newPage()

page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/.test(r.url())) bad404.push(`${r.status()} ${r.url()}`)
})
page.on('dialog', async (dialog) => {
  dialogs.push(dialog.message())
  await dialog.dismiss()
})

try {
  const bestPipelineHash = await sha256File(REPOSITORY_BEST_PIPELINE_PATH)
  evidence.repository_best_pipeline_bytes = bestPipelineHash.bytes
  evidence.repository_best_pipeline_sha256 = bestPipelineHash.sha256
  if (bestPipelineHash.bytes <= 0) throw new Error('repository-best-pipeline artifact is empty')
  evidence.repository_best_pipeline_shape = assertRepositoryBestPipelineShape(await readJson(REPOSITORY_BEST_PIPELINE_PATH))

  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadDatasetAndOpenPipeline()
  await importRepositoryBestPipeline()
  console.log(`✓ repository-best-pipeline descriptor imported (${evidence.repository_best_pipeline_shape.pipeline_id})`)
  console.log(`✓ uploaded repository dataset → "${evidence.dataset_badge}"`)

  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.executed_imported_pipeline = true
  evidence.results_panels = await assertResultsPanels(page)
  evidence.runtime = await collectRuntimeEvidence(page)
  assertRuntime(evidence.runtime)
  evidence.client_only_oracle_probe = await probeClientOnlyOracleSurface(page)
  if (evidence.client_only_oracle_probe.node_process_present) fail('browser page unexpectedly exposes a Node process runtime')
  if (evidence.client_only_oracle_probe.python_bridge_present) fail('browser page unexpectedly exposes a Python oracle bridge')
  if (evidence.client_only_oracle_probe.backend_api_request_count !== 0) fail(`browser app made ${evidence.client_only_oracle_probe.backend_api_request_count} backend API request(s)`)
  evidence.prediction_summary = await runPredictionSummary(page)
  if (!evidence.prediction_summary?.prediction_count) fail('repository-best-pipeline did not expose numeric predictions')
  evidence.fold_assignments = await collectFoldAssignments(page)
  evidence.fold_assignment_assertions = assertFoldAssignments(evidence.fold_assignments, evidence.prediction_summary)

  evidence.python_oracle = await computePythonOracle(evidence.fold_assignments)
  if (evidence.python_oracle.status !== 'available') {
    throw new Error(`Python oracle is required for repository-best-pipeline parity but was unavailable: ${evidence.python_oracle.detail ?? evidence.python_oracle.reason}`)
  }
  evidence.python_oracle_comparison = comparePythonOracle(evidence.prediction_summary, evidence.python_oracle)
  console.log(`✓ Web/WASM imported handoff matches Python oracle (max Δ ${evidence.python_oracle_comparison.max_abs_delta})`)

  if (dialogs.length) fail(`unexpected dialog(s): ${dialogs.join(' | ')}`)
  if (bad404.length) fail(`${bad404.length} failed request(s): ${bad404.slice(0, 4).join(' | ')}`)
  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  if (!process.exitCode && !errors.length && !bad404.length && !dialogs.length) {
    evidence.status = 'passed'
    console.log('✓ no JS console errors')
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
  for (const dialog of dialogs.slice(0, 4)) console.error('   dialog: ' + dialog)
} finally {
  await writeEvidence()
  await browser.close()
}

console.log(process.exitCode ? 'REPOSITORY-BEST-PIPELINE SMOKE FAILED' : 'REPOSITORY-BEST-PIPELINE SMOKE PASSED')
