// B-018 runtime-fallback smoke.
//
// Served browser coverage has two parts:
//   1. A clean UI run must stay silent: native dag-ml badge present, fallback chip absent.
//   2. The real served module worker is driven directly with a loopback-only runtime
//      fault hook. A forced scheduler failure must either return a loud fallback
//      RunResult when allowFallback:true is sent, or return a typed
//      RtErrorException across the worker protocol when fallback is omitted/false.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APP_URL = process.env.SMOKE_URL || 'http://localhost:4317/'
const EXE = process.env.CHROME || '/usr/bin/google-chrome'
const FALLBACK_CHIP = 'CV: libn4m fallback'
const RT_SMOKE_CHANNEL = 'n4a:rt-fallback-smoke:v1'
const SCHEDULER_FAILURE = 'forced scheduler failure for served rt-fallback smoke'
const PYTHON_RUNTIME_SHAPE = JSON.parse(readFileSync(new URL('../src/engine/fixtures/runtime/python_rt_fixture_shape.v1.json', import.meta.url), 'utf8'))

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))

function fail(msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
}

const isFile = String(APP_URL).startsWith('file:')

const sorted = (values) => [...values].sort()

function assertKeys(label, value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} is not an object: ${JSON.stringify(value)}`)
    return
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has non-Python runtime key "${key}"`)
  }
  for (const key of required) {
    if (value[key] === undefined) fail(`${label} missing required Python runtime key "${key}"`)
  }
}

function assertRtErrorWire(label, value) {
  assertKeys(label, value, PYTHON_RUNTIME_SHAPE.rt_error.required_keys, PYTHON_RUNTIME_SHAPE.rt_error.optional_keys)
  if (value && typeof value === 'object') {
    if ('detail' in value) fail(`${label} leaked in-memory detail across the worker boundary`)
    if ('schema_version' in value) fail(`${label} incorrectly carries schema_version`)
  }
}

function assertRtResultWire(label, value, { expectedDiagnostics }) {
  assertKeys(label, value, PYTHON_RUNTIME_SHAPE.rt_result.required_keys, PYTHON_RUNTIME_SHAPE.rt_result.optional_keys)
  if (!value || typeof value !== 'object') return
  if (value.schema_version === 1) console.log(`✓ ${label} keeps schema_version=1`)
  else fail(`${label} did not keep schema_version=1: ${JSON.stringify(value?.schema_version)}`)

  if (sorted(Object.keys(value.manifest || {})).join('|') === sorted(PYTHON_RUNTIME_SHAPE.rt_result.manifest_keys).join('|')) {
    console.log(`✓ ${label} manifest keys match the Python runtime fixture`)
  } else {
    fail(`${label} manifest keys diverged: ${JSON.stringify(Object.keys(value.manifest || {}))}`)
  }

  for (const [i, report] of (value.reports || []).entries()) {
    assertKeys(`${label}.reports[${i}]`, report, PYTHON_RUNTIME_SHAPE.rt_result.report_required_keys, PYTHON_RUNTIME_SHAPE.rt_result.report_optional_keys)
  }
  for (const [i, prediction] of (value.predictions || []).entries()) {
    const keys = sorted(Object.keys(prediction || {}))
    if (keys.join('|') !== sorted(PYTHON_RUNTIME_SHAPE.rt_result.prediction_keys).join('|')) {
      fail(`${label}.predictions[${i}] keys diverged: ${JSON.stringify(keys)}`)
    }
  }

  const diagnostics = value.diagnostics || []
  if (diagnostics.length === expectedDiagnostics) console.log(`✓ ${label} carries ${expectedDiagnostics} wire diagnostic(s)`)
  else fail(`${label} diagnostics count ${diagnostics.length}, expected ${expectedDiagnostics}`)
  for (const [i, diagnostic] of diagnostics.entries()) assertRtErrorWire(`${label}.diagnostics[${i}]`, diagnostic)
}

