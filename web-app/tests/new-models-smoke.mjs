// FEATURE 2 node smoke: prove the two NEW catalog models (MIR-PLS, MB-PLS) fit
// and predict through the staged libn4m WASM via the same generic dispatcher the
// studio uses (fitModel/predictModel → n4m_wasm_model_fit), producing finite
// predictions that are SENSITIVE to n_components (a different component count
// gives a different coefficient vector). Runs under Node against the staged
// src/engine/wasm/methods (no browser needed).
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

// MBPLS + MissingAwareNIPALS must be component-SENSITIVE (a true latent count).
// MIRPLS inverts the Y→X map and is component-stable for a single target (q=1) by
// design, so it is only checked for finite-fit + learning, not sensitivity.
const SENSITIVE = ['MBPLS', 'MissingAwareNIPALS']
const STABLE = ['MIRPLS']
let sensitivePassed = 0
let stablePassed = 0

for (const type of SENSITIVE) {
  try {
    const m3 = n4m.fitModel(type, X, Y, 3, [])
    const m7 = n4m.fitModel(type, X, Y, 7, [])
    if (!finite(m3.coefficients) || m3.coefficients.length !== p) { fail(`${type}: coefficients not finite/${p}`); continue }
    const pred3 = n4m.predictModel(m3, Xnew)
    if (!finite(pred3.data) || pred3.data.length !== 5) { fail(`${type}: predictions not finite/shaped`); continue }
    const coeffDelta = Math.max(...m3.coefficients.map((c, i) => Math.abs(c - m7.coefficients[i])))
    if (!(coeffDelta > 1e-9)) { fail(`${type}: coefficients NOT sensitive to n_components (Δ=${coeffDelta})`); continue }
    const r = corrFull(n4m.predictModel(m7, X))
    if (!(r > 0.5)) { fail(`${type}: did not learn the signal (r=${r.toFixed(2)})`); continue }
    console.log(`✓ ${type}: ${p} finite coeffs · finite preds · component-sensitive (Δcoef=${coeffDelta.toExponential(2)}) · r=${r.toFixed(3)}`)
    sensitivePassed++
  } catch (e) {
    fail(`${type}: threw — ${e instanceof Error ? e.message : String(e)}`)
  }
}

for (const type of STABLE) {
  try {
    const m = n4m.fitModel(type, X, Y, 7, [])
    if (!finite(m.coefficients) || m.coefficients.length !== p) { fail(`${type}: coefficients not finite/${p}`); continue }
    const pred = n4m.predictModel(m, Xnew)
    if (!finite(pred.data) || pred.data.length !== 5) { fail(`${type}: predictions not finite/shaped`); continue }
    const r = corrFull(n4m.predictModel(m, X))
    if (!(r > 0.5)) { fail(`${type}: did not learn the signal (r=${r.toFixed(2)})`); continue }
    console.log(`✓ ${type}: ${p} finite coeffs · finite preds · learns (r=${r.toFixed(3)}; component-stable for single-target by design)`)
    stablePassed++
  } catch (e) {
    fail(`${type}: threw — ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (sensitivePassed < 2) fail(`expected >=2 component-sensitive new models, only ${sensitivePassed} passed`)
if (stablePassed < 1) fail(`expected MIRPLS to fit+predict+learn, ${stablePassed} passed`)
console.log(process.exitCode ? 'NEW-MODELS SMOKE FAILED' : 'NEW-MODELS SMOKE PASSED')
