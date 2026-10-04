import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4345/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const execFileAsync = promisify(execFile)
const PYTHON = process.env.N4A_PYTHON || 'python3.11'
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || ''
const FAMILY_FILE = process.env.PIPELINE_FAMILY || (ARTIFACTS_DIR ? join(ARTIFACTS_DIR, 'pipeline-family.json') : '')
const CANDIDATE_FILE = process.env.PIPELINE_CANDIDATE || (ARTIFACTS_DIR ? join(ARTIFACTS_DIR, 'pipeline-candidate.n4a.json') : '')
const DATASET_FILE = process.env.WEB_DATASET || (ARTIFACTS_DIR ? join(ARTIFACTS_DIR, 'dataset-web-oracle.json') : '')

const pythonLedger = {
  schema_version: 'n4a.e2e.python_vs_dagml_perf/v1',
  status: 'failed',
  source: FAMILY_FILE,
}

const runtimeLedger = {
  schema_version: 'n4a.e2e.web_runtime_perf/v1',
  status: 'failed',
  app_url: APP_URL,
  source: FAMILY_FILE,
  candidate_source: CANDIDATE_FILE,
  dataset_source: DATASET_FILE,
  web: {
    backend: null,
    pipeline_run_seconds: null,
    rendered_cv_scores: false,
    dag_ml: null,
    candidate_imported: false,
    selected_candidate: null,
  },
  prediction_comparison: null,
  studio: {
    included_in_gate: false,
    reason: 'nirs4all-studio production release is outside this Web-only performance gate; add a dedicated Studio runtime entrypoint before treating this as Studio coverage.',
  },
  console_errors: [],
}

function fail(message) {
  console.error('x ' + message)
  pythonLedger.failure = message
  runtimeLedger.failure = message
  process.exitCode = 1
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function assertNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return value
}

