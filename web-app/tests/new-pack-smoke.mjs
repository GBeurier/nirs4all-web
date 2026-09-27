// Node smoke for the broad-model-pack methods, run against the STAGED methods
// WASM the app actually ships (src/engine/wasm/methods). Proves ECR, O2PLS, the
// AOM-Ridge blender and the AOM operator-PLS stack fit and predict (finite +
// signal-correlated), and the SPlit (twinning) / SystematicCircular splitters
// split, all through the generic n4m role API the engine uses (methodClass by
// method id). Self-contained; ignores SMOKE_URL.
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

const create = (methodId, params = {}) => {
  const m = new (n4m.methodClass(methodId))()
  m.params = params
  return m
}
const model = (methodId, params) => create(methodId, params).fit(X, Y)

ok(corr(model('models.specialized.ecr', { n_components: 6, alpha: 0.5 }).predict(X).data) > 0.8, 'ECR fits + predicts (correlated)')
ok(corr(model('models.multiblock.o2pls', { n_predictive: 2, n_x_orthogonal: 1, n_y_orthogonal: 1 }).predict(X).data) > 0.5, 'O2PLS fits + predicts (correlated)')
const ridge = model('aom_pop.ridge_blender', { cv: 4 }).predict(X).data
ok(finite(ridge) && corr(ridge) > 0.7, 'AOM-Ridge blender fits + predicts (correlated)')
const stack = model('aom_pop.operator_pls_stack', { cv: 4, components: [2, 4, 8] }).predict(X).data
ok(finite(stack) && corr(stack) > 0.7, 'AOM operator-PLS stack fits + predicts (correlated)')

for (const [methodId, y] of [['splitters.split_splitter', undefined], ['splitters.systematic_circular', Yd]]) {
  const [fold] = create(methodId, { test_size: 0.25 }).split(X, y)
  ok(fold.test.length > 0 && fold.train.length + fold.test.length === n, `${methodId} split: ${fold.test.length}/${n} test rows`)
}

if (failed) { console.error(`NEW-PACK SMOKE FAILED (${failed})`); process.exit(1) }
console.log('NEW-PACK SMOKE OK')
