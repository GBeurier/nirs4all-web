// Row-wise spectral preprocessing for the JS stub engine. Each operator is fit
// on training data (matters only for stateful ops like MSC) and then applied to
// any matrix with the same column count — mirroring fit/transform so test/predict
// data is corrected with train-derived state (no leakage).
import { type Mat, mat, colMeans, invSmall } from './linalg'

export interface Transformer {
  apply(m: Mat): Mat
}

const clampIdx = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i)

function rowwise(m: Mat, fn: (row: Float64Array, out: Float64Array) => void): Mat {
  const out = mat(m.rows, m.cols)
  for (let r = 0; r < m.rows; r++) {
    fn(m.data.subarray(r * m.cols, (r + 1) * m.cols), out.data.subarray(r * m.cols, (r + 1) * m.cols))
  }
  return out
}

// --- SNV ---
function snv(): Transformer {
  return {
    apply: (m) =>
      rowwise(m, (row, out) => {
        const n = row.length
        let mean = 0
        for (let i = 0; i < n; i++) mean += row[i]
        mean /= n
        let v = 0
        for (let i = 0; i < n; i++) v += (row[i] - mean) ** 2
        const sd = Math.sqrt(v / Math.max(1, n - 1)) || 1
        for (let i = 0; i < n; i++) out[i] = (row[i] - mean) / sd
      }),
  }
}

// --- MSC (stateful: reference = training column mean) ---
function msc(train: Mat): Transformer {
  return mscFromRef(colMeans(train))
}
/** Rebuild MSC from a stored reference vector (for predict() after a refit). */
export function mscFromRef(ref: Float64Array): Transformer {
  const p = ref.length
  let rmean = 0
  for (let i = 0; i < p; i++) rmean += ref[i]
  rmean /= p
  let sref = 0
  for (let i = 0; i < p; i++) sref += (ref[i] - rmean) ** 2
  sref = sref || 1e-12
  return {
    apply: (m) =>
      rowwise(m, (row, out) => {
        let xmean = 0
        for (let i = 0; i < p; i++) xmean += row[i]
        xmean /= p
        let cov = 0
        for (let i = 0; i < p; i++) cov += (row[i] - xmean) * (ref[i] - rmean)
        const b = cov / sref || 1 // slope
        const a = xmean - b * rmean // intercept
        for (let i = 0; i < p; i++) out[i] = (row[i] - a) / (b || 1e-12)
      }),
  }
}

// --- Savitzky–Golay convolution weights for offset -h..h ---
function sgWeights(window: number, polyorder: number, deriv: number): Float64Array {
  const m = window % 2 === 0 ? window + 1 : window
  const h = (m - 1) / 2
  const order = Math.min(polyorder, m - 1)
  // design A: m × (order+1), A[i][j] = (i-h)^j
  const ncol = order + 1
  // normal equations AtA (ncol×ncol), and we need row `deriv` of (AtA)^-1 At
  const AtA: number[][] = Array.from({ length: ncol }, () => new Array(ncol).fill(0))
  for (let i = 0; i < m; i++) {
    const x = i - h
    const pw = new Array(ncol)
    pw[0] = 1
    for (let j = 1; j < ncol; j++) pw[j] = pw[j - 1] * x
    for (let a = 0; a < ncol; a++) for (let b = 0; b < ncol; b++) AtA[a][b] += pw[a] * pw[b]
  }
  const inv = invSmall(AtA)
  // weights[i] = sum_b inv[deriv][b] * (i-h)^b ; times deriv! for derivative scaling
  let fact = 1
  for (let k = 2; k <= deriv; k++) fact *= k
  const w = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const x = i - h
    let pw = 1
    let s = 0
    for (let b = 0; b < ncol; b++) {
      s += inv[deriv] ? inv[deriv][b] * pw : 0
      pw *= x
    }
    w[i] = s * fact
  }
  return w
}

function convolveRowwise(m: Mat, w: Float64Array): Mat {
  const h = (w.length - 1) / 2
  return rowwise(m, (row, out) => {
    const n = row.length
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let k = 0; k < w.length; k++) s += w[k] * row[clampIdx(i + k - h, n)]
      out[i] = s
    }
  })
}

function savitzkyGolay(params: Record<string, unknown>): Transformer {
  const window = Number(params.window ?? 11)
  const polyorder = Number(params.polyorder ?? 2)
  const deriv = Number(params.deriv ?? 0)
  const w = sgWeights(window, polyorder, deriv)
  return { apply: (m) => convolveRowwise(m, w) }
}