async function pythonStableSha256(path, label) {
  const script = [
    'import hashlib, json, pathlib, sys',
    'payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    'encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")',
    'print(hashlib.sha256(encoded).hexdigest())',
  ].join('\n')
  const candidates = PYTHON === 'python3.11' ? ['python3.11', 'python3'] : [PYTHON]
  const failures = []
  for (const python of candidates) {
    try {
      const { stdout } = await execFileAsync(python, ['-c', script, path], { maxBuffer: 16 * 1024 * 1024 })
      const sha256 = stdout.trim()
      if (/^[a-f0-9]{64}$/.test(sha256)) return sha256
      throw new Error(`unexpected hash output ${JSON.stringify(stdout)}`)
    } catch (error) {
      failures.push(`${python}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`could not compute Python-stable hash for ${label}: ${failures.join(' | ')}`)
}

async function readJson(path, label) {
  const text = await readFile(path, 'utf8')
  return { value: JSON.parse(text), sha256: await pythonStableSha256(path, label), textSha256: createHash('sha256').update(text).digest('hex') }
}

function e2eUrl(base) {
  const url = new URL(base)
  url.searchParams.set('n4a_e2e', '1')
  return url.toString()
}

function validateFamily(value) {
  const family = assertRecord(value, 'pipeline-family')
  if (family.status !== 'passed') throw new Error(`pipeline-family status must be passed, got ${JSON.stringify(family.status)}`)
  const parity = assertRecord(family.parity, 'pipeline-family.parity')
  const tolerance = assertNumber(parity.tolerance, 'parity.tolerance')
  const predictionAbsMax = assertNumber(parity.prediction_abs_max, 'parity.prediction_abs_max')
  const bestRmseAbs = assertNumber(parity.best_rmse_abs, 'parity.best_rmse_abs')
  if (predictionAbsMax > tolerance) throw new Error(`prediction_abs_max ${predictionAbsMax} exceeds ${tolerance}`)
  if (bestRmseAbs > 1e-9) throw new Error(`best_rmse_abs ${bestRmseAbs} exceeds 1e-9`)
  const oracle = assertRecord(family.prediction_oracle, 'pipeline-family.prediction_oracle')
  if (oracle.status !== 'passed') throw new Error(`prediction_oracle status must be passed, got ${JSON.stringify(oracle.status)}`)
  if (!Array.isArray(oracle.rows) || oracle.rows.length === 0) throw new Error('prediction_oracle.rows must be non-empty')
  const webDataset = assertRecord(family.web_dataset, 'pipeline-family.web_dataset')
  if (webDataset.path !== 'dataset-web-oracle.json') throw new Error(`unexpected web dataset path ${JSON.stringify(webDataset.path)}`)
  const performance = assertRecord(family.performance, 'pipeline-family.performance')
  assertNumber(performance.legacy_seconds, 'performance.legacy_seconds')
  assertNumber(performance.dag_ml_seconds, 'performance.dag_ml_seconds')
  return family
}

function validateCandidate(candidate, family, candidateSha256) {
  const value = assertRecord(candidate, 'pipeline-candidate')
  if (value.schema_version !== 'n4a.e2e.generated_pipeline_candidate.v1') throw new Error(`unexpected candidate schema ${JSON.stringify(value.schema_version)}`)
  if (value.scenario_id !== 'e2e-pipeline-generation-performance-compare') throw new Error(`unexpected candidate scenario ${JSON.stringify(value.scenario_id)}`)
  if (value.status !== 'passed') throw new Error(`pipeline-candidate status must be passed, got ${JSON.stringify(value.status)}`)
  if (candidateSha256 !== family.python_open_pipeline?.candidate_sha256) {
    throw new Error(`candidate sha256 ${candidateSha256} does not match python_open_pipeline.candidate_sha256 ${family.python_open_pipeline?.candidate_sha256}`)
  }
  if (!Array.isArray(value.pipeline) || value.pipeline.length !== 3) throw new Error('expected generated candidate pipeline with SNV, split, and model steps')
  if (!Array.isArray(value.variants) || value.variants.length === 0) throw new Error('candidate variants must be non-empty')
  return value
}

function selectedZipChoice(family) {
  const choices = family.prediction_oracle?.selected?.generator_choices
  const selected = Array.isArray(choices) ? choices[0]?._zip_ : null
  const nComponents = selected?.n_components
  if (!Number.isInteger(nComponents) || nComponents < 1) throw new Error(`missing selected n_components in prediction oracle: ${JSON.stringify(choices)}`)
  if (selected.scale !== true) throw new Error(`selected candidate scale must be true for the current Web PLS runtime, got ${JSON.stringify(selected.scale)}`)
  return { n_components: nComponents, scale: selected.scale }
}

function webDslFromSelectedCandidate(candidate, family) {
  const selected = selectedZipChoice(family)
  const classes = candidate.pipeline.map((step) => step.class || step.model?.class || '')
  if (!classes.some((name) => /StandardNormalVariate/.test(name))) throw new Error('candidate must include StandardNormalVariate')
  if (!classes.some((name) => /ShuffleSplit/.test(name))) throw new Error('candidate must include ShuffleSplit provenance')
  if (!classes.some((name) => /PLSRegression/.test(name))) throw new Error('candidate must include PLSRegression')
  return {
    name: 'e2e_generated_selected_candidate',
    steps: [{ id: 'snv', type: 'n4m:preprocessing.scatter.snv', params: {} }],
    cv: { folds: 3, seed: 42 },
    model: { id: 'pls', type: 'n4m:models.pls.pls_regression', params: { n_components: selected.n_components } },
  }
}

function assertRows(rows, expectedIds, dataset, label) {
  if (!Array.isArray(rows) || rows.length !== expectedIds.length) throw new Error(`${label} must cover exactly ${expectedIds.length} observations`)
  const ids = rows.map((row) => String(row.sampleId))
  if (new Set(ids).size !== ids.length || ids.some((id) => !expectedIds.includes(id))) throw new Error(`${label} has duplicate or out-of-scope observation IDs`)
  const bySample = new Map(dataset.sampleIds.map((id, i) => [String(id), i]))
  for (const row of rows) {
    const actual = assertNumber(row.actual, `${label}.actual`)
    assertNumber(row.predicted, `${label}.predicted`)
    assertNumber(row.residual, `${label}.residual`)
    const expectedTarget = dataset.y[bySample.get(String(row.sampleId))]
    // Targets cross the provider's JSON/serde binary64 boundary (features use a
    // typed buffer). Permit only binary64 round-trip error, not float32 rounding
    // or a different observation's target; prediction-oracle tolerances stay fixed.
    if (Math.abs(actual - expectedTarget) > Number.EPSILON * Math.max(1, Math.abs(expectedTarget))) throw new Error(`${label} target differs from its dataset observation`)
  }
}

function assertRegressionScore(node, label) {
  if (node.status !== 'completed') throw new Error(`${label} must be completed`)
  const rows = node.predictions
  const squared = rows.reduce((sum, row) => sum + (row.predicted - row.actual) ** 2, 0)
  const absolute = rows.reduce((sum, row) => sum + Math.abs(row.predicted - row.actual), 0)
  for (const [metric, expected] of [['rmse', Math.sqrt(squared / rows.length)], ['mae', absolute / rows.length]]) {
    const observed = assertNumber(node.metrics?.[metric], `${label}.${metric}`)
    if (Math.abs(observed - expected) > 1e-10 * Math.max(1, expected)) throw new Error(`${label}.${metric} differs from its independent observation-level score`)
  }
  if (node.metrics?.n !== rows.length) throw new Error(`${label}.n differs from its prediction count`)
}

const stableJson = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)

function assertDagMlRun(value, dataset, pipeline) {
  const run = assertRecord(value, 'window.__n4aLastRun')
  if (run.engine !== 'dag-ml-wasm + libn4m') throw new Error(`web run engine must be dag-ml-wasm + libn4m, got ${JSON.stringify(run.engine)}`)
  const lineage = assertRecord(run.lineage, 'web run lineage')
  if (lineage.engine !== 'dag-ml-wasm') throw new Error(`web lineage engine must be dag-ml-wasm, got ${JSON.stringify(lineage.engine)}`)
  if (lineage.compiled !== true) throw new Error('web dag-ml lineage must report compiled=true')
  // This selected SNV+PLS pipeline deliberately uses the documented browser
  // preprocessing CV chain over native folds, then native packaged REFIT/PREDICT.
  // executed describes the model-only CV scheduler; it must remain honest here.
  if (lineage.executed !== false) throw new Error('SNV+PLS lineage must report browser CV on native folds (executed=false)')
  if (lineage.refitExecuted !== true || lineage.refitProfile !== 'browser-composite-host-sidecar-v1') throw new Error('SNV+PLS requires native composite REFIT/PREDICT, not a direct-fit fallback')
  if (lineage.phase !== 'FIT_CV+REFIT+PREDICT' || lineage.variantCount !== 1 || lineage.folds !== pipeline.cv.folds) throw new Error('selected candidate phase, variant count or native fold count differs from the request')
  if (lineage.dataProvider?.layer !== 'dag-ml-data' || lineage.dataProvider.status !== 'materialized') throw new Error('native data provider must materialize the declared dataset')
  if (lineage.schedulerFallback) throw new Error('web dag-ml run used schedulerFallback')
  if (Array.isArray(run.diagnostics) && run.diagnostics.length > 0) throw new Error(`web dag-ml run reported diagnostics: ${JSON.stringify(run.diagnostics.slice(0, 3))}`)
  const cv = assertRecord(run.cv, 'web run cv')
  const cvPredictions = Array.isArray(cv.predictions) ? cv.predictions : []
  if (cvPredictions.length === 0) throw new Error('web dag-ml run produced no CV predictions')
  const refit = assertRecord(run.refit, 'web run refit')
  const refitPredictions = Array.isArray(refit.predictions) ? refit.predictions : []
  if (refitPredictions.length === 0) throw new Error('web dag-ml run produced no refit predictions')
  const variantCount = assertNumber(run.variantCount, 'web run variantCount')
  if (variantCount !== 1) throw new Error(`selected concrete candidate must run one variant, got ${variantCount}`)
  const trainRows = dataset.partitions.flatMap((partition, i) => partition === 'train' ? [i] : [])
  const trainIds = trainRows.map((i) => String(dataset.sampleIds[i]))
  const testIds = dataset.partitions.flatMap((partition, i) => partition === 'test' ? [String(dataset.sampleIds[i])] : [])
  assertRows(cvPredictions, trainIds, dataset, 'CV')
  assertRows(refitPredictions, testIds, dataset, 'REFIT Test')
  if (!Array.isArray(run.folds) || run.folds.length !== pipeline.cv.folds) throw new Error('CV must retain every requested native fold')
  const foldRows = run.folds.flatMap((fold) => {
    if (!Array.isArray(fold.predictions) || !fold.predictions.length) throw new Error('native validation fold must be nonempty')
    assertRows(fold.predictions, fold.predictions.map((row) => String(row.sampleId)), dataset, 'fold')
    assertRegressionScore(fold, 'fold')
    return fold.predictions
  })
  assertRows(foldRows, trainIds, dataset, 'native-fold CV universe')
  const ordered = (rows) => [...rows].sort((a, b) => String(a.sampleId).localeCompare(String(b.sampleId)))
  if (stableJson(ordered(foldRows)) !== stableJson(ordered(cvPredictions))) throw new Error('CV aggregate differs from the exact native-fold validation predictions')
  assertRegressionScore(cv, 'CV')
  assertRegressionScore(refit, 'REFIT Test')
  const nativeRefit = assertRecord(run.nativeRefit, 'fitted native REFIT state')
  const pkg = assertRecord(JSON.parse(nativeRefit.packageJson), 'native REFIT package')
  if (nativeRefit.schemaVersion !== 1 || pkg.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(pkg.package_fingerprint) || pkg.package_fingerprint !== lineage.packageFingerprint) throw new Error('native package fingerprint differs from REFIT lineage')
  const expectedFitIds = trainRows.map((i) => `s${i}`).sort()
  if (stableJson([...pkg.training_sample_ids].sort()) !== stableJson(expectedFitIds)) throw new Error('native package REFIT scope must contain exactly Train and no Test observation')
  if (pkg.execution_root_seed !== pipeline.cv.seed || stableJson(nativeRefit.targetNames) !== stableJson([dataset.targetName])) throw new Error('native package seed or target identity differs from the request')
  const plans = Object.values(pkg.effective_plan.node_plans)
  const concretePipeline = { ...pipeline }
  delete concretePipeline.cv
  if (plans.length !== 1 || stableJson(plans[0].params.web_pipeline) !== stableJson(concretePipeline)) throw new Error('native REFIT package did not fit the selected concrete SNV+PLS candidate')
  const artifact = pkg.artifacts.length === 1 ? pkg.artifacts[0].record.artifact : null
  if (!artifact || artifact.controller_id !== 'controller:web.pipeline' || artifact.id !== nativeRefit.artifactId || artifact.content_fingerprint !== nativeRefit.carrierSha256 || !/^[a-f0-9]{64}$/.test(nativeRefit.carrierSha256)) throw new Error('native REFIT package does not bind the actual fitted browser sidecar')
  if (pkg.outputs.length !== 1 || pkg.outputs[0].node_id !== pkg.artifacts[0].record.node_id || pkg.outputs[0].port_name !== 'oof') throw new Error('native PREDICT output must resolve the retained REFIT artifact')
  return {
    backend: run.engine,
    lineage: {
      engine: lineage.engine,
      compiled: lineage.compiled,
      executed: lineage.executed,
      cvProfile: 'browser-chain-on-native-folds',
      refitExecuted: lineage.refitExecuted,
      refitProfile: lineage.refitProfile,
      packageFingerprint: lineage.packageFingerprint,
      schedulerFallback: Boolean(lineage.schedulerFallback),
      phase: lineage.phase ?? null,
      variantCount: lineage.variantCount ?? null,
      folds: lineage.folds ?? null,
      dataProviderStatus: lineage.dataProvider?.status ?? null,
    },
    cv_predictions: cvPredictions.length,
    refit_predictions: refitPredictions.length,
    variantCount,
    refitPredictions,
  }
}

function comparePredictions(refitPredictions, oracle) {
  const bySample = new Map(refitPredictions.map((row) => [String(row.sampleId), row]))
  const tolerance = assertNumber(oracle.web_wasm_tolerance ?? oracle.tolerance, 'prediction_oracle.web_wasm_tolerance')
  if (tolerance > 5e-4) throw new Error(`web_wasm_tolerance ${tolerance} exceeds the Web/WASM strict gate limit 5e-4`)
  let maxAbsDelta = 0
  let maxActualDelta = 0
  let maxResidualDelta = 0
  const mismatches = []
  for (const expected of oracle.rows) {
    const actual = bySample.get(String(expected.sample_id))
    if (!actual) {
      mismatches.push({ sample_id: expected.sample_id, reason: 'missing_web_prediction' })
      continue
    }
    const predictedDelta = Math.abs(Number(actual.predicted) - Number(expected.dag_ml_predicted))
    const actualDelta = Math.abs(Number(actual.actual) - Number(expected.actual))
    const residualDelta = Math.abs(Number(actual.residual) - Number(expected.dag_ml_residual))
    maxAbsDelta = Math.max(maxAbsDelta, predictedDelta)
    maxActualDelta = Math.max(maxActualDelta, actualDelta)
    maxResidualDelta = Math.max(maxResidualDelta, residualDelta)
    if (predictedDelta > tolerance || actualDelta > tolerance || residualDelta > tolerance) {
      mismatches.push({ sample_id: expected.sample_id, predicted_delta: predictedDelta, actual_delta: actualDelta, residual_delta: residualDelta })
    }
  }
  const comparison = {
    status: mismatches.length === 0 ? 'passed' : 'failed',
    compared_rows: oracle.rows.length,
    web_rows: refitPredictions.length,
    tolerance,
    native_python_tolerance: oracle.tolerance,
    tolerance_source: oracle.web_wasm_tolerance == null ? 'native_python_tolerance' : 'web_wasm_tolerance',
    max_abs_delta: maxAbsDelta,
    max_actual_delta: maxActualDelta,
    max_residual_delta: maxResidualDelta,
    within_tolerance: mismatches.length === 0,
    mismatches: mismatches.slice(0, 10),
  }
  if (comparison.status !== 'passed') throw new Error(`Web/Python prediction comparison failed: ${JSON.stringify(comparison)}`)
  return comparison
}

async function writeEvidence() {
  if (!ARTIFACTS_DIR) return
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  await writeFile(join(ARTIFACTS_DIR, 'python-vs-dagml.json'), JSON.stringify(pythonLedger, null, 2) + '\n')
  await writeFile(join(ARTIFACTS_DIR, 'web-runtime.json'), JSON.stringify(runtimeLedger, null, 2) + '\n')
}

let browser
try {
  if (!ARTIFACTS_DIR) throw new Error('ARTIFACTS_DIR is required for performance comparison evidence')
  const { value: rawFamily, sha256: familySha256 } = await readJson(FAMILY_FILE, 'pipeline-family')
  const family = validateFamily(rawFamily)
  const { value: rawCandidate, sha256: candidateSha256 } = await readJson(CANDIDATE_FILE, 'pipeline-candidate')
  const candidate = validateCandidate(rawCandidate, family, candidateSha256)
  const { value: webDataset, sha256: datasetSha256 } = await readJson(DATASET_FILE, 'dataset-web-oracle')
  if (datasetSha256 !== family.web_dataset.sha256) throw new Error(`dataset sha256 ${datasetSha256} does not match ${family.web_dataset.sha256}`)
  const webDsl = webDslFromSelectedCandidate(candidate, family)

  pythonLedger.status = 'passed'
  pythonLedger.family_sha256 = familySha256
  pythonLedger.candidate_sha256 = candidateSha256
  pythonLedger.dataset_sha256 = datasetSha256
  pythonLedger.case = family.case
  pythonLedger.parity = family.parity
  pythonLedger.performance = family.performance
  pythonLedger.runs = family.runs
  pythonLedger.python_open_pipeline = family.python_open_pipeline
  pythonLedger.prediction_oracle = family.prediction_oracle
  pythonLedger.web_dataset = family.web_dataset

  runtimeLedger.family_sha256 = familySha256
  runtimeLedger.candidate_sha256 = candidateSha256
  runtimeLedger.dataset_sha256 = datasetSha256
  runtimeLedger.web.selected_candidate = selectedZipChoice(family)

  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push('PAGEERR: ' + error.message))

  await page.goto(e2eUrl(APP_URL), { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => typeof window.__n4aE2E?.runDatasetPipeline === 'function', { timeout: 10000 })

  const start = performance.now()
  const runSummary = await page.evaluate(
    async ({ dataset, pipeline }) => window.__n4aE2E.runDatasetPipeline({ dataset, pipeline }),
    { dataset: webDataset, pipeline: webDsl },
  )
  runtimeLedger.web.pipeline_run_seconds = (performance.now() - start) / 1000
  runtimeLedger.web.candidate_imported = true

  const observedRun = await page.evaluate(() => {
    const run = window.__n4aLastRun
    return run
      ? {
          engine: run.engine,
          lineage: run.lineage,
          cv: run.cv,
          refit: run.refit,
          variantCount: run.variantCount,
          diagnostics: run.diagnostics,
          folds: run.folds,
          nativeRefit: run.model?.state?.nativeRefit,
        }
      : null
  })
  // Persist genuine observations even when a scientific/lineage assertion fails.
  runtimeLedger.web.observed_run = observedRun
  const observedDagMl = assertDagMlRun(observedRun, webDataset, webDsl)
  runtimeLedger.web.backend = observedDagMl.backend
  runtimeLedger.web.rendered_cv_scores = observedDagMl.cv_predictions > 0
  runtimeLedger.web.dag_ml = {
    ...observedDagMl.lineage,
    cv_predictions: observedDagMl.cv_predictions,
    refit_predictions: observedDagMl.refit_predictions,
    variantCount: observedDagMl.variantCount,
    run_summary: runSummary,
  }
  const comparison = comparePredictions(observedDagMl.refitPredictions, family.prediction_oracle)
  runtimeLedger.prediction_comparison = comparison
  runtimeLedger.web.prediction_comparison = comparison

  if (!/by dag-ml/i.test((await page.textContent('body')) || '')) {
    throw new Error('expected a visible "by dag-ml" badge after the Web run')
  }

  if (errors.length) {
    runtimeLedger.console_errors = errors.slice(0, 10)
    throw new Error(`${errors.length} console error(s): ${errors.slice(0, 4).join(' | ')}`)
  }

  runtimeLedger.status = 'passed'
  console.log(`OK Python legacy/dag-ml parity ledger passed (${family.performance.verdict})`)
  console.log(`OK Web dag-ml WASM compared ${comparison.compared_rows} refit predictions in ${runtimeLedger.web.pipeline_run_seconds.toFixed(3)}s`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  if (browser) await browser.close()
  await writeEvidence()
}

console.log(process.exitCode ? 'PERFORMANCE-COMPARE SMOKE FAILED' : 'PERFORMANCE-COMPARE SMOKE PASSED')
