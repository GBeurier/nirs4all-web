// End-to-end pipeline repository smoke: upload a non-sample CSV dataset fixture,
// import a deterministic repository pipeline descriptor, execute it, reload into
// a fresh session, import the same descriptor again, and compare the rendered run.
// This validates the client-only repository artifact path with the real Web/WASM app.
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import {
  assertResultsPanels,
  collectRuntimeEvidence,
  compareRunPredictionSummaries,
  runPredictionSummary,
  sha256File,
} from './smoke-evidence-helpers.mjs'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4355/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const PIPELINE_NAME = 'Pipeline repository roundtrip'
const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(TEST_DIR, 'fixtures', 'pipeline-repository')
const MANIFEST_PATH = join(FIXTURE_DIR, 'manifest.json')
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(tmpdir(), 'n4a-web-pipeline-repository-smoke')
const WORKSPACE_ROOT = resolve(TEST_DIR, '..', '..', '..')
const NIRS4ALL_PYTHON_SRC = join(WORKSPACE_ROOT, 'nirs4all')
const execFileAsync = promisify(execFile)

const evidence = {
  schema_version: 'n4a.web.pipeline_repository_smoke/v1',
  status: 'failed',
  app_url: APP_URL,
  repository_manifest: null,
  repository_pipeline_id: null,
  repository_pipeline_id_stable: false,
  repository_dataset_id: null,
  repository_dataset_id_non_demo_sample: false,
  repository_descriptor_sha256: null,
  repository_descriptor_verified: false,
  repository_dataset_file_hashes: [],
  repository_dataset_files_sha256: null,
  repository_pipeline_artifact: null,
  repository_pipeline_bytes: null,
  repository_pipeline_sha256: null,
  repository_pipeline_shape: null,
  client_only_oracle_probe: null,
  provider_runtime_assertions: null,
  provider_runtime_comparison: null,
  python_open_pipeline: null,
  python_rerun_pipeline: null,
  python_oracle: null,
  python_oracle_comparison: null,
  imported_python_oracle_comparison: null,
  uploaded_dataset_files: [],
  dataset_badge: null,
  exported_pipeline_artifact: null,
  exported_pipeline_bytes: null,
  exported_pipeline_sha256: null,
  imported_pipeline_name: PIPELINE_NAME,
  executed_imported_pipeline: false,
  original_results_panels: null,
  imported_results_panels: null,
  original_runtime: null,
  imported_runtime: null,
  original_prediction_summary: null,
  imported_prediction_summary: null,
  original_fold_assignments: null,
  imported_fold_assignments: null,
  fold_assignment_comparison: null,
  prediction_comparison: null,
  console_error_count: 0,
  console_errors_absent: false,
  failed_request_count: 0,
  unexpected_dialog_count: 0,
  screenshot_artifact: null,
  evidence_artifact: null,
  gaps: [
    {
      id: 'app_preserved_repository_metadata',
      status: 'not_available_in_current_pipeline_dsl',
      detail: 'The app imports pure PipelineDSL JSON; repository pipeline_id and descriptor_sha256 are verified from the manifest fixture before import and recorded in evidence, but the editor does not preserve those fields in the DSL.',
    },
  ],
  console_errors: [],
  failed_requests: [],
  dialogs: [],
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
  const screenshotPath = join(ARTIFACTS_DIR, 'web-results.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const screenshotStats = await stat(screenshotPath)
  evidence.screenshot_artifact = { path: screenshotPath, bytes: screenshotStats.size, non_empty: screenshotStats.size > 0 }
  if (screenshotStats.size <= 0) {
    console.error('✗ screenshot artifact is empty')
    process.exitCode = 1
  }
  const evidencePath = join(ARTIFACTS_DIR, 'pipeline-repository-smoke.json')
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
  evidenceText = JSON.stringify(evidence, null, 2) + '\n'
  await writeFile(evidencePath, evidenceText)
  if (evidenceBytes <= 0) {
    console.error('✗ evidence artifact is empty')
    process.exitCode = 1
  }
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
const bad404 = []
const dialogs = []

page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/.test(r.url())) bad404.push(`${r.status()} ${r.url()}`)
})
page.on('dialog', async (d) => {
  dialogs.push(d.message())
  await d.dismiss()
})