async function findServedWorkerUrl() {
  const base = new URL(APP_URL)
  const htmlRes = await fetch(base)
  if (!htmlRes.ok) throw new Error(`could not fetch app html (${htmlRes.status})`)
  const html = await htmlRes.text()
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], base).href)
  for (const scriptUrl of scripts) {
    const res = await fetch(scriptUrl)
    if (!res.ok) continue
    const js = await res.text()
    const direct = js.match(/["'`](worker-[A-Za-z0-9_-]+\.js)["'`]/)
    if (direct) return new URL(direct[1], scriptUrl).href
    const nested = js.match(/["'`](assets\/worker-[A-Za-z0-9_-]+\.js)["'`]/)
    if (nested) return new URL(nested[1], base).href
  }
  throw new Error(`could not find worker asset in ${scripts.length} entry script(s)`)
}

async function runWorkerFault(workerUrl, { allowFallback } = {}) {
  return page.evaluate(
    async ({ workerUrl: workerUrlArg, channelName, schedulerFailure, allowFallback: allowFallbackArg }) => {
      const makeDataset = () => {
        const nSamples = 8
        const nFeatures = 4
        const X = new Float64Array(nSamples * nFeatures)
        const y = new Float64Array(nSamples)
        for (let i = 0; i < nSamples; i++) {
          y[i] = 1 + i * 0.55 + (i % 2) * 0.15
          for (let j = 0; j < nFeatures; j++) X[i * nFeatures + j] = (i + 1) * (j + 2) + j * 0.25 + (i % 3) * 0.1
        }
        return {
          X,
          y,
          nSamples,
          nFeatures,
          axis: [1100, 1200, 1300, 1400],
          axisUnit: 'nm',
          targetName: 'protein',
          taskType: 'regression',
          sampleIds: Array.from({ length: nSamples }, (_, i) => `rt-${i}`),
          partitions: Array.from({ length: nSamples }, () => 'train'),
        }
      }

      const dsl = {
        name: 'rt-fallback-smoke',
        steps: [],
        model: { id: 'pls', type: 'PLS', params: { n_components: 2 } },
        cv: { folds: 2, seed: 13 },
      }

      const channel = new BroadcastChannel(channelName)
      const setFault = () => channel.postMessage({ type: 'n4a-rt-smoke:set', failPlanning: null, failScheduler: schedulerFailure })
      setFault()
      const interval = setInterval(setFault, 25)
      const worker = new Worker(workerUrlArg, { type: 'module' })

      try {
        return await new Promise((resolve) => {
          const id = `rt-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const finish = (value) => {
            clearTimeout(timeout)
            resolve(value)
          }
          const timeout = setTimeout(() => finish({ ok: false, error: { name: 'TimeoutError', message: 'served worker fault run timed out' } }), 90000)
          worker.addEventListener('message', (ev) => {
            const msg = ev.data
            if (!msg || msg.id !== id) return
            if (msg.type === 'progress') return
            if (msg.type === 'result') {
              const result = msg.result
              const rtResult = msg.rtResult || null
              const lineage = result.lineage || {}
              const diagnostics = result.diagnostics || []
              const diag = diagnostics[0] || null
              finish({
                ok: true,
                engine: result.engine,
                hasCv: Boolean(result.cv),
                scoreMetric: result.scoreMetric,
                score: result.cv?.metrics?.[result.scoreMetric],
                schedulerFallback: Boolean(lineage.schedulerFallback),
                diagnosticsCount: diagnostics.length,
                rtResult,
                diagnostic: diag
                  ? {
                      verb: diag.verb,
                      cause: diag.cause,
                      message: diag.message,
                      mitigation: diag.mitigation,
                      hasDetail: Object.prototype.hasOwnProperty.call(diag, 'detail'),
                    }
                  : null,
              })
              return
            }
            if (msg.type === 'error') {
              finish({
                ok: false,
                error: {
                  name: msg.name,
                  message: msg.message,
                  rtError: msg.rtError || null,
                },
              })
            }
          })
          worker.addEventListener('error', (ev) => finish({ ok: false, error: { name: 'WorkerError', message: ev.message || 'worker failed' } }))
          setTimeout(() => worker.postMessage({ type: 'run', id, ds: makeDataset(), dsl, allowFallback: allowFallbackArg }), 150)
        })
      } finally {
        clearInterval(interval)
        channel.postMessage({ type: 'n4a-rt-smoke:clear' })
        channel.close()
        worker.terminate()
      }
    },
    { workerUrl, channelName: RT_SMOKE_CHANNEL, schedulerFailure: SCHEDULER_FAILURE, allowFallback },
  )
}

try {
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('text=nirs4all', { timeout: 10000 })

  // load the bundled regression sample, then run the default pipeline
  await page.locator('button').filter({ hasText: 'Corn protein' }).first().click()
  await page.waitForSelector('text=/samples ×/', { timeout: 20000 })
  await page.locator('[data-step="pipeline"]').click()
  await page.getByRole('button', { name: /Run pipeline/i }).click()
  await page.waitForSelector('text=/CV Scores/', { timeout: 45000 })
  console.log('✓ clean UI pipeline executed, results rendered')

  const body = (await page.textContent('body')) || ''

  // served build runs the native dag-ml scheduler; under file:// the JS backend is used (no badge/chip)
  if (!isFile) {
    if (/by dag-ml/i.test(body)) console.log('✓ clean native run (by dag-ml badge present)')
    else fail('expected a "by dag-ml" badge on the served build (clean native run)')
  }

  // the B-018 invariant: a clean run must NOT surface the fallback chip
  const chipCount = await page.locator(`text=${FALLBACK_CHIP}`).count()
  if (chipCount === 0) console.log('✓ no spurious fallback chip on a clean run (B-018 silent happy path)')
  else fail(`fallback chip "${FALLBACK_CHIP}" surfaced on a clean run (expected absent)`)

  if (!isFile) {
    const workerUrl = await findServedWorkerUrl()
    console.log(`✓ found served engine worker (${new URL(workerUrl).pathname})`)

    const strictDefault = await runWorkerFault(workerUrl)
    if (strictDefault.ok) {
      fail(`omitted allowFallback unexpectedly returned a RunResult: ${JSON.stringify(strictDefault)}`)
    } else if (
      strictDefault.error?.name === 'RtErrorException' &&
      strictDefault.error?.rtError?.verb === 'run' &&
      strictDefault.error?.rtError?.cause === 'runtime_error' &&
      strictDefault.error?.rtError?.message?.includes(SCHEDULER_FAILURE)
    ) {
      console.log('✓ omitted allowFallback returns a typed RtErrorException across the served worker')
      assertRtErrorWire('default-strict worker RtError', strictDefault.error.rtError)
    } else {
      fail(`omitted allowFallback did not return typed RtErrorException: ${JSON.stringify(strictDefault.error)}`)
    }

    const fallback = await runWorkerFault(workerUrl, { allowFallback: true })
    if (!fallback.ok) {
      fail(`forced scheduler fallback run failed: ${JSON.stringify(fallback.error)}`)
    } else {
      if (fallback.hasCv && Number.isFinite(fallback.score)) console.log(`✓ forced scheduler fallback returned finite ${fallback.scoreMetric}`)
      else fail(`forced scheduler fallback did not return finite CV score: ${JSON.stringify(fallback)}`)

      if (fallback.schedulerFallback) console.log('✓ forced scheduler failure flipped lineage.schedulerFallback')
      else fail(`forced scheduler fallback missing lineage.schedulerFallback: ${JSON.stringify(fallback)}`)

      if (fallback.diagnosticsCount === 1 && fallback.diagnostic?.verb === 'run' && fallback.diagnostic?.cause === 'runtime_error') {
        console.log('✓ fallback RunResult carries one typed RtError diagnostic')
      } else {
        fail(`unexpected fallback diagnostics: ${JSON.stringify(fallback.diagnostic)}`)
      }
      assertRtResultWire('forced fallback worker RtResult', fallback.rtResult, { expectedDiagnostics: 1 })
      const rtDiagnostic = fallback.rtResult?.diagnostics?.[0]
      if (rtDiagnostic?.verb === 'run' && rtDiagnostic?.cause === 'runtime_error' && rtDiagnostic?.message?.includes(SCHEDULER_FAILURE)) {
        console.log('✓ worker RtResult diagnostic preserves RtError verb/cause/message')
      } else {
        fail(`worker RtResult diagnostic lost typed error fields: ${JSON.stringify(rtDiagnostic)}`)
      }

      if (fallback.diagnostic?.message?.includes(SCHEDULER_FAILURE) && /libn4m chain/i.test(fallback.diagnostic?.mitigation || '')) {
        console.log('✓ RtError message and mitigation describe the scheduler fallback')
      } else {
        fail(`fallback diagnostic did not preserve message/mitigation: ${JSON.stringify(fallback.diagnostic)}`)
      }
    }

    const strict = await runWorkerFault(workerUrl, { allowFallback: false })
    if (strict.ok) {
      fail(`allowFallback:false unexpectedly returned a RunResult: ${JSON.stringify(strict)}`)
    } else if (
      strict.error?.name === 'RtErrorException' &&
      strict.error?.rtError?.verb === 'run' &&
      strict.error?.rtError?.cause === 'runtime_error' &&
      strict.error?.rtError?.message?.includes(SCHEDULER_FAILURE)
    ) {
      console.log('✓ allowFallback:false returns a typed RtErrorException across the served worker')
      assertRtErrorWire('strict worker RtError', strict.error.rtError)
    } else {
      fail(`allowFallback:false did not return typed RtErrorException: ${JSON.stringify(strict.error)}`)
    }
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} console error(s):`)
    for (const e of errors.slice(0, 8)) console.error('   ' + e)
    process.exitCode = 1
  } else {
    console.log('✓ no JS console errors')
  }
} catch (e) {
  fail('smoke threw: ' + (e instanceof Error ? e.message : String(e)))
  for (const er of errors.slice(0, 8)) console.error('   console: ' + er)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED')
