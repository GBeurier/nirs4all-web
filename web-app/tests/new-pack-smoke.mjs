// Node smoke for the broad-model-pack additions, run against the STAGED methods
// WASM the app actually ships (src/engine/wasm/methods). Proves ECR, O2PLS (via
// the generic fitModel dispatcher), the AOM-Ridge blender + AOM operator-PLS
// stack bridges, and the DataTwinning / SystematicCircular splitters all fit,
// predict (finite + signal-correlated) and split through the real engine.
// Self-contained; ignores SMOKE_URL.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const methods = resolve(here, '..', 'src', 'engine', 'wasm', 'methods', 'index.js')
const n4m = await import(methods)
await n4m.loadModule()

let failed = 0
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { console.error('  ✗ ' + m); failed++ } }

const n = 60, p = 16
let s = 4242 >>> 0
const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
const beta = Array.from({ length: p }, (_, j) => (j % 4 === 0 ? 1.3 : j % 5 === 0 ? -0.6 : 0))
const Xd = new Float64Array(n * p)
const Yd = new Float64Array(n)
for (let i = 0; i < n; i++) {
  let yi = 3
  for (let j = 0; j < p; j++) {
    const v = rng() * 2 - 1 + Math.sin((i + j) * 0.05)
    Xd[i * p + j] = v
    yi += v * beta[j]
  }
  Yd[i] = yi + (rng() - 0.5) * 0.05
}
const X = { data: Xd, rows: n, cols: p }
const Y = { data: Yd, rows: n, cols: 1 }
const finite = (a) => a.length > 0 && Array.from(a).every((v) => Number.isFinite(v))
function corr(d) {
  const a = Array.from(d), b = Array.from(Yd)
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n
  let c = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2 }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : 0
}

const ecr = n4m.fitModel('ECR', X, Y, 6, [0.5])
ok(finite(ecr.coefficients) && corr(n4m.predictModel(ecr, X).data) > 0.8, 'ECR fits + predicts (correlated)')

const o2 = n4m.fitModel('O2PLS', X, Y, 6, [2, 1, 1])
ok(finite(o2.coefficients) && corr(n4m.predictModel(o2, X).data) > 0.5, 'O2PLS fits + predicts (correlated)')

const ridge = n4m.fitAomRidge(X, Y, { cv: 4 })
ok(finite(ridge.coefficients) && corr(n4m.predictModel(ridge, X).data) > 0.7, 'AOM-Ridge fits + predicts (correlated)')

const stack = n4m.fitAomStack(X, Y, { cv: 4, maxComponents: 8 })
ok(finite(stack.coefficients) && corr(n4m.predictModel(stack, X).data) > 0.7, 'AOM-Stack fits + predicts (correlated)')

for (const kind of ['DataTwinning', 'SystematicCircular']) {
  const mask = n4m.computeSplit(kind, X, kind === 'SystematicCircular' ? Y : null, { testSize: 0.25 })
  const nt = Array.from(mask).filter((v) => v === 1).length
  ok(mask.length === n && nt > 0 && nt < n, `${kind} split: ${nt}/${n} test rows`)
}

if (failed) { console.error(`NEW-PACK SMOKE FAILED (${failed})`); process.exit(1) }
console.log('NEW-PACK SMOKE OK')