const fail = (m) => {
  console.error('✗ ' + m)
  process.exitCode = 1
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

function isStableId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{4,127}$/.test(value)
}

function isNonDemoDatasetId(value) {
  return typeof value === 'string' && value.length > 0 && !/(^|[-_:./])(demo|sample)([-_:./]|$)/i.test(value)
}

function assertRepositoryPipelineShape(value) {
  if (!value || typeof value !== 'object') throw new Error('repository pipeline descriptor is not an object')
  if (value.name !== PIPELINE_NAME) throw new Error(`repository pipeline name mismatch: ${value.name}`)
  if (!Array.isArray(value.steps)) throw new Error('repository pipeline descriptor has no steps array')
  if (!value.model || typeof value.model !== 'object') throw new Error('repository pipeline descriptor has no model')
  if (!isStableId(value.model.id)) throw new Error(`repository model id is not stable: ${value.model.id}`)
  for (const step of value.steps) {
    if (!isStableId(step?.id)) throw new Error(`repository step id is not stable: ${step?.id}`)
  }
  if (!value.cv || typeof value.cv !== 'object' || !Number.isInteger(value.cv.folds) || value.cv.folds < 2) {
    throw new Error('repository pipeline descriptor has no concrete CV config')
  }
  return {
    name: value.name,
    step_count: value.steps.length,
    step_ids: value.steps.map((step) => step.id),
    model_id: value.model.id,
    model_type: value.model.type ?? null,
    cv_folds: value.cv.folds,
    cv_seed: value.cv.seed ?? null,
  }
}

