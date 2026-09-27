// Model node smoke: catalog models (MIR-PLS, missing-aware NIPALS, PLS, CPPLS)
// fit and predict through the staged libn4m WASM via the generic n4m role API the
// engine uses (methodClass(method_id) → fit → predict), producing finite
// predictions that are SENSITIVE to n_components where the method has a true
// latent count, and N4ME exports that reload and predict bit-identically. Runs
// under Node against the staged src/engine/wasm/methods (no browser needed).
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const methods = resolve(here, '..', 'src', 'engine', 'wasm', 'methods', 'index.js')
const n4m = await import(methods)
await n4m.loadModule()

function fail(msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
}

// A small structured regression problem: y depends on a few wavelengths.
const n = 40
const p = 12
const rng = (() => { let s = 12345 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
const beta = Array.from({ length: p }, (_, j) => (j % 4 === 0 ? 1.4 : j % 3 === 0 ? -0.7 : 0))
const Xd = new Float64Array(n * p)
const Yd = new Float64Array(n)
for (let i = 0; i < n; i++) {
  let yi = 2
  for (let j = 0; j < p; j++) {
    const v = rng() * 2 - 1 + Math.sin((i + j) * 0.07)
    Xd[i * p + j] = v
    yi += v * beta[j]
  }
  Yd[i] = yi + (rng() - 0.5) * 0.05
}
const X = { data: Xd, rows: n, cols: p }
const Y = { data: Yd, rows: n, cols: 1 }
// a few rows to predict on
const Xnew = { data: Xd.slice(0, 5 * p), rows: 5, cols: p }

function finite(arr) {
  return arr.length > 0 && Array.from(arr).every((v) => Number.isFinite(v))
}

// Pearson r between a prediction vector and the (training) truth — proves the
// model actually learns the signal.
function corrFull(pred) {
  const yhat = Array.from(pred.data)
  const yt = Array.from(Yd)
  const mh = yhat.reduce((a, b) => a + b, 0) / n
  const mt = yt.reduce((a, b) => a + b, 0) / n
  let cov = 0, vh = 0, vt = 0
  for (let i = 0; i < n; i++) { cov += (yhat[i] - mh) * (yt[i] - mt); vh += (yhat[i] - mh) ** 2; vt += (yt[i] - mt) ** 2 }
  return vh > 0 && vt > 0 ? cov / Math.sqrt(vh * vt) : 0
}

const fit = (methodId, params) => {
  const est = new (n4m.methodClass(methodId))()
  est.params = params
  return est.fit(X, Y)
}
// N4ME round trip: the reloaded estimator predicts exactly like the fitted one.
function roundTrips(est) {
  const again = n4m.NativeEstimator.fromN4me(est.toN4me())
  const a = est.predict(X).data
  const b = again.predict(X).data
  again.dispose()
  return again.methodId === est.methodId && a.every((v, i) => v === b[i])
}

// Component-SENSITIVE models (a true latent count). MIRPLS inverts the Y→X map
// and is component-stable for a single target (q=1) by design, so it is only
// checked for finite-fit + learning, not sensitivity.
const SENSITIVE = ['models.specialized.missing_aware_nipals', 'models.pls.pls_regression', 'models.pls.cppls']
const STABLE = ['models.multiblock.mir_pls']
let sensitivePassed = 0
let stablePassed = 0

for (const id of SENSITIVE) {
  try {
    const m3 = fit(id, { n_components: 3 })
    const m7 = fit(id, { n_components: 7 })
    const pred3 = m3.predict(Xnew)
    if (!finite(pred3.data) || pred3.data.length !== 5) { fail(`${id}: predictions not finite/shaped`); continue }
    const delta = Math.max(...Array.from(m3.predict(X).data, (v, i) => Math.abs(v - m7.predict(X).data[i])))
    if (!(delta > 1e-9)) { fail(`${id}: predictions NOT sensitive to n_components (Δ=${delta})`); continue }
    const r = corrFull(m7.predict(X))
    if (!(r > 0.5)) { fail(`${id}: did not learn the signal (r=${r.toFixed(2)})`); continue }
    if (!roundTrips(m7)) { fail(`${id}: N4ME reload does not predict identically`); continue }
    console.log(`✓ ${id}: finite preds · component-sensitive (Δpred=${delta.toExponential(2)}) · r=${r.toFixed(3)} · N4ME round trip exact`)
    m3.dispose()
    m7.dispose()
    sensitivePassed++
  } catch (e) {
    fail(`${id}: threw — ${e instanceof Error ? e.message : String(e)}`)
  }
}

for (const id of STABLE) {
  try {
    const m = fit(id, { n_components: 7 })
    const pred = m.predict(Xnew)
    if (!finite(pred.data) || pred.data.length !== 5) { fail(`${id}: predictions not finite/shaped`); continue }
    const r = corrFull(m.predict(X))
    if (!(r > 0.5)) { fail(`${id}: did not learn the signal (r=${r.toFixed(2)})`); continue }
    if (!roundTrips(m)) { fail(`${id}: N4ME reload does not predict identically`); continue }
    console.log(`✓ ${id}: finite preds · learns (r=${r.toFixed(3)}; component-stable for single-target by design) · N4ME round trip exact`)
    m.dispose()
    stablePassed++
  } catch (e) {
    fail(`${id}: threw — ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (sensitivePassed < SENSITIVE.length) fail(`expected ${SENSITIVE.length} component-sensitive models, only ${sensitivePassed} passed`)
if (stablePassed < 1) fail(`expected MIRPLS to fit+predict+learn, ${stablePassed} passed`)
console.log(process.exitCode ? 'NEW-MODELS SMOKE FAILED' : 'NEW-MODELS SMOKE PASSED')