// --- finite-difference derivative ---
function derivative(params: Record<string, unknown>): Transformer {
  const order = Number(params.order ?? 1)
  const gap = Math.max(1, Number(params.gap ?? 1))
  const step = (m: Mat) =>
    rowwise(m, (row, out) => {
      const n = row.length
      for (let i = 0; i < n; i++) out[i] = row[clampIdx(i + gap, n)] - row[clampIdx(i - gap, n)]
    })
  return {
    apply: (m) => {
      let r = step(m)
      for (let o = 1; o < order; o++) r = step(r)
      return r
    },
  }
}

// --- detrend (remove polynomial trend over the index axis) ---
function detrend(params: Record<string, unknown>): Transformer {
  const degree = Math.max(0, Number(params.degree ?? 1))
  return {
    apply: (m) =>
      rowwise(m, (row, out) => {
        const n = row.length
        const ncol = degree + 1
        // least squares fit of polynomial(index) to row
        const AtA: number[][] = Array.from({ length: ncol }, () => new Array(ncol).fill(0))
        const Atb = new Array(ncol).fill(0)
        for (let i = 0; i < n; i++) {
          const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0
          const pw = new Array(ncol)
          pw[0] = 1
          for (let j = 1; j < ncol; j++) pw[j] = pw[j - 1] * x
          for (let a = 0; a < ncol; a++) {
            Atb[a] += pw[a] * row[i]
            for (let b = 0; b < ncol; b++) AtA[a][b] += pw[a] * pw[b]
          }
        }
        const inv = invSmall(AtA)
        const coef = new Array(ncol).fill(0)
        for (let a = 0; a < ncol; a++) for (let b = 0; b < ncol; b++) coef[a] += inv[a][b] * Atb[b]
        for (let i = 0; i < n; i++) {
          const x = n > 1 ? (i / (n - 1)) * 2 - 1 : 0
          let trend = 0
          let pw = 1
          for (let a = 0; a < ncol; a++) {
            trend += coef[a] * pw
            pw *= x
          }
          out[i] = row[i] - trend
        }
      }),
  }
}

// --- normalize (per-row vector norm) ---
function normalize(params: Record<string, unknown>): Transformer {
  const norm = String(params.norm ?? 'l2')
  return {
    apply: (m) =>
      rowwise(m, (row, out) => {
        const n = row.length
        let s = 0
        if (norm === 'l1') for (let i = 0; i < n; i++) s += Math.abs(row[i])
        else if (norm === 'max') for (let i = 0; i < n; i++) s = Math.max(s, Math.abs(row[i]))
        else for (let i = 0; i < n; i++) s += row[i] * row[i]
        const d = (norm === 'l2' ? Math.sqrt(s) : s) || 1e-12
        for (let i = 0; i < n; i++) out[i] = row[i] / d
      }),
  }
}

// --- gaussian smoothing ---
function gaussian(params: Record<string, unknown>): Transformer {
  const sigma = Math.max(0.25, Number(params.sigma ?? 2))
  const h = Math.max(1, Math.ceil(sigma * 3))
  const w = new Float64Array(2 * h + 1)
  let sum = 0
  for (let k = -h; k <= h; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma))
    w[k + h] = v
    sum += v
  }
  for (let k = 0; k < w.length; k++) w[k] /= sum
  return { apply: (m) => convolveRowwise(m, w) }
}

/** Build a fitted transformer for a DSL `type` using training data. */
export function makeTransformer(type: string, params: Record<string, unknown>, train: Mat): Transformer {
  switch (type) {
    case 'StandardNormalVariate':
      return snv()
    case 'MSC':
      return msc(train)
    case 'SavitzkyGolay':
      return savitzkyGolay(params)
    case 'Derivative':
      return derivative(params)
    case 'Detrend':
      return detrend(params)
    case 'Normalize':
      return normalize(params)
    case 'GaussianFilter':
      return gaussian(params)
    default:
      // Offline JS implements only this core set; the served build runs every
      // catalog operator via libn4m. Fail loudly rather than silently applying
      // identity (which would mislabel an un-run step as "preprocessed").
      throw new Error(`Offline mode has no transform for "${type}"; it needs the served build (libn4m).`)
  }
}