function assertHexFingerprint(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} is not a stable sha256-like fingerprint: ${value}`)
  }
  return value
}

function assertProviderRuntime(runtime, label) {
  if (!runtime || typeof runtime !== 'object') throw new Error(`${label} runtime evidence is missing`)
  if (runtime.engine !== 'dag-ml-wasm + libn4m') throw new Error(`${label} did not use the served Web/WASM engine: ${runtime.engine}`)
  if (runtime.lineage_engine !== 'dag-ml-wasm') throw new Error(`${label} lineage engine mismatch: ${runtime.lineage_engine}`)
  if (runtime.lineage_compiled !== true || runtime.lineage_executed !== true) throw new Error(`${label} did not compile and execute through dag-ml`)
  if (runtime.scheduler_fallback) throw new Error(`${label} used a scheduler fallback`)
  if (runtime.diagnostics_count !== 0) throw new Error(`${label} emitted runtime diagnostics`)
  const provider = runtime.data_provider
  if (!provider || provider.layer !== 'dag-ml-data') throw new Error(`${label} has no dag-ml-data provider lineage`)
  if (provider.status !== 'materialized') throw new Error(`${label} dag-ml-data provider was not materialized: ${provider.status}`)
  if (provider.representation !== 'tabular_numeric') throw new Error(`${label} provider representation mismatch: ${provider.representation}`)
  if (typeof provider.version !== 'string' || provider.version.length === 0) throw new Error(`${label} provider version is missing`)
  const fingerprints = provider.fingerprints ?? {}
  const schema = assertHexFingerprint(fingerprints.schema, `${label} provider schema fingerprint`)
  const plan = assertHexFingerprint(fingerprints.plan, `${label} provider plan fingerprint`)
  const relation = assertHexFingerprint(fingerprints.relation, `${label} provider relation fingerprint`)
  const manifestFingerprints = runtime.rt_manifest?.fingerprints ?? {}
  if (manifestFingerprints.schema !== schema || manifestFingerprints.plan !== plan || manifestFingerprints.relation !== relation) {
    throw new Error(`${label} rt manifest fingerprints do not match provider lineage`)
  }
  return {
    label,
    engine: runtime.engine,
    lineage_engine: runtime.lineage_engine,
    provider_status: provider.status,
    provider_version: provider.version,
    representation: provider.representation,
    scheduler_fallback: false,
    diagnostics_count: runtime.diagnostics_count,
    fingerprints: { schema, plan, relation },
  }
}

function compareProviderRuntimes(reference, actual) {
  const ref = reference?.data_provider?.fingerprints ?? {}
  const got = actual?.data_provider?.fingerprints ?? {}
  const fields = ['schema', 'plan', 'relation']
  for (const field of fields) {
    if (ref[field] !== got[field]) throw new Error(`provider ${field} fingerprint changed across repository import: ${ref[field]} != ${got[field]}`)
  }
  return {
    compared_fields: fields,
    stable: true,
    fingerprints: Object.fromEntries(fields.map((field) => [field, ref[field]])),
  }
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

function assertFoldAssignments(folds, summary, label) {
  if (!Array.isArray(folds) || folds.length === 0) throw new Error(`${label} did not expose fold assignments`)
  const expected = new Set((summary?.predictions ?? []).map((row) => row.sample_id))
  if (expected.size === 0) throw new Error(`${label} has no prediction sample ids for fold coverage`)
  const seen = new Set()
  for (const fold of folds) {
    if (!Array.isArray(fold.sample_ids) || fold.sample_ids.length === 0) throw new Error(`${label} has an empty fold ${fold.id ?? fold.name}`)
    for (const sampleId of fold.sample_ids) {
      if (!expected.has(sampleId)) throw new Error(`${label} fold contains unknown sample id ${sampleId}`)
      if (seen.has(sampleId)) throw new Error(`${label} fold contains duplicate validation sample id ${sampleId}`)
      seen.add(sampleId)
    }
  }
  if (seen.size !== expected.size) throw new Error(`${label} folds covered ${seen.size}/${expected.size} prediction samples`)
  return {
    fold_count: folds.length,
    sample_count: seen.size,
    fold_sizes: folds.map((fold) => fold.sample_ids.length),
    assignment_sha256: sha256Text(JSON.stringify(folds.map((fold) => fold.sample_ids))),
  }
}

function compareFoldAssignments(reference, actual) {
  const left = JSON.stringify(reference.map((fold) => fold.sample_ids))
  const right = JSON.stringify(actual.map((fold) => fold.sample_ids))
  if (left !== right) throw new Error('fold assignments changed across repository import')
  return {
    stable: true,
    assignment_sha256: sha256Text(left),
    fold_count: reference.length,
  }
}

const PYTHON_ORACLE_SCRIPT = String.raw`
import csv
import hashlib
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
pipeline_path = Path(sys.argv[2])
folds = json.loads(sys.argv[3])
pipeline_bytes = pipeline_path.read_bytes()
pipeline_text = pipeline_bytes.decode("utf-8")
pipeline = json.loads(pipeline_text)
descriptor_sha256 = hashlib.sha256(pipeline_bytes).hexdigest()

raw_x = np.loadtxt(fixture_dir / "repository_X_train.csv", delimiter=",", dtype=np.float64)
axis = raw_x[0].astype(float).tolist()
X = raw_x[1:].astype(np.float64)
y = np.loadtxt(fixture_dir / "repository_y_train.csv", delimiter=",", skiprows=1, dtype=np.float64)
with (fixture_dir / "repository_metadata.csv").open(newline="", encoding="utf-8") as handle:
    metadata_sample_ids = [row["sample_id"] for row in csv.DictReader(handle)]
sample_ids = [f"train-{index}" for index in range(X.shape[0])]

if X.shape[0] != y.shape[0] or len(metadata_sample_ids) != y.shape[0]:
    raise AssertionError(f"fixture row mismatch: X={X.shape[0]} y={y.shape[0]} metadata_ids={len(metadata_sample_ids)}")
if pipeline.get("steps") != [{"id": "repo-snv", "type": "StandardNormalVariate", "params": {}}]:
    raise AssertionError("repository Python oracle only covers the deterministic SNV fixture")
model = pipeline.get("model") or {}
if model.get("type") != "PLS":
    raise AssertionError(f"repository Python oracle only covers PLS, got {model.get('type')}")
n_components = int((model.get("params") or {}).get("n_components", 2))
cv = pipeline.get("cv") or {}
n_splits = int(cv.get("folds", 4))
seed = int(cv.get("seed", 4242))
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
    train_idx = [index for index in range(X.shape[0]) if index not in set(val_idx)]
    fold_indices.append((np.asarray(train_idx, dtype=int), np.asarray(val_idx, dtype=int)))
if seen_validation != set(range(X.shape[0])):
    raise AssertionError(f"fold coverage mismatch: {sorted(seen_validation)}")

dataset_file_hashes = []
for name in ("repository_X_train.csv", "repository_y_train.csv", "repository_metadata.csv"):
    data = (fixture_dir / name).read_bytes()
    dataset_file_hashes.append({
        "file": name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
dataset_files_sha256 = hashlib.sha256(
    json.dumps(
        [[item["file"], item["bytes"], item["sha256"]] for item in dataset_file_hashes],
        separators=(",", ":"),
    ).encode("utf-8")
).hexdigest()
fold_assignment_sha256 = hashlib.sha256(
    json.dumps([fold["sample_ids"] for fold in folds], separators=(",", ":")).encode("utf-8")
).hexdigest()

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
rmse = float(math.sqrt(mean_squared_error(y, predicted)))
payload = {
    "status": "available",
    "source": "full Python nirs4all StandardNormalVariate + sklearn.cross_decomposition.PLSRegression over dag-ml emitted folds",
    "python": platform.python_version(),
    "open_pipeline": {
        "status": "passed",
        "pipeline_reopened": True,
        "descriptor_sha256": descriptor_sha256,
        "step_count": len(pipeline.get("steps", [])),
        "model": model.get("type"),
        "cv_folds": n_splits,
    },
    "rerun_pipeline": {
        "status": "passed",
        "executed": True,
        "prediction_rows": int(predicted.shape[0]),
        "finite_predictions": bool(np.isfinite(predicted).all()),
        "rmse": rmse,
        "dataset_files_sha256": dataset_files_sha256,
        "fold_assignment_sha256": fold_assignment_sha256,
    },
    "dataset": {
        "rows": int(X.shape[0]),
        "cols": int(X.shape[1]),
        "axis": axis,
        "dataset_file_hashes": dataset_file_hashes,
        "dataset_files_sha256": dataset_files_sha256,
        "sample_id_source": "studio-lite-csv-builder-synthetic-train-index",
        "sample_ids_sha256": __import__("hashlib").sha256(json.dumps(sample_ids, separators=(",", ":")).encode("utf-8")).hexdigest(),
        "metadata_sample_ids_sha256": __import__("hashlib").sha256(json.dumps(metadata_sample_ids, separators=(",", ":")).encode("utf-8")).hexdigest(),
    },
    "pipeline": {
        "steps": [step.get("type") for step in pipeline.get("steps", [])],
        "model": model.get("type"),
        "n_components": n_components,
        "cv_folds": n_splits,
        "cv_seed": seed,
        "fold_source": "browser_dag_ml_run_result",
    },
    "cv": {
        "metrics": {
            "n": int(y.shape[0]),
            "rmse": rmse,
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

async function computePythonOracle(repository, foldAssignments) {
  const requested = process.env.N4A_WEB_PYTHON ? [process.env.N4A_WEB_PYTHON] : []
  const candidates = [...new Set([...requested, 'python3.11', 'python3'])]
  const attempted = []
  for (const executable of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(executable, ['-c', PYTHON_ORACLE_SCRIPT, FIXTURE_DIR, repository.pipelinePath, JSON.stringify(foldAssignments)], {
        cwd: WORKSPACE_ROOT,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONPATH: [NIRS4ALL_PYTHON_SRC, process.env.PYTHONPATH].filter(Boolean).join(':'),
        },
      })
      const parsed = JSON.parse(stdout)
      return {
        ...parsed,
        executable,
        stderr: stderr.trim() || null,
      }
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
    detail: 'The browser app remains client-side only; Python is only a test-harness oracle. This environment could not run the Python 3.11 + nirs4all/sklearn oracle.',
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
      if (delta > tolerance) {
        throw new Error(`Python oracle ${key} mismatch for ${row.sample_id}: Web ${row[key]} != Python ${expected[key]} (delta ${delta})`)
      }
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

async function loadRepositoryFixture() {
  const manifest = await readJson(MANIFEST_PATH)
  evidence.repository_manifest = manifest
  evidence.repository_pipeline_id = manifest.pipeline_id ?? null
  evidence.repository_pipeline_id_stable = isStableId(manifest.pipeline_id)
  if (!evidence.repository_pipeline_id_stable) throw new Error(`repository pipeline_id is not stable: ${manifest.pipeline_id}`)

  evidence.repository_dataset_id = manifest.dataset_id ?? null
  evidence.repository_dataset_id_non_demo_sample = isNonDemoDatasetId(manifest.dataset_id)
  if (!evidence.repository_dataset_id_non_demo_sample) throw new Error(`repository dataset_id must not be demo/sample: ${manifest.dataset_id}`)

  const pipelinePath = join(FIXTURE_DIR, manifest.pipeline_file)
  const pipelineHash = await sha256File(pipelinePath)
  evidence.repository_pipeline_artifact = manifest.pipeline_file
  evidence.repository_pipeline_bytes = pipelineHash.bytes
  evidence.repository_pipeline_sha256 = pipelineHash.sha256
  evidence.repository_descriptor_sha256 = manifest.descriptor_sha256 ?? null
  evidence.repository_descriptor_verified = pipelineHash.sha256 === manifest.descriptor_sha256
  if (pipelineHash.bytes <= 0) throw new Error('repository pipeline descriptor is empty')
  if (!evidence.repository_descriptor_verified) {
    throw new Error(`repository descriptor_sha256 mismatch: manifest ${manifest.descriptor_sha256} != actual ${pipelineHash.sha256}`)
  }

  const pipeline = await readJson(pipelinePath)
  evidence.repository_pipeline_shape = assertRepositoryPipelineShape(pipeline)
  const datasetFiles = (manifest.dataset_files ?? []).map((file) => join(FIXTURE_DIR, file))
  if (datasetFiles.length === 0) throw new Error('repository manifest has no dataset_files')
  evidence.uploaded_dataset_files = manifest.dataset_files
  const datasetFileHashes = []
  for (let index = 0; index < datasetFiles.length; index += 1) {
    const hashed = await sha256File(datasetFiles[index])
    datasetFileHashes.push({
      file: manifest.dataset_files[index],
      bytes: hashed.bytes,
      sha256: hashed.sha256,
    })
  }
  evidence.repository_dataset_file_hashes = datasetFileHashes
  evidence.repository_dataset_files_sha256 = sha256Text(JSON.stringify(datasetFileHashes.map((item) => [item.file, item.bytes, item.sha256])))
  return { manifest, pipelinePath, datasetFiles }
}

async function loadRepositoryDatasetAndOpenPipeline() {
  await page.locator('input[type=file][accept*=".csv"]').first().setInputFiles(repository.datasetFiles)
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  evidence.dataset_badge = ((await page.locator('text=/samples ×/').first().textContent()) || '').trim()
  if (!evidence.dataset_badge || !/20 samples × 6 wavelengths/.test(evidence.dataset_badge)) {
    throw new Error(`repository dataset did not render the expected non-sample badge: ${evidence.dataset_badge}`)
  }
  await page.locator('[data-step="pipeline"]').click()
}

async function importRepositoryPipeline() {
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(repository.pipelinePath)
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector('input[aria-label="Pipeline name"]')
      return input instanceof HTMLInputElement && input.value === expected
    },
    PIPELINE_NAME,
    { timeout: 15000 },
  )
}

const repository = await loadRepositoryFixture()

try {
  // 1. import a concrete repository pipeline artifact over a non-sample uploaded dataset.
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadRepositoryDatasetAndOpenPipeline()
  await importRepositoryPipeline()
  console.log(`✓ repository descriptor verified (${repository.manifest.pipeline_id}, ${repository.manifest.descriptor_sha256})`)
  console.log(`✓ uploaded repository dataset ${repository.manifest.dataset_id} → "${evidence.dataset_badge}"`)
  console.log('✓ imported repository pipeline artifact into the editor')

  // 2. export the imported pipeline once to prove the editor still emits a non-empty artifact.
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: /^Export/i }).click(),
  ]).then(([d]) => d)
  const pipelinePath = join(tmpdir(), 'pipeline-repository-roundtrip.pipeline.json')
  await download.saveAs(pipelinePath)
  evidence.exported_pipeline_artifact = download.suggestedFilename()
  const exportedHash = await sha256File(pipelinePath)
  evidence.exported_pipeline_bytes = exportedHash.bytes
  evidence.exported_pipeline_sha256 = exportedHash.sha256
  if (exportedHash.bytes <= 0) fail('exported pipeline artifact is empty')
  if (!/\.pipeline\.json$/.test(download.suggestedFilename())) fail('exported file is not a .pipeline.json artifact')
  else console.log(`✓ exported pipeline artifact → ${download.suggestedFilename()}`)
  const exportedJson = await readFile(pipelinePath, 'utf8')
  if (sha256Text(exportedJson) !== exportedHash.sha256) fail('exported pipeline artifact hash is not reproducible')

  // 3. run the repository-imported pipeline once so the fresh import has a numeric baseline.
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.original_results_panels = await assertResultsPanels(page)
  evidence.original_runtime = await collectRuntimeEvidence(page)
  evidence.client_only_oracle_probe = await probeClientOnlyOracleSurface(page)
  if (evidence.client_only_oracle_probe.node_process_present) fail('browser page unexpectedly exposes a Node process runtime')
  if (evidence.client_only_oracle_probe.python_bridge_present) fail('browser page unexpectedly exposes a Python oracle bridge')
  if (evidence.client_only_oracle_probe.backend_api_request_count !== 0) fail(`browser app made ${evidence.client_only_oracle_probe.backend_api_request_count} backend API request(s)`)
  const originalPredictions = await runPredictionSummary(page)
  evidence.original_prediction_summary = originalPredictions
  if (!originalPredictions?.prediction_count) fail('repository pipeline did not expose numeric predictions')
  else console.log(`✓ repository pipeline produced ${originalPredictions.prediction_count} comparable predictions`)
  evidence.original_fold_assignments = await collectFoldAssignments(page)
  const originalFolds = assertFoldAssignments(evidence.original_fold_assignments, originalPredictions, 'original repository run')
  const originalProvider = assertProviderRuntime(evidence.original_runtime, 'original repository run')
  evidence.provider_runtime_assertions = { original: originalProvider, imported: null, original_folds: originalFolds, imported_folds: null }
  console.log(`✓ dag-ml-data provider materialized (${originalProvider.provider_version}, ${originalProvider.representation})`)
  console.log(`✓ dag-ml exposed ${originalFolds.fold_count} deterministic CV folds`)

  evidence.python_oracle = await computePythonOracle(repository, evidence.original_fold_assignments)
  if (evidence.python_oracle.status !== 'available') {
    throw new Error(
      `Python oracle is required for this Web/WASM parity smoke but was unavailable: ${
        evidence.python_oracle.detail ?? evidence.python_oracle.reason
      }`,
    )
  }
  const openedPipeline = evidence.python_oracle.open_pipeline ?? null
  const rerunPipeline = evidence.python_oracle.rerun_pipeline ?? null
  evidence.python_open_pipeline = {
    ...(openedPipeline ?? {}),
    repository_pipeline_id: evidence.repository_pipeline_id,
    repository_dataset_id: evidence.repository_dataset_id,
    descriptor_hash_match: openedPipeline?.descriptor_sha256 === evidence.repository_descriptor_sha256,
  }
  if (evidence.python_open_pipeline.status !== 'passed') throw new Error('Python did not report a passed repository descriptor open')
  if (!evidence.python_open_pipeline.pipeline_reopened) throw new Error('Python did not reopen the repository pipeline descriptor')
  if (!evidence.python_open_pipeline.descriptor_hash_match) throw new Error('Python descriptor hash does not match the repository manifest')
  evidence.python_rerun_pipeline = {
    ...(rerunPipeline ?? {}),
    repository_pipeline_id: evidence.repository_pipeline_id,
    repository_dataset_id: evidence.repository_dataset_id,
    dataset_hash_match: rerunPipeline?.dataset_files_sha256 === evidence.repository_dataset_files_sha256,
    python_fold_assignment_sha256: rerunPipeline?.fold_assignment_sha256,
    fold_assignment_sha256: originalFolds.assignment_sha256,
    fold_assignment_hash_match: rerunPipeline?.fold_assignment_sha256 === originalFolds.assignment_sha256,
  }
  if (evidence.python_rerun_pipeline.status !== 'passed') throw new Error('Python did not report a passed pipeline rerun')
  if (!evidence.python_rerun_pipeline.executed) throw new Error('Python did not execute the repository pipeline rerun')
  if (!evidence.python_rerun_pipeline.finite_predictions) throw new Error('Python repository rerun did not produce finite predictions')
  if (!evidence.python_rerun_pipeline.dataset_hash_match) throw new Error('Python repository rerun dataset hash does not match the uploaded files')
  if (!evidence.python_rerun_pipeline.fold_assignment_hash_match) throw new Error('Python repository rerun fold hash does not match dag-ml emitted folds')
  if (!(evidence.python_rerun_pipeline.prediction_rows > 0)) throw new Error('Python repository rerun did not produce prediction rows')
  evidence.python_oracle_comparison = comparePythonOracle(originalPredictions, evidence.python_oracle)
  console.log(`✓ Web/WASM CV predictions match Python oracle (max Δ ${evidence.python_oracle_comparison.max_abs_delta})`)

  // 4. reload the app fresh, re-upload the non-sample dataset, and import the repository pipeline JSON again.
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
  })
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })
  await loadRepositoryDatasetAndOpenPipeline()
  await importRepositoryPipeline()
  console.log('✓ imported repository pipeline artifact into a fresh session')

  // 5. run the imported pipeline to prove the artifact is actionable client-side.
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  evidence.executed_imported_pipeline = true
  evidence.imported_results_panels = await assertResultsPanels(page)
  evidence.imported_runtime = await collectRuntimeEvidence(page)
  const importedProvider = assertProviderRuntime(evidence.imported_runtime, 'imported repository run')
  evidence.provider_runtime_assertions.imported = importedProvider
  evidence.provider_runtime_comparison = compareProviderRuntimes(evidence.original_runtime, evidence.imported_runtime)
  const importedPredictions = await runPredictionSummary(page)
  evidence.imported_prediction_summary = importedPredictions
  evidence.imported_fold_assignments = await collectFoldAssignments(page)
  const importedFolds = assertFoldAssignments(evidence.imported_fold_assignments, importedPredictions, 'imported repository run')
  evidence.provider_runtime_assertions.imported_folds = importedFolds
  evidence.fold_assignment_comparison = compareFoldAssignments(evidence.original_fold_assignments, evidence.imported_fold_assignments)
  evidence.prediction_comparison = compareRunPredictionSummaries(originalPredictions, importedPredictions)
  if (evidence.python_oracle.status === 'available') {
    evidence.imported_python_oracle_comparison = comparePythonOracle(importedPredictions, evidence.python_oracle)
  }
  console.log('✓ imported pipeline executed to results')
  console.log('✓ provider fingerprints stayed stable across repository import')
  console.log(`✓ imported predictions match source run (max Δ ${evidence.prediction_comparison.max_abs_delta})`)

  if (dialogs.length) fail(`unexpected dialog(s): ${dialogs.join(' | ')}`)
  if (bad404.length) fail(`${bad404.length} failed request(s): ${bad404.slice(0, 4).join(' | ')}`)
  if (errors.length) fail(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  if (!process.exitCode && !errors.length && !bad404.length && !dialogs.length) {
    evidence.status = 'passed'
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
  for (const er of errors.slice(0, 6)) console.error('   console: ' + er)
  for (const d of dialogs.slice(0, 4)) console.error('   dialog: ' + d)
} finally {
  await writeEvidence()
  await browser.close()
}

console.log(process.exitCode ? 'PIPELINE-REPOSITORY SMOKE FAILED' : 'PIPELINE-REPOSITORY SMOKE PASSED')
